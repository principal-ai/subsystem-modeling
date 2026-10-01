/**
 * SubsystemReposMap — the Subsystems tab's File City map.
 *
 * Renders one full-file city per repo referenced by the listed subsystem
 * models into `FileCityGuidePanel`'s repo-overview mode: with no repo selected
 * the cities fill the canvas and a repo picker floats top-left; selecting a
 * repo slides the map right and opens that repo's subsystem models +
 * trails in the left column (clicking one opens the model tab).
 *
 * Cities are built from each repo's own checkout, resolved from its purl via
 * the Alexandria registry (the host's `getRepoFileTree` RPC). Files referenced
 * by a repo's subsystem models are lit as a highlight layer on that repo's
 * city, attached by building membership in the mode.
 */

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import {
	PanelEventBus,
	type DataSlice,
	type PanelContextValue,
	type PanelEventEmitter,
} from "@principal-ade/panel-framework-core";
import {
	GitFileTreeBuilder,
	type FileTree,
} from "@principal-ai/repository-abstraction";
import {
	FileCityGuidePanel,
	buildCityDataFromContext,
	type FileCityGuidePanelActions,
	type FileCityGuidePanelContext,
	type RepoOverviewModel,
	type RepoOverviewView,
} from "@industry-theme/file-city-panel";
import type { CitySource } from "@principal-ai/file-city-react";
import {
	purlOwnerName,
	purlRepoKey,
	repoAvatarUrl,
} from "@principal-ai/subsystems-react";
import type { SubsystemModelSummary } from "../../shared/contract";
import { electrobun } from "../rpc";
import { CenteredMessage } from "../ui";

/** Grid placement for N repo cities: roughly square, filled row-major. */
function repoGridLayout(count: number): { col: number; row: number }[] {
	const cols = Math.ceil(Math.sqrt(count));
	return Array.from({ length: count }, (_, i) => ({
		col: i % cols,
		row: Math.floor(i / cols),
	}));
}

interface RepoDescriptor {
	/** Purl repo key (`pkg:github/owner/name`) — the tree-fetch key. */
	repoKey: string;
	/** Representative purl for this repo (first seen). */
	purl: string;
	/** Stable label — must equal the matching `CitySource.label`. */
	label: string;
	owner?: string;
	name?: string;
	avatarUrl?: string;
	/** Repo-relative paths referenced by this repo's subsystem models. */
	referencedFiles: string[];
	/** Models touching this repo, with the trails sited in it. */
	models: RepoOverviewModel[];
}

/**
 * Group the listed graphs by purl repo key. A repo's referenced files come from
 * its component anchors (`summary.files`) plus every trail step/file
 * sited in it; its models are the graphs that touch it, each carrying only the
 * trails whose steps land in this repo.
 */
function buildRepoDescriptors(
	graphs: SubsystemModelSummary[],
): RepoDescriptor[] {
	const byKey = new Map<
		string,
		RepoDescriptor & { referencedSet: Set<string>; modelsById: Map<string, RepoOverviewModel> }
	>();
	const order: string[] = [];

	for (const g of graphs) {
		// repoKey → { purl, file } refs this graph attributes to that repo.
		const refsByRepo = new Map<string, Array<{ purl: string; file: string }>>();
		const addFile = (file: string, purl?: string) => {
			const key = purlRepoKey(purl);
			if (!key) return;
			const arr = refsByRepo.get(key) ?? [];
			arr.push({ purl: purl ?? key, file });
			refsByRepo.set(key, arr);
		};
		for (const f of g.files ?? []) addFile(f.file, f.purl);
		for (const w of g.trails ?? []) {
			for (const f of w.files ?? []) addFile(f.file, f.purl);
			for (const s of w.steps ?? []) addFile(s.file, s.purl);
		}

		for (const [key, refs] of refsByRepo) {
			let d = byKey.get(key);
			if (!d) {
				const ownerName = purlOwnerName(refs[0]!.purl) ?? "";
				const [owner, name] = ownerName.split("/");
				const label = owner && name ? `${owner}/${name}` : name || owner || key;
				d = {
					repoKey: key,
					purl: refs[0]!.purl,
					label,
					owner,
					name,
					avatarUrl: repoAvatarUrl(refs[0]!.purl),
					referencedFiles: [],
					referencedSet: new Set(),
					models: [],
					modelsById: new Map(),
				};
				byKey.set(key, d);
				order.push(key);
			}
			for (const r of refs) {
				if (!d.referencedSet.has(r.file)) {
					d.referencedSet.add(r.file);
					d.referencedFiles.push(r.file);
				}
			}

			let model = d.modelsById.get(g.id);
			if (!model) {
				model = {
					id: g.id,
					title: g.title,
					description: g.description,
					// `walkthroughs` is the panel's own field name, not ours.
					// `@industry-theme/file-city-panel` still models this concept
					// as `RepoOverviewModel.walkthroughs` / `RepoOverviewWalkthrough`,
					// so the boundary keeps its vocabulary while everything inside
					// Studio says `trails`. Flip these two names together when the
					// panel package is updated.
					walkthroughs: [],
				};
				d.modelsById.set(g.id, model);
				d.models.push(model);
			}
			for (const w of g.trails ?? []) {
				const touches = [...(w.files ?? []), ...(w.steps ?? [])].some(
					(f) => purlRepoKey(f.purl) === key,
				);
				if (touches && !model.walkthroughs!.some((x) => x.id === w.id)) {
					model.walkthroughs!.push({
						id: w.id,
						title: w.title,
						stepCount: w.stepCount,
					});
				}
			}
		}
	}

	return order.map((k) => byKey.get(k)!);
}

function normalizeRepoPath(path: string): string {
	return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\//, "");
}

/** Referenced model files that exist in the checkout, over every checkout file. */
function coverageForRepo(
	referencedFiles: readonly string[],
	tree: FileTree,
): { percent: number; referenced: number; total: number } {
	const all = new Set(
		tree.allFiles.map((f) => normalizeRepoPath(f.relativePath || f.path)),
	);
	const seen = new Set<string>();
	let referenced = 0;
	for (const file of referencedFiles) {
		const path = normalizeRepoPath(file);
		if (!path || seen.has(path) || !all.has(path)) continue;
		seen.add(path);
		referenced++;
	}
	const total = all.size;
	const percent = total === 0 ? 0 : Math.round((referenced / total) * 100);
	return { percent, referenced, total };
}

export function SubsystemReposMap({
	graphs,
	onOpenModel,
	onFileCoverage,
	selectedRepoKey,
	onSelectRepo,
	onOpenFile,
}: {
	graphs: SubsystemModelSummary[];
	/** Open a model (optionally at a trail) as a subsystem-model tab. */
	onOpenModel: (graphId: string, trailId?: string) => void;
	/**
	 * Repo key → share of that repo's checkout referenced by subsystem models.
	 * Reported as each city tree finishes loading, for the map's repo rows.
	 */
	onFileCoverage?: (
		coverage: ReadonlyMap<
			string,
			{ percent: number; referenced: number; total: number }
		>,
	) => void;
	/**
	 * Host-owned selection, keyed by purl repo key (the same key the tab's
	 * `FilesDrilldown`/`focusedRepo` uses). Maps to the panel's repo `label`.
	 */
	selectedRepoKey: string | null;
	/** Forward a map city-label click back to the host's selection state. */
	onSelectRepo: (repoKey: string | null) => void;
	/**
	 * Fired when a building on the map is clicked. The mode emits a `file:open`
	 * panel event with the repo-relative path; this resolves which repo's city
	 * contains it (preferring the selected repo) and hands the pair up so the
	 * host can open the file (e.g. in its preview pane).
	 */
	onOpenFile?: (file: { repoKey: string | undefined; displayPath: string }) => void;
}) {
	const { theme } = useTheme();
	const descriptors = useMemo(() => buildRepoDescriptors(graphs), [graphs]);
	const [trees, setTrees] = useState<Map<string, FileTree>>(new Map());
	const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());

	// The panel keys repos by `label` (owner/name); the host keys them by purl
	// repo key. Translate the host's selection into the panel's label.
	const selectedLabel = useMemo(() => {
		if (!selectedRepoKey) return null;
		return descriptors.find((d) => d.repoKey === selectedRepoKey)?.label ?? null;
	}, [descriptors, selectedRepoKey]);

	// Fetch missing repo trees one per cycle (sequential so a big repo set
	// doesn't hammer the host with concurrent walks). Failures are skipped.
	useEffect(() => {
		const missing = descriptors.find(
			(d) => !trees.has(d.repoKey) && !failed.has(d.repoKey),
		);
		if (!missing) return;
		let cancelled = false;
		(async () => {
			try {
				const res = await electrobun.rpc!.request.getRepoFileTree({
					purl: missing.repoKey,
				});
				if (cancelled) return;
				if (!res.files || res.files.length === 0) {
					setFailed((prev) => new Set(prev).add(missing.repoKey));
					return;
				}
				const tree = new GitFileTreeBuilder().build({
					files: res.files,
					rootPath: "/local",
					commitSha: "local",
					branch: "local",
				});
				setTrees((prev) => {
					const next = new Map(prev);
					next.set(missing.repoKey, tree);
					return next;
				});
			} catch (err) {
				console.error("[SubsystemReposMap] getRepoFileTree failed:", missing.repoKey, err);
				setFailed((prev) => new Set(prev).add(missing.repoKey));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [descriptors, trees, failed]);

	// File coverage for the left repo rows: referenced model files ÷ files in
	// the checkout the city was built from. Repos still loading are omitted.
	useEffect(() => {
		if (!onFileCoverage) return;
		const next = new Map<
			string,
			{ percent: number; referenced: number; total: number }
		>();
		for (const d of descriptors) {
			const tree = trees.get(d.repoKey);
			if (!tree) continue;
			next.set(d.repoKey, coverageForRepo(d.referencedFiles, tree));
		}
		onFileCoverage(next);
	}, [descriptors, trees, onFileCoverage]);

	const ready = useMemo(
		() => descriptors.filter((d) => trees.has(d.repoKey)),
		[descriptors, trees],
	);

	const citySources = useMemo<CitySource[] | undefined>(() => {
		if (ready.length === 0) return undefined;
		const layout = repoGridLayout(ready.length);
		const sources: CitySource[] = [];
		ready.forEach((d, i) => {
			const tree = trees.get(d.repoKey);
			if (!tree) return;
			const city = buildCityDataFromContext({ fileTree: tree, lineCounts: null });
			sources.push({
				cityData: city,
				positionOffset: { x: 0, z: 0 },
				gridCell: layout[i],
				label: d.label,
				ownerAvatarUrl: d.avatarUrl,
			});
		});
		return sources.length > 0 ? sources : undefined;
	}, [ready, trees]);

	const view = useMemo<RepoOverviewView | null>(() => {
		if (descriptors.length === 0) return null;
		return {
			repos: descriptors.map((d) => ({
				label: d.label,
				owner: d.owner,
				name: d.name,
				avatarUrl: d.avatarUrl,
				referencedFiles: d.referencedFiles,
				models: d.models,
			})),
			// Repo selection is host-owned: the tab's FilesDrilldown sets the
			// repo key, the panel only renders + frames from the mapped label.
			selectedLabel,
		};
	}, [descriptors, selectedLabel]);

	const primaryTree = ready.length > 0 ? trees.get(ready[0]!.repoKey) ?? null : null;

	const context = useMemo<PanelContextValue<FileCityGuidePanelContext>>(() => {
		const fileTreeSlice: DataSlice<FileTree> = {
			scope: "repository",
			name: "fileTree",
			data: primaryTree,
			loading: !primaryTree,
			error: null,
			refresh: async () => {},
		};
		const nullSlice: DataSlice<null> = {
			scope: "repository",
			name: "null",
			data: null,
			loading: false,
			error: null,
			refresh: async () => {},
		};
		return {
			currentScope: { type: "repository" },
			refresh: async () => {},
			fileTree: fileTreeSlice,
			lineCounts: nullSlice,
			tour: nullSlice,
			highlightLayers: nullSlice,
			repoOverview: {
				scope: "repository",
				name: "repoOverview",
				data: view,
				loading: !view,
				error: null,
				refresh: async () => {},
			},
			repository: null,
		};
	}, [view, primaryTree]);

	const actions = useMemo<FileCityGuidePanelActions>(
		() => ({
			openFile: () => {},
			// `walkthroughId` is the panel's arg name (see the note on the
			// RepoOverviewModel construction above); Studio's own naming is `trailId`.
			openRepoOverviewModel: ({ modelId, walkthroughId }) =>
				onOpenModel(modelId, walkthroughId),
			// A city-label click on the map routes back to the host's selection
			// state, translated from the panel's label to the purl repo key.
			onRepoOverviewSelect: (label) => {
				const d = label
					? descriptors.find((x) => x.label === label)
					: null;
				onSelectRepo(d?.repoKey ?? null);
			},
		}),
		[onOpenModel, descriptors, onSelectRepo],
	);

	const events = useMemo<PanelEventEmitter>(() => new PanelEventBus(), []);

	// Map building clicks arrive as `file:open` events (payload `{ path }`).
	// Resolve which repo's city contains the path — preferring the selected
	// repo when the path is shared — and hand it to the host.
	useEffect(() => {
		if (!onOpenFile) return;
		const contains = (source: CitySource, path: string) =>
			source.cityData.buildings.some((b) => b.path === path);
		const off = events.on<{ path?: string }>("file:open", (event) => {
			const path = event.payload?.path;
			if (!path) return;
			const sources = citySources ?? [];
			const selected = selectedRepoKey
				? sources.find((s) => s.label === selectedLabel)
				: undefined;
			const owner =
				(selected && contains(selected, path) ? selected : undefined) ??
				sources.find((s) => contains(s, path));
			const repoKey = owner
				? descriptors.find((d) => d.label === owner.label)?.repoKey
				: undefined;
			onOpenFile({ repoKey, displayPath: path });
		});
		return off;
	}, [
		events,
		onOpenFile,
		citySources,
		descriptors,
		selectedLabel,
		selectedRepoKey,
	]);

	if (descriptors.length === 0) {
		return (
			<CenteredMessage
				title="No repos to map"
				detail="Subsystem models in this tab reference no resolvable repos."
			/>
		);
	}

	if (!citySources) {
		return <CenteredMessage title="Building repo cities…" />;
	}

	return (
		<div
			style={{
				flex: 1,
				minWidth: 0,
				minHeight: 0,
				display: "flex",
				background: theme.colors.background,
			}}
		>
			<FileCityGuidePanel
				context={context}
				actions={actions}
				events={events}
				citySources={citySources}
			/>
		</div>
	);
}

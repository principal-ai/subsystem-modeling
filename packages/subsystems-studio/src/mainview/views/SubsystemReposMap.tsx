/**
 * SubsystemReposMap — the Subsystems tab's Map view: one coverage card per repo.
 *
 * Each repo referenced by the listed subsystem models becomes a square card
 * with its File City checkout and one highlight layer per model (see
 * `SubsystemCoverageMapCards`). Coverage — the share of the checkout the
 * models reference — is reported upward for the left repo rows to badge.
 *
 * Cities are built lazily from each repo's own checkout, resolved from its
 * purl via the Alexandria registry (the host's `getRepoFileTree` RPC), one at
 * a time so a large repo set does not hammer the host. Cards render as their
 * city finishes loading; repos whose checkout cannot be read never render.
 */

import { useEffect, useMemo, useState } from "react";
import {
	MultiVersionCityBuilder,
	type CityData,
} from "@principal-ai/file-city-react";
import { GitFileTreeBuilder } from "@principal-ai/repository-abstraction";
import {
	purlOwnerName,
	purlRepoKey,
	repoAvatarUrl,
} from "@principal-ai/subsystems-react";
import type { SubsystemModelSummary } from "../../shared/contract";
import {
	coverageForRepo,
	normalizeCoveragePath,
	SubsystemCoverageMapCards,
	type RepoCoverage,
	type SubsystemCoverageModel,
	type SubsystemCoverageRepo,
} from "../components/SubsystemCoverageMapCards";
import type { RepoFileCoverage } from "../components/FilesDrilldown";
import { electrobun } from "../rpc";
import { CenteredMessage } from "../ui";

/** A model's files inside one repo, built as the listing is walked. */
interface RepoModelDraft {
	id: string;
	title: string;
	files: Set<string>;
}

/** A repo referenced by at least one listed model. */
interface RepoDescriptor {
	/** Purl repo key (`pkg:github/owner/name`) — the tree-fetch key. */
	repoKey: string;
	/** Representative purl for this repo (first seen). */
	purl: string;
	/** Stable label — `owner/name` when the purl carries both. */
	label: string;
	owner?: string;
	name?: string;
	avatarUrl?: string;
	/** Model id → that model's anchored files in this repo. */
	models: Map<string, RepoModelDraft>;
}

/**
 * Group the listed graphs by purl repo key. A repo's models come from every
 * component file and every trail step/file sited in it; a model stays in each
 * repo it touches, with only that repo's file set.
 */
function buildRepoDescriptors(
	graphs: readonly SubsystemModelSummary[],
): RepoDescriptor[] {
	const byKey = new Map<string, RepoDescriptor>();
	const order: string[] = [];

	for (const graph of graphs) {
		// repoKey → files this graph attributes to that repo.
		const refsByRepo = new Map<string, Array<{ purl: string; file: string }>>();
		const addFile = (file: string, purl?: string) => {
			const key = purlRepoKey(purl);
			if (!key) return;
			const arr = refsByRepo.get(key) ?? [];
			arr.push({ purl: purl ?? key, file: normalizeCoveragePath(file) });
			refsByRepo.set(key, arr);
		};
		for (const file of graph.files ?? []) addFile(file.file, file.purl);
		for (const trail of graph.trails ?? []) {
			for (const file of trail.files ?? []) addFile(file.file, file.purl);
			for (const step of trail.steps ?? []) addFile(step.file, step.purl);
		}

		for (const [key, refs] of refsByRepo) {
			let descriptor = byKey.get(key);
			if (!descriptor) {
				const ownerName = purlOwnerName(refs[0]!.purl) ?? "";
				const [owner, name] = ownerName.split("/");
				descriptor = {
					repoKey: key,
					purl: refs[0]!.purl,
					label: owner && name ? `${owner}/${name}` : name || owner || key,
					owner,
					name,
					avatarUrl: repoAvatarUrl(refs[0]!.purl),
					models: new Map(),
				};
				byKey.set(key, descriptor);
				order.push(key);
			}
			let model = descriptor.models.get(graph.id);
			if (!model) {
				model = { id: graph.id, title: graph.title, files: new Set() };
				descriptor.models.set(graph.id, model);
			}
			for (const ref of refs) {
				if (ref.file) model.files.add(ref.file);
			}
		}
	}

	return order.map((key) => byKey.get(key)!);
}

/** A repo's checkout laid out as a city. */
interface RepoCity {
	city: CityData;
}

/**
 * Build one repo's city. `MultiVersionCityBuilder` is the same layout the Sky
 * view's In Progress cards use, so the story and Studio render identically.
 */
function buildRepoCity(files: Array<{ path: string; size?: number }>): RepoCity {
	const tree = new GitFileTreeBuilder().build({
		files,
		rootPath: "/local",
		commitSha: "local",
		branch: "local",
	});
	const { unionCity } = MultiVersionCityBuilder.build(new Map([["working", tree]]));
	return { city: unionCity };
}

export function SubsystemReposMap({
	graphs,
	onFileCoverage,
	selectedRepoKeys,
	onToggleRepo,
	onHoverRepo,
	hoveredModelId,
	onOpenFile,
}: {
	graphs: SubsystemModelSummary[];
	/**
	 * Repo key → share of that repo's checkout referenced by subsystem models.
	 * Reported as each city finishes loading.
	 */
	onFileCoverage?: (coverage: ReadonlyMap<string, RepoFileCoverage>) => void;
	/**
	 * Repos currently filtering the list — card headers highlight while
	 * selected and clicking one toggles it in the filter set.
	 */
	selectedRepoKeys: ReadonlySet<string>;
	/** Toggle a repo in the list's filter set. */
	onToggleRepo: (repoKey: string) => void;
	/** Report card hover (repo key, or null on leave). */
	onHoverRepo?: (repoKey: string | null) => void;
	/** Model hovered via the list — cards isolate its layer. */
	hoveredModelId?: string | null;
	/**
	 * Fired when a building on a map is clicked. The card knows which repo's
	 * city it is, so the repo key travels with the repo-relative path.
	 */
	onOpenFile?: (file: { repoKey: string | undefined; displayPath: string }) => void;
}) {
	const descriptors = useMemo(() => buildRepoDescriptors(graphs), [graphs]);
	const [trees, setTrees] = useState<Map<string, RepoCity>>(new Map());
	const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());

	// Fetch missing repo trees one per cycle (sequential so a big repo set
	// doesn't hammer the host with concurrent walks). Failures are skipped.
	useEffect(() => {
		const missing = descriptors.find(
			(descriptor) =>
				!trees.has(descriptor.repoKey) && !failed.has(descriptor.repoKey),
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
				const entry = buildRepoCity(res.files);
				setTrees((prev) => {
					const next = new Map(prev);
					next.set(missing.repoKey, entry);
					return next;
				});
			} catch (err) {
				console.error(
					"[SubsystemReposMap] getRepoFileTree failed:",
					missing.repoKey,
					err,
				);
				setFailed((prev) => new Set(prev).add(missing.repoKey));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [descriptors, trees, failed]);

	/** The model file sets in the shape the cards consume. */
	const modelsFor = (descriptor: RepoDescriptor): SubsystemCoverageModel[] =>
		Array.from(descriptor.models.values()).map((model) => ({
			id: model.id,
			title: model.title,
			files: Array.from(model.files),
		}));

	// File coverage for the left repo rows: referenced model files ÷ files in
	// the checkout the city was built from. Repos still loading are omitted.
	useEffect(() => {
		if (!onFileCoverage) return;
		const next = new Map<string, RepoFileCoverage>();
		for (const descriptor of descriptors) {
			const entry = trees.get(descriptor.repoKey);
			if (!entry) continue;
			const coverage: RepoCoverage = coverageForRepo(
				entry.city,
				modelsFor(descriptor),
			);
			next.set(descriptor.repoKey, coverage);
		}
		onFileCoverage(next);
		// `modelsFor` is derived from `descriptors`; listing them is enough.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [descriptors, trees, onFileCoverage]);

	const repos = useMemo<SubsystemCoverageRepo[]>(
		() =>
			descriptors
				// Only repos whose checkout resolved get a card — pending and
				// failed repos never render, so the grid fills in instead of
				// thinning out as fetches settle.
				.filter((descriptor) => trees.has(descriptor.repoKey))
				.map((descriptor) => ({
					repoKey: descriptor.repoKey,
					label: descriptor.label,
					name: descriptor.name ?? descriptor.label,
					avatarUrl: descriptor.avatarUrl,
					cityData: trees.get(descriptor.repoKey)?.city ?? null,
					models: modelsFor(descriptor),
				})),
		// `modelsFor` reads `descriptors`, which is already a dependency.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[descriptors, trees],
	);

	/** Repos whose checkout fetch has not settled yet (neither loaded nor failed). */
	const pendingCount = descriptors.filter(
		(descriptor) =>
			!trees.has(descriptor.repoKey) && !failed.has(descriptor.repoKey),
	).length;

	if (descriptors.length === 0) {
		return (
			<CenteredMessage
				title="No repos to map"
				detail="Subsystem models in this tab reference no resolvable repos."
			/>
		);
	}

	if (repos.length === 0 && pendingCount > 0) {
		return (
			<CenteredMessage
				title="Loading repo cities…"
				detail={`${pendingCount} of ${descriptors.length} checkouts still loading.`}
			/>
		);
	}

	if (repos.length === 0) {
		return (
			<CenteredMessage
				title="No repo cities"
				detail="None of the referenced repos had a checkout the map could read."
			/>
		);
	}

	return (
		<SubsystemCoverageMapCards
			repos={repos}
			selectedRepoKeys={selectedRepoKeys}
			onSelectRepo={onToggleRepo}
			onHoverRepo={onHoverRepo}
			hoveredModelId={hoveredModelId}
			onOpenFile={onOpenFile}
		/>
	);
}

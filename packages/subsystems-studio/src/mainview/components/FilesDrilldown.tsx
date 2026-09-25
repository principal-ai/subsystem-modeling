/**
 * FilesDrilldown — repo overview that drills into ONE repo's files at a time.
 *
 * Left pane lists repo headers (avatar + name + owning-model count);
 * clicking one slides sideways to that repo's file tree. Back is an X
 * beside the GitHub button on the drilled-in repo row.
 * The drilled-in files render with the Pierre `SubsystemFileTree` — the same
 * tree the detail graph sidebar uses — instead of hand-rolled rows.
 *
 * Drill-down doubles as a list filter: the focused repo key is lifted up so
 * the subsystem list can narrow to its owning models (same key unfocuses).
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import {
	repoAvatarUrl,
	SubsystemFileTree,
	type RepoGroup,
} from "@principal-ai/subsystems-react";
import { RepoRow } from "./RepoRow";

/** Share of a repo's checkout referenced by its subsystem models. */
export interface RepoFileCoverage {
	/** Rounded 0–100. */
	percent: number;
	referenced: number;
	total: number;
}

export interface FilesDrilldownProps {
	groups: RepoGroup[];
	/** repoKey ("" for purl-less) → distinct owning subsystem-model count. */
	graphCountByRepo?: ReadonlyMap<string, number>;
	/**
	 * Map mode: repoKey → file coverage. When passed, overview rows show this
	 * percentage instead of the model count. A missing key means the repo's
	 * tree is still loading, so the badge stays blank.
	 */
	fileCoverageByRepo?: ReadonlyMap<string, RepoFileCoverage>;
	/** Drilled-in repo group key (`drilldownRepoKey`), or null for the overview. */
	focusedRepo: string | null;
	/** Toggle drill-down (same key unfocuses). */
	onFocusRepo: (repoKey: string) => void;
	onSelectFile: (group: RepoGroup, displayPath: string) => void;
	/** Combined-graph mode for the drilled-in repo (list ↔ composed graph). */
	combinedActive?: boolean;
	/** Toggle combined-graph mode. */
	onToggleCombined?: () => void;
	/**
	 * Showcase mode with a single repo: skip the overview (a one-row repo
	 * selection) and go straight to that repo's file tree.
	 */
	autoFocusSingleRepo?: boolean;
}

/** React + expansion key for a group (matches the caller's boost mapping). */
export function drilldownRepoKey(group: Pick<RepoGroup, "repoKey">): string {
	return group.repoKey ?? "__no-repo__";
}

function overviewBadge(
	group: RepoGroup,
	graphCountByRepo: ReadonlyMap<string, number> | undefined,
	fileCoverageByRepo: ReadonlyMap<string, RepoFileCoverage> | undefined,
): { badge?: string | number; badgeTitle?: string } {
	const key = group.repoKey ?? "";
	if (fileCoverageByRepo) {
		const coverage = fileCoverageByRepo.get(key);
		if (!coverage || coverage.total === 0) return {};
		return {
			badge: `${coverage.percent}%`,
			badgeTitle: `${coverage.referenced} of ${coverage.total} files referenced by subsystem models`,
		};
	}
	const count = graphCountByRepo?.get(key);
	if (count == null) return {};
	return {
		badge: count,
		badgeTitle: `${count} subsystem model${count === 1 ? "" : "s"}`,
	};
}

/**
 * The drilled-in repo's files as a Pierre tree. Keyed by repo upstream so the
 * tree remounts per repo; the Pierre tree fills its sized flex parent and
 * scrolls internally. A single click selects (and previews) the file.
 */
function FocusedRepoTree({
	group,
	onSelectFile,
}: {
	group: RepoGroup;
	onSelectFile: (group: RepoGroup, displayPath: string) => void;
}) {
	// Stabilize the `files` array by content: upstream groups are rebuilt on
	// every list refresh, so a naive `map` hands Pierre a new array identity
	// each time and its `resetPaths` effect wipes folder expansion — even
	// when the file set is unchanged.
	const entriesKey = useMemo(
		() => group.entries.map((e) => e.displayPath).join("\0"),
		[group],
	);
	const filesRef = useRef<{ key: string; files: string[] } | null>(null);
	if (!filesRef.current || filesRef.current.key !== entriesKey) {
		filesRef.current = {
			key: entriesKey,
			files: group.entries.map((e) => e.displayPath),
		};
	}
	const files = filesRef.current.files;
	return (
		<div
			style={{
				flex: 1,
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
			}}
		>
			<SubsystemFileTree
				files={files}
				onSelectFile={(displayPath) => onSelectFile(group, displayPath)}
				headerless
			/>
		</div>
	);
}

/**
 * Single drill-down over all repo groups with a slide transition: the
 * overview pane lists repo headers; focusing one slides sideways to its
 * Pierre file tree.
 */
export function FilesDrilldown({
	groups,
	graphCountByRepo,
	fileCoverageByRepo,
	focusedRepo,
	onFocusRepo,
	onSelectFile,
	combinedActive = false,
	onToggleCombined,
	autoFocusSingleRepo = false,
}: FilesDrilldownProps) {
	const { theme } = useTheme();
	// Showcase with a single repo: the overview would be a one-row repo
	// selection, so go straight to that repo's files instead.
	const autoKey =
		autoFocusSingleRepo && groups.length === 1
			? drilldownRepoKey(groups[0]!)
			: null;
	const focused =
		focusedRepo != null
			? (groups.find((g) => drilldownRepoKey(g) === focusedRepo) ?? null)
			: autoKey != null
				? (groups.find((g) => drilldownRepoKey(g) === autoKey) ?? null)
				: null;
	// Sync the auto-focused repo up so the list filters and combined-graph
	// mode key off the same focus the tree is showing. `onFocusRepo` toggles,
	// so apply once (StrictMode would otherwise toggle it straight back off).
	const autoFocusApplied = useRef(false);
	useEffect(() => {
		if (autoKey == null || focusedRepo != null || autoFocusApplied.current) {
			return;
		}
		autoFocusApplied.current = true;
		onFocusRepo(autoKey);
	}, [autoKey, focusedRepo, onFocusRepo]);
	// The focused repo's last model can be deleted out from under the drill
	// (or filtered away) — drop focus so the overview (and back path) returns.
	useEffect(() => {
		if (focusedRepo && !focused) {
			onFocusRepo(focusedRepo);
		}
	}, [focusedRepo, focused, onFocusRepo]);
	// Keep the exiting pane's content mounted until the slide-back finishes —
	// otherwise the tree vanishes the instant back is clicked.
	const [slideGroup, setSlideGroup] = useState<RepoGroup | null>(null);
	useEffect(() => {
		if (focused) {
			setSlideGroup(focused);
			return;
		}
		if (slideGroup) {
			const t = window.setTimeout(() => setSlideGroup(null), 220);
			return () => window.clearTimeout(t);
		}
	}, [focused, slideGroup]);
	const shown = focused ?? slideGroup;
	const paneStyle: CSSProperties = {
		width: "50%",
		flexShrink: 0,
		minHeight: 0,
		display: "flex",
		flexDirection: "column",
	};

	return (
		<div
			style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex" }}
		>
			<div
				style={{
					display: "flex",
					height: "100%",
					width: "200%",
					flexShrink: 0,
					transform: focused ? "translateX(-50%)" : "translateX(0)",
					transition: "transform 200ms ease",
				}}
			>
				<div style={{ ...paneStyle, overflowY: "auto", paddingBottom: 8 }}>
					{groups.map((group, i) => (
						<div
							key={drilldownRepoKey(group)}
							style={{
								flexShrink: 0,
								display: "flex",
								flexDirection: "column",
								borderTop:
									i > 0
										? `1px solid ${theme.colors.border ?? "#333"}`
										: undefined,
							}}
						>
							<RepoRow
								avatarUrl={
									group.repoKey ? repoAvatarUrl(group.repoKey) : undefined
								}
								label={group.repo ?? "No repo"}
								title="Show this repo's files"
								{...overviewBadge(group, graphCountByRepo, fileCoverageByRepo)}
								onPress={() => onFocusRepo(drilldownRepoKey(group))}
							/>
						</div>
					))}
				</div>
				<div style={{ ...paneStyle, height: "100%", overflow: "hidden" }}>
					{shown && (
						<>
							<RepoRow
								avatarUrl={
									shown.repoKey ? repoAvatarUrl(shown.repoKey) : undefined
								}
								label={shown.repo ?? "No repo"}
								title={
									shown.owner ? `${shown.owner}/${shown.repo}` : shown.repo
								}
								showGithub
								githubUrl={
									shown.owner && shown.repo
										? `https://github.com/${shown.owner}/${shown.repo}`
										: undefined
								}
								showCombinedToggle
								combinedActive={combinedActive}
								onToggleCombined={onToggleCombined}
								onBack={
									autoKey
										? undefined
										: () => {
												if (focusedRepo) onFocusRepo(focusedRepo);
											}
								}
							/>
							<FocusedRepoTree
								key={drilldownRepoKey(shown)}
								group={shown}
								onSelectFile={onSelectFile}
							/>
						</>
					)}
				</div>
			</div>
		</div>
	);
}

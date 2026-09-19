/**
 * FilesDrilldown — repo overview that drills into ONE repo's files at a time.
 *
 * Left pane lists repo headers (avatar + name + owning-model count);
 * clicking one slides sideways to that repo's file tree with a back row.
 * The drilled-in files render with the Pierre `SubsystemFileTree` — the same
 * tree the detail graph sidebar uses — instead of hand-rolled rows.
 *
 * Drill-down doubles as a list filter: the focused repo key is lifted up so
 * the subsystem list can narrow to its owning models (same key unfocuses).
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronLeft as ChevronLeftIcon, Network as NetworkIcon } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import {
	repoAvatarUrl,
	SubsystemFileTree,
	type RepoGroup,
} from "@principal-ai/subsystems-react";
import { electrobun } from "../rpc";
import { GithubMark } from "./TrailHeader";

export interface FilesDrilldownProps {
	groups: RepoGroup[];
	/** repoKey ("" for purl-less) → distinct owning subsystem-model count. */
	graphCountByRepo?: ReadonlyMap<string, number>;
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

function RepoHeaderRow({
	group,
	graphCount,
	title,
	onPress,
	showGithub = false,
	showCombinedToggle = false,
	combinedActive = false,
	onToggleCombined,
}: {
	group: RepoGroup;
	graphCount?: number;
	/** Row tooltip when clickable. */
	title?: string;
	/** When set the row renders as a button (hoverable, clickable). */
	onPress?: () => void;
	showGithub?: boolean;
	/** Show the list ↔ combined-graph toggle next to the GitHub button. */
	showCombinedToggle?: boolean;
	combinedActive?: boolean;
	onToggleCombined?: () => void;
}) {
	const { theme } = useTheme();
	const avatar = group.repoKey ? repoAvatarUrl(group.repoKey) : undefined;
	const label = group.repo ?? "No repo";
	const github =
		showGithub && group.owner && group.repo
			? `https://github.com/${group.owner}/${group.repo}`
			: undefined;

	const identity = (
		<>
			{avatar && (
				<img
					src={avatar}
					alt=""
					width={28}
					height={28}
					style={{ borderRadius: 6, flexShrink: 0 }}
				/>
			)}
			<span
				style={{
					fontSize: theme.fontSizes[2],
					fontFamily: theme.fonts.monospace,
					color: theme.colors.text,
					fontWeight: 600,
					whiteSpace: "nowrap",
					overflow: "hidden",
					textOverflow: "ellipsis",
				}}
				title={group.owner ? `${group.owner}/${label}` : label}
			>
				{label}
			</span>
			{graphCount != null && (
				<span
					style={{
						marginLeft: "auto",
						flexShrink: 0,
						fontSize: theme.fontSizes[0],
						fontFamily: theme.fonts.monospace,
						color:
							theme.colors.textMuted ?? theme.colors.textSecondary,
					}}
					title={`${graphCount} subsystem model${graphCount === 1 ? "" : "s"}`}
				>
					{graphCount}
				</span>
			)}
		</>
	);

	return (
		<div
			onMouseEnter={
				onPress
					? (e) => {
							e.currentTarget.style.background =
								theme.colors.border ?? "#333";
						}
					: undefined
			}
			onMouseLeave={
				onPress
					? (e) => {
							e.currentTarget.style.background = "transparent";
						}
					: undefined
			}
			style={{
				flexShrink: 0,
				display: "flex",
				alignItems: "center",
				gap: 6,
				padding: "8px 8px 4px",
				borderRadius: 4,
				background: "transparent",
				minWidth: 0,
				cursor: onPress ? "pointer" : "default",
				transition: "background 120ms ease",
			}}
		>
			{onPress ? (
				<button
					type="button"
					onClick={onPress}
					title={title}
					style={{
						flex: 1,
						minWidth: 0,
						display: "flex",
						alignItems: "center",
						gap: 6,
						padding: 0,
						border: "none",
						borderRadius: 4,
						background: "transparent",
						cursor: "pointer",
						fontFamily: theme.fonts.body,
						textAlign: "left",
					}}
				>
					{identity}
				</button>
			) : (
				<div
					style={{
						flex: 1,
						minWidth: 0,
						display: "flex",
						alignItems: "center",
						gap: 6,
					}}
				>
					{identity}
				</div>
			)}
			{showCombinedToggle && onToggleCombined && (
				<button
					type="button"
					title={combinedActive ? "Show model list" : "Show combined graph"}
					aria-label={combinedActive ? "Show model list" : "Show combined graph"}
					aria-pressed={combinedActive}
					onClick={(e) => {
						e.stopPropagation();
						onToggleCombined();
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.background = theme.colors.border ?? "#333";
						e.currentTarget.style.color = theme.colors.text;
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.background = combinedActive
							? (theme.colors.border ?? "#333")
							: "transparent";
						e.currentTarget.style.color = combinedActive
							? theme.colors.text
							: (theme.colors.textMuted ?? theme.colors.textSecondary);
					}}
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						padding: 4,
						flexShrink: 0,
						border: "none",
						borderRadius: 4,
						background: combinedActive
							? (theme.colors.border ?? "#333")
							: "transparent",
						cursor: "pointer",
						color: combinedActive
							? theme.colors.text
							: (theme.colors.textMuted ?? theme.colors.textSecondary),
						transition: "color 120ms ease",
					}}
				>
					<NetworkIcon size={18} />
				</button>
			)}
			{github && (
				<button
					type="button"
					title={`Open ${group.owner}/${group.repo} on GitHub`}
					onClick={(e) => {
						e.stopPropagation();
						void electrobun.rpc!.request.openExternal({ url: github });
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.background = theme.colors.border ?? "#333";
						e.currentTarget.style.color = theme.colors.text;
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.background = "transparent";
						e.currentTarget.style.color =
							theme.colors.textMuted ?? theme.colors.textSecondary;
					}}
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						padding: 4,
						flexShrink: 0,
						border: "none",
						borderRadius: 4,
						background: "transparent",
						cursor: "pointer",
						color: theme.colors.textMuted ?? theme.colors.textSecondary,
						transition: "color 120ms ease",
					}}
				>
					<GithubMark size={18} />
				</button>
			)}
		</div>
	);
}

function BackRow({ onBack }: { onBack: () => void }) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	return (
		<button
			type="button"
			onClick={onBack}
			title="Back to all repos"
			onMouseEnter={(e) => {
				e.currentTarget.style.background = theme.colors.border ?? "#333";
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.background = "transparent";
			}}
			style={{
				flexShrink: 0,
				display: "flex",
				alignItems: "center",
				gap: 4,
				padding: "8px 8px 4px",
				border: "none",
				borderRadius: 4,
				background: "transparent",
				cursor: "pointer",
				fontFamily: theme.fonts.body,
				color: muted,
				fontSize: theme.fontSizes[1],
				transition: "background 120ms ease",
			}}
		>
			<ChevronLeftIcon size={14} style={{ flexShrink: 0 }} />
			All repos
		</button>
	);
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
							<RepoHeaderRow
								group={group}
								graphCount={graphCountByRepo?.get(group.repoKey ?? "")}
								title="Show this repo's files"
								onPress={() => onFocusRepo(drilldownRepoKey(group))}
							/>
						</div>
					))}
				</div>
				<div style={{ ...paneStyle, height: "100%", overflow: "hidden" }}>
					{shown && (
						<>
							{!autoKey && (
								<BackRow
									onBack={() => focusedRepo && onFocusRepo(focusedRepo)}
								/>
							)}
							<RepoHeaderRow
								group={shown}
								showGithub
								showCombinedToggle
								combinedActive={combinedActive}
								onToggleCombined={onToggleCombined}
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

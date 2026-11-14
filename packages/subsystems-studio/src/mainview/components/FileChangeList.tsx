/**
 * FileChangeList — the expanded changed-path list on commit and merge rows.
 *
 * Shows one repo-relative path per line with a compact status badge so added,
 * modified, deleted, renamed, and copied files are distinguishable at a
 * glance. Renames and copies also show their source path.
 */

import { useTheme } from "@principal-ade/industry-theme";
import type { FileChange, FileChangeStatus } from "../../shared/contract";
import { LineChangeBar } from "./LineChangeBar";

const STATUS_META: Record<
	FileChangeStatus,
	{ letter: string; label: string }
> = {
	added: { letter: "A", label: "Added" },
	modified: { letter: "M", label: "Modified" },
	deleted: { letter: "D", label: "Deleted" },
	renamed: { letter: "R", label: "Renamed" },
	copied: { letter: "C", label: "Copied" },
};

export function summarizeFileChanges(
	changes: readonly FileChange[],
): { additions: number; deletions: number; known: boolean } {
	let additions = 0;
	let deletions = 0;
	let known = false;
	for (const change of changes) {
		if (change.additions === undefined && change.deletions === undefined) continue;
		known = true;
		additions += change.additions ?? 0;
		deletions += change.deletions ?? 0;
	}
	return { additions, deletions, known };
}

export function FileChangeList({
	changes,
}: {
	changes: readonly FileChange[];
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const colors: Record<FileChangeStatus, string> = {
		added: theme.colors.success ?? "#3d9a5f",
		modified: theme.colors.primary,
		deleted: theme.colors.error ?? "#e5534b",
		renamed: "#a371f7",
		copied: "#06b6d4",
	};
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
			{changes.map((change) => {
				const meta = STATUS_META[change.status];
				const hasStats =
					change.additions !== undefined || change.deletions !== undefined;
				const statLabel = hasStats
					? ` · +${change.additions ?? 0} −${change.deletions ?? 0}`
					: "";
				return (
					<div
						key={`${change.status}:${change.previousPath ?? ""}:${change.path}`}
						title={`${meta.label}${change.previousPath ? ` from ${change.previousPath}` : ""}: ${change.path}${statLabel}`}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 6,
							minWidth: 0,
							fontFamily: theme.fonts.monospace,
							fontSize: theme.fontSizes[0],
						}}
					>
						<span
							aria-label={meta.label}
							style={{
								flexShrink: 0,
								width: 14,
								textAlign: "center",
								fontWeight: 700,
								color: colors[change.status],
							}}
						>
							{meta.letter}
						</span>
						<span
							style={{
								flex: "1 1 auto",
								minWidth: 0,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
							}}
						>
							{change.path}
						</span>
						{change.previousPath && (
							<span
								style={{
									flex: "0 1 auto",
									minWidth: 0,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
									color: muted,
								}}
							>
								← {change.previousPath}
							</span>
						)}
						{hasStats && (
							<span
								style={{
									marginLeft: "auto",
									flexShrink: 0,
									display: "inline-flex",
									alignItems: "center",
									gap: 6,
									fontFamily: theme.fonts.monospace,
								}}
							>
								<LineChangeBar
									additions={change.additions ?? 0}
									deletions={change.deletions ?? 0}
									width={28}
									height={4}
								/>
								<span style={{ color: colors.added }}>
									+{change.additions ?? 0}
								</span>
								<span style={{ color: colors.deleted }}>
									−{change.deletions ?? 0}
								</span>
							</span>
						)}
					</div>
				);
			})}
		</div>
	);
}

/**
 * LineChangeBar — a compact green/red diffstat bar.
 *
 * Segment widths follow addition/deletion counts, with a small minimum so a
 * handful of lines against a large change still remains visible.
 */

import { useTheme } from "@principal-ade/industry-theme";

export interface LineStats {
	additions: number;
	deletions: number;
}

export function LineChangeBar({
	additions,
	deletions,
	width = 44,
	height = 5,
}: {
	additions: number;
	deletions: number;
	width?: number;
	height?: number;
}) {
	const { theme } = useTheme();
	const total = additions + deletions;
	if (total <= 0) return null;
	const added = theme.colors.success ?? "#3d9a5f";
	const removed = theme.colors.error ?? "#e5534b";
	return (
		<span
			role="img"
			aria-label={`${additions} additions, ${deletions} deletions`}
			title={`${additions} additions, ${deletions} deletions`}
			style={{
				display: "inline-flex",
				width,
				height,
				flexShrink: 0,
				borderRadius: 1,
				overflow: "hidden",
				background: theme.colors.border ?? "#333",
			}}
		>
			{additions > 0 && (
				<span
					style={{
						flexGrow: additions,
						minWidth: 2,
						background: added,
					}}
				/>
			)}
			{deletions > 0 && (
				<span
					style={{
						flexGrow: deletions,
						minWidth: 2,
						background: removed,
					}}
				/>
			)}
		</span>
	);
}

/**
 * A full-width diffstat track whose filled length is relative to the largest
 * change in the list. This is the cross-row comparison bar: a 500-line PR
 * reaches farther than a 20-line PR, while green/red still show the split.
 */
export function LineChangeScaleBar({
	additions,
	deletions,
	maxTotal,
	height = 12,
}: {
	additions: number;
	deletions: number;
	maxTotal: number;
	height?: number;
}) {
	const { theme } = useTheme();
	const total = additions + deletions;
	if (total <= 0) return null;
	const percent =
		maxTotal > 0 ? Math.min(100, Math.max(2, (total / maxTotal) * 100)) : 100;
	const added = theme.colors.success ?? "#3d9a5f";
	const removed = theme.colors.error ?? "#e5534b";
	return (
		<span
			role="img"
			aria-label={`${additions} additions, ${deletions} deletions`}
			title={`${additions} additions, ${deletions} deletions`}
			style={{
				display: "block",
				width: "100%",
				height,
				borderRadius: 2,
				overflow: "hidden",
				background: theme.colors.border ?? "#333",
			}}
		>
			<span
				style={{
					display: "flex",
					width: `${percent}%`,
					height: "100%",
					minWidth: 2,
				}}
			>
				{additions > 0 && (
					<span
						style={{ flexGrow: additions, minWidth: 1, background: added }}
					/>
				)}
				{deletions > 0 && (
					<span
						style={{ flexGrow: deletions, minWidth: 1, background: removed }}
					/>
				)}
			</span>
		</span>
	);
}

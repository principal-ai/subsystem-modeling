/**
 * PullRequestListSkeleton — shimmering placeholder rows while merged PRs load.
 *
 * Mirrors the real row anatomy (title, action pills, author/meta line) so the
 * list feels like it is filling in rather than blocking on a spinner. The
 * sweep is subtle and respects `prefers-reduced-motion`.
 */

import { useTheme } from "@principal-ade/industry-theme";
import { SkeletonBar, SkeletonStyles } from "./Skeleton";

const ROW_COUNT = 4;
const TITLE_WIDTHS = ["58%", "46%", "68%", "52%"];
const META_WIDTHS = [
	["22%", "14%", "18%"],
	["16%", "20%", "12%"],
	["26%", "12%", "16%"],
	["18%", "16%", "20%"],
];

export function PullRequestListSkeleton({ rows = ROW_COUNT }: { rows?: number }) {
	const { theme } = useTheme();
	const border = theme.colors.border ?? "#333";
	const dot =
		theme.colors.backgroundSecondary ??
		theme.colors.surface ??
		theme.colors.border;
	return (
		<div
			role="status"
			aria-live="polite"
			aria-label="Loading merged pull requests"
			style={{ maxWidth: 960, margin: "0 auto" }}
		>
			<SkeletonStyles />
			{Array.from({ length: rows }, (_, index) => (
				<div
					key={index}
					className="principal-skeleton-row"
					style={{
						padding: "16px 12px",
						minHeight: 72,
						borderBottom: `1px solid ${border}`,
						animationDelay: `${index * 70}ms`,
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
						<div
							style={{
								width: 42,
								height: 42,
								flexShrink: 0,
								borderRadius: "50%",
								background: dot,
							}}
						/>
						<div
							style={{
								flex: 1,
								minWidth: 0,
								display: "flex",
								flexDirection: "column",
								gap: 4,
								transform: "translateY(-1px)",
							}}
						>
							<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
								{META_WIDTHS[index % META_WIDTHS.length]!.map((width, metaIndex) => (
									<SkeletonBar
										key={metaIndex}
										width={width}
										height={9}
										delay={index * 90 + 30 + metaIndex * 40}
									/>
								))}
							</div>
							<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
								<div style={{ flex: 1, minWidth: 0, display: "flex" }}>
									<SkeletonBar
										width={TITLE_WIDTHS[index % TITLE_WIDTHS.length]!}
										height={12}
										delay={index * 90}
									/>
								</div>
							</div>
						</div>
					</div>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 10,
							marginTop: 8,
						}}
					>
						<div
							style={{
								width: 14,
								height: 14,
								flexShrink: 0,
								borderRadius: 4,
								background: dot,
							}}
						/>
						<SkeletonBar width="32px" height={9} delay={index * 90 + 40} />
						<div style={{ flex: 1, minWidth: 0, display: "flex" }}>
							<SkeletonBar
								width="100%"
								height={12}
								radius={2}
								delay={index * 90 + 80}
							/>
						</div>
					</div>
				</div>
			))}
		</div>
	);
}

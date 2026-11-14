/**
 * Shared skeleton primitives: a theme-aware shimmer bar and the keyframes it
 * needs. Used by the merged-PR list and repo-city card placeholders.
 */

import { useTheme } from "@principal-ade/industry-theme";

/** Inject once per skeleton surface; duplicate rules are harmless. */
export function SkeletonStyles() {
	return (
		<style>{`
@keyframes principal-skeleton-sweep {
  from { transform: translateX(-100%); }
  to { transform: translateX(100%); }
}
@keyframes principal-skeleton-enter {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
}
@keyframes principal-skeleton-pulse {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 0.7; }
}
.principal-skeleton-row { animation: principal-skeleton-enter 280ms ease-out both; }
@media (prefers-reduced-motion: reduce) {
  .principal-skeleton-row,
  .principal-skeleton-sweep,
  .principal-skeleton-pulse { animation: none !important; }
}
`}</style>
	);
}

export function SkeletonBar({
	width,
	height = 10,
	delay = 0,
	radius = 4,
}: {
	width: string;
	height?: number;
	delay?: number;
	radius?: number;
}) {
	const { theme } = useTheme();
	return (
		<div
			style={{
				position: "relative",
				overflow: "hidden",
				width,
				height,
				flexShrink: 0,
				borderRadius: radius,
				background:
					theme.colors.backgroundSecondary ??
					theme.colors.surface ??
					theme.colors.border,
			}}
		>
			<span
				className="principal-skeleton-sweep"
				aria-hidden="true"
				style={{
					position: "absolute",
					inset: 0,
					background: `linear-gradient(90deg, transparent, ${theme.colors.text}14, transparent)`,
					animation: `principal-skeleton-sweep 1.5s ease-in-out ${delay}ms infinite`,
				}}
			/>
		</div>
	);
}

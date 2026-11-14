/**
 * RepoCitySkeletonCard — a shimmering stand-in for a repo File City card.
 *
 * Matches the real card grid cell: 1:1 card, avatar/title/meta header, coverage
 * bar, and a blocky city-shaped body. Used while one or more repo cities are
 * still being read from disk.
 */

import { useTheme } from "@principal-ade/industry-theme";
import { SkeletonBar } from "./Skeleton";

const CITY_BLOCKS = [
	{ left: "10%", top: "18%", width: "16%", height: "24%", delay: 0 },
	{ left: "30%", top: "12%", width: "20%", height: "34%", delay: 120 },
	{ left: "54%", top: "22%", width: "14%", height: "20%", delay: 240 },
	{ left: "72%", top: "16%", width: "18%", height: "30%", delay: 60 },
	{ left: "14%", top: "52%", width: "22%", height: "28%", delay: 180 },
	{ left: "42%", top: "58%", width: "16%", height: "22%", delay: 300 },
	{ left: "64%", top: "54%", width: "24%", height: "26%", delay: 90 },
];

export function RepoCitySkeletonCard({ index = 0 }: { index?: number }) {
	const { theme } = useTheme();
	const border = theme.colors.border ?? "#333";
	const base =
		theme.colors.backgroundSecondary ??
		theme.colors.surface ??
		theme.colors.border;
	const delay = index * 80;
	return (
		<div
			aria-hidden="true"
			className="principal-skeleton-row"
			style={{
				position: "relative",
				width: "100%",
				aspectRatio: "1 / 1",
				display: "flex",
				flexDirection: "column",
				overflow: "hidden",
				borderRadius: 8,
				border: `1px solid ${border}`,
				background:
					theme.colors.surface ??
					theme.colors.backgroundSecondary ??
					theme.colors.background,
				animationDelay: `${index * 70}ms`,
			}}
		>
			<div style={{ flexShrink: 0, padding: 8 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<SkeletonBar width="40px" height={40} radius={8} delay={delay} />
					<div
						style={{
							flex: 1,
							minWidth: 0,
							display: "flex",
							flexDirection: "column",
							gap: 6,
						}}
					>
						<SkeletonBar width="62%" height={12} delay={delay + 40} />
						<div style={{ display: "flex", gap: 6 }}>
							<SkeletonBar width="30%" height={9} delay={delay + 80} />
							<SkeletonBar width="24%" height={9} delay={delay + 120} />
						</div>
					</div>
					<SkeletonBar width="28px" height={28} radius={6} delay={delay + 60} />
				</div>
				<div style={{ marginTop: 7 }}>
					<SkeletonBar width="100%" height={3} radius={2} delay={delay + 100} />
				</div>
			</div>

			<div
				style={{
					flex: 1,
					minHeight: 0,
					position: "relative",
					overflow: "hidden",
					background: theme.colors.background,
					borderTop: `1px solid ${border}`,
				}}
			>
				{CITY_BLOCKS.map((block, blockIndex) => (
					<div
						key={blockIndex}
						className="principal-skeleton-pulse"
						style={{
							position: "absolute",
							left: block.left,
							top: block.top,
							width: block.width,
							height: block.height,
							borderRadius: 3,
							background: base,
							opacity: 0.55,
							animation: `principal-skeleton-pulse 1.8s ease-in-out ${block.delay + delay}ms infinite`,
						}}
					/>
				))}
				<span
					className="principal-skeleton-sweep"
					aria-hidden="true"
					style={{
						position: "absolute",
						inset: 0,
						background: `linear-gradient(90deg, transparent, ${theme.colors.text}10, transparent)`,
						animation: `principal-skeleton-sweep 1.8s ease-in-out ${delay}ms infinite`,
					}}
				/>
			</div>
		</div>
	);
}

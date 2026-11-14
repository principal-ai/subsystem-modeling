/**
 * ContributorAvatarFan — a small stack of user avatars that fans out across a
 * card corner. Repo activity cards use it to show who contributed to a
 * checkout in the current window without spending a whole row on names.
 *
 * Avatars overlap from left to right and rotate slightly around their base, so
 * the stack reads as a fan rather than a plain list. A trailing `+N` chip keeps
 * the cluster bounded on busy repos.
 */

import { useState } from "react";
import { useTheme } from "@principal-ade/industry-theme";

export interface AvatarContributor {
	login: string;
	avatarUrl?: string;
	/** Activity count in the current window; surfaced in the tooltip. */
	count?: number;
}

/** Per-repo contributor lists, keyed by purl repo key. */
export type ContributorsByRepo = ReadonlyMap<string, readonly AvatarContributor[]>;

/**
 * Aggregate activity authors per repo, newest data already filtered by the
 * caller. Contributors are sorted by activity count so the busiest avatar
 * sits on top of the fan.
 */
export function groupContributorsByRepo<T>(
	items: readonly T[],
	repoKeyOf: (item: T) => string,
	authorOf: (item: T) => { login?: string; avatarUrl?: string } | undefined,
): Map<string, AvatarContributor[]> {
	const byRepo = new Map<string, Map<string, AvatarContributor>>();
	for (const item of items) {
		const author = authorOf(item);
		if (!author?.login) continue;
		const repoKey = repoKeyOf(item);
		let byAuthor = byRepo.get(repoKey);
		if (!byAuthor) {
			byAuthor = new Map();
			byRepo.set(repoKey, byAuthor);
		}
		const existing = byAuthor.get(author.login);
		if (existing) existing.count = (existing.count ?? 0) + 1;
		else
			byAuthor.set(author.login, {
				login: author.login,
				avatarUrl: author.avatarUrl,
				count: 1,
			});
	}
	const result = new Map<string, AvatarContributor[]>();
	for (const [repoKey, byAuthor] of byRepo) {
		result.set(
			repoKey,
			[...byAuthor.values()].sort(
				(a, b) =>
					(b.count ?? 0) - (a.count ?? 0) || a.login.localeCompare(b.login),
			),
		);
	}
	return result;
}

export interface ContributorAvatarFanProps {
	contributors: readonly AvatarContributor[];
	/** Avatar diameter in px. */
	size?: number;
	/** Avatars shown before the `+N` overflow chip. */
	max?: number;
	/** Noun used in tooltips, e.g. "commit" or "merge". */
	activityNoun?: string;
	/** Draw a ring in this color; defaults to the card background. */
	ringColor?: string;
}

/** Overlapping, slightly rotated avatar stack for a card corner. */
export function ContributorAvatarFan({
	contributors,
	size = 22,
	max = 4,
	activityNoun = "commit",
	ringColor,
}: ContributorAvatarFanProps) {
	const { theme } = useTheme();
	const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set());
	if (contributors.length === 0) return null;

	const shown = contributors.slice(0, max);
	const overflow = contributors.length - shown.length;
	const overlap = Math.round(size * 0.42);
	const step = size - overlap;
	const overflowWidth = overflow > 0 ? step : 0;
	const width = size + (shown.length - 1) * step + overflowWidth;
	const ring = ringColor ?? theme.colors.background;
	const background = theme.colors.backgroundSecondary ?? theme.colors.background;
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const label = `Contributors: ${contributors.map((c) => c.login).join(", ")}`;

	const renderFallback = (login: string) => (
		<span
			aria-hidden="true"
			style={{
				display: "inline-flex",
				width: "100%",
				height: "100%",
				alignItems: "center",
				justifyContent: "center",
				background,
				color: muted,
				fontSize: Math.round(size * 0.42),
				fontWeight: 700,
			}}
		>
			{login.slice(0, 1).toUpperCase()}
		</span>
	);

	return (
		<div
			role="group"
			aria-label={label}
			style={{
				position: "relative",
				width,
				height: size,
				flexShrink: 0,
			}}
		>
			{shown.map((contributor, index) => {
				const angle =
					shown.length === 1
						? 0
						: -10 + (20 * index) / (shown.length - 1);
				const lift = Math.abs(angle) * 0.18;
				const tip = `${contributor.login}${
					contributor.count
						? ` · ${contributor.count} ${contributor.count === 1 ? activityNoun : `${activityNoun}s`}`
						: ""
				}`;
				return (
					<span
						key={contributor.login}
						title={tip}
						style={{
							position: "absolute",
							left: index * step,
							top: lift,
							zIndex: index + 1,
							width: size,
							height: size,
							borderRadius: "50%",
							overflow: "hidden",
							border: `2px solid ${ring}`,
							background,
							boxShadow: "0 1px 3px rgba(0, 0, 0, 0.35)",
							transform: `rotate(${angle}deg)`,
							transformOrigin: "50% 85%",
						}}
					>
						{contributor.avatarUrl && !broken.has(contributor.login) ? (
							<img
								src={contributor.avatarUrl}
								alt=""
								width={size}
								height={size}
								style={{
									display: "block",
									width: "100%",
									height: "100%",
									objectFit: "cover",
								}}
								onError={() =>
									setBroken((previous) => {
										if (previous.has(contributor.login)) return previous;
										const next = new Set(previous);
										next.add(contributor.login);
										return next;
									})
								}
							/>
						) : (
							renderFallback(contributor.login)
						)}
					</span>
				);
			})}
			{overflow > 0 && (
				<span
					title={contributors
						.slice(max)
						.map((contributor) => contributor.login)
						.join(", ")}
					style={{
						position: "absolute",
						left: shown.length * step,
						top: 0,
						zIndex: shown.length + 1,
						width: size,
						height: size,
						borderRadius: "50%",
						border: `2px solid ${ring}`,
						background,
						color: muted,
						display: "inline-flex",
						alignItems: "center",
						justifyContent: "center",
						fontSize: Math.round(size * 0.38),
						fontWeight: 700,
						fontFamily: theme.fonts.monospace,
						boxShadow: "0 1px 3px rgba(0, 0, 0, 0.35)",
					}}
				>
					+{overflow}
				</span>
			)}
		</div>
	);
}

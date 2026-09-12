/**
 * SubsystemRepoCards — the strip of repo toggle cards across the top of the
 * Subsystems tab. Aggregates unique GitHub repos from the visible graphs;
 * clicking a card AND-filters the list. Selected (filtering) cards show a
 * check + primary ring; the rest dim while any filter is active.
 *
 * Each card badges Graphify cache freshness from Alexandria
 * (`listGraphifyRepos`): Up to date / Out of date / Not run / Running.
 */

import { useTheme } from "@principal-ade/industry-theme";
import type { GraphifyRepoEntry } from "../../shared/contract";

/** Parse `pkg:github/owner/name` (fragment/query ignored). */
export function parseGithubRepo(
	purl: string | undefined,
): { owner: string; name: string } | null {
	if (!purl) return null;
	const match = /^pkg:github\/([^/]+)\/([^/#?]+)/.exec(purl.trim());
	if (!match) return null;
	return { owner: match[1]!, name: match[2]! };
}

/**
 * Graphify status on a repo card — Alexandria freshness only
 * (`listGraphifyRepos`). Graphify artifacts are keyed to Alexandria checkouts.
 */
export type RepoCardGraphify = {
	status: GraphifyRepoEntry["status"];
	/** True when some cache exists but may not match HEAD. */
	hasCached: boolean;
	purl: string;
	repoRoot: string;
};

export interface SubsystemRepoCard {
	owner: string;
	name: string;
	/** How many listed graphs reference this repo. */
	graphCount: number;
	/** False when none of the repo's graphs pass the recency filter. */
	hasRecent: boolean;
	graphify: RepoCardGraphify | null;
}

export function repoKey(owner: string, name: string): string {
	return `${owner}/${name}`;
}

export const EMPTY_REPO_FILTER: ReadonlySet<string> = new Set();

type GraphifyBadge = {
	label: string;
	title: string;
	color: string;
};

function graphifyBadgeFor(
	gf: RepoCardGraphify | null,
	muted: string,
): GraphifyBadge | null {
	if (!gf) return null;
	if (gf.status === "ready") {
		return {
			label: "Up to date",
			title: "Graphify cache matches current HEAD (current artifact)",
			color: "#3d9a5f",
		};
	}
	if (gf.status === "building") {
		return {
			label: "Running",
			title: "Graphify extract in progress",
			color: muted,
		};
	}
	if (gf.hasCached) {
		return {
			label: "Out of date",
			title:
				"A graphify artifact exists, but it was built for a different commit or dirty state",
			color: "#e5534b",
		};
	}
	return {
		label: "Not run",
		title: "No graphify graph cached for this repo yet",
		color: muted,
	};
}

export function SubsystemRepoCards({
	repos,
	selectedKeys = EMPTY_REPO_FILTER,
	highlightPurl,
	onToggle,
}: {
	repos: SubsystemRepoCard[];
	selectedKeys?: ReadonlySet<string>;
	/** Optional purl highlight for animated edge on the matching repo card. */
	highlightPurl?: string | null;
	onToggle: (key: string) => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	if (repos.length === 0) return null;

	const highlightKey = highlightPurl
		? (() => {
				const parsed = parseGithubRepo(highlightPurl);
				return parsed ? repoKey(parsed.owner, parsed.name) : null;
			})()
		: null;

	return (
		<div
			style={{
				flexShrink: 0,
				display: "flex",
				alignItems: "stretch",
				gap: 8,
				padding: "10px 24px",
				borderBottom: `1px solid ${theme.colors.border ?? "#333"}`,
				overflowX: "auto",
			}}
		>
			{repos.map((repo) => {
				const key = repoKey(repo.owner, repo.name);
				const selected = selectedKeys.has(key);
				const gf = repo.graphify;
				const gfBadge = graphifyBadgeFor(gf, muted);
				const highlighted =
					highlightKey === key ||
					(highlightPurl != null && gf?.purl === highlightPurl);
				// When any card is filtering, dim the rest so on/off is obvious.
				// Cards with nothing recent stay dimmed until the Recent filter
				// is turned off, even with no filter active.
				const dimmed = selectedKeys.size > 0 && !selected;
				const stale = !repo.hasRecent;
				const filterTitle = highlighted
					? `Graphify running for ${key}…`
					: stale && !selected
						? `No graphs edited in the last day for ${key}`
						: selected
							? `Remove ${key} from filter`
							: selectedKeys.size > 0
								? `Also require ${key}`
								: `Filter graphs that use ${key}`;
				const title = gfBadge
					? `${filterTitle} · ${gfBadge.title}`
					: filterTitle;
				return (
					<div
						key={key}
						role="button"
						tabIndex={0}
						className={highlighted ? "principal-studio-audit-active" : undefined}
						title={title}
						aria-pressed={selected}
						aria-busy={highlighted || undefined}
						aria-label={
							highlighted
								? `Graphify running for ${key}`
								: selected
									? `Remove ${key} from filter`
									: `Add ${key} to filter`
						}
						onClick={() => onToggle(key)}
						onKeyDown={(e) => {
							if (e.key !== "Enter" && e.key !== " ") return;
							e.preventDefault();
							onToggle(key);
						}}
						onMouseEnter={(e) => {
							if (!selected && !highlighted) {
								e.currentTarget.style.borderColor = theme.colors.textMuted ?? "#555";
							}
						}}
						onMouseLeave={(e) => {
							if (!selected && !highlighted) {
								e.currentTarget.style.borderColor = theme.colors.border ?? "#333";
							}
						}}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							flexShrink: 0,
							minWidth: 0,
							maxWidth: 400,
							padding: "6px 10px 6px 6px",
							borderRadius: 6,
							border: `1px solid ${
								highlighted
									? "transparent"
									: selected
										? theme.colors.primary
										: (theme.colors.border ?? "#333")
							}`,
							background: selected
								? `${theme.colors.primary}22`
								: (theme.colors.backgroundSecondary ?? theme.colors.background ?? "#161b22"),
							boxShadow: selected
								? `0 0 0 1px ${theme.colors.primary}`
								: undefined,
							color: theme.colors.text,
							cursor: "pointer",
							textAlign: "left",
							fontFamily: theme.fonts.body,
							transition: "border-color 0.15s ease, opacity 0.15s ease, box-shadow 0.15s ease",
							opacity: selected ? 1 : dimmed || stale ? 0.5 : 1,
						}}
					>
						<img
							src={`https://github.com/${encodeURIComponent(repo.owner)}.png?size=64`}
							alt=""
							width={40}
							height={40}
							style={{
								borderRadius: 8,
								flexShrink: 0,
								display: "block",
								background: theme.colors.background,
							}}
							onError={(e) => {
								(e.currentTarget as HTMLImageElement).style.visibility = "hidden";
							}}
						/>
						<div
							style={{
								minWidth: 0,
								flex: 1,
								display: "flex",
								flexDirection: "column",
								gap: 3,
							}}
						>
							<div
								style={{
									fontSize: theme.fontSizes[1],
									fontWeight: 600,
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								{selected && (
									<span
										aria-hidden
										style={{ color: theme.colors.primary, marginRight: 4 }}
									>
										✓
									</span>
								)}
								{repo.name}
							</div>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 6,
									minWidth: 0,
								}}
							>
								<div
									style={{
										fontSize: theme.fontSizes[0],
										color: muted,
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
										minWidth: 0,
									}}
								>
									{repo.owner} · {repo.graphCount === 1 ? "1 graph" : `${repo.graphCount} graphs`}
								</div>
								{gfBadge && (
									<span
										title={gfBadge.title}
										style={{
											flexShrink: 0,
											fontSize: 10,
											fontWeight: 600,
											letterSpacing: 0.3,
											textTransform: "uppercase",
											padding: "1px 6px",
											borderRadius: 999,
											background: `${gfBadge.color}22`,
											color: gfBadge.color,
											border: `1px solid ${gfBadge.color}55`,
											lineHeight: 1.4,
										}}
									>
										{gfBadge.label}
									</span>
								)}
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}

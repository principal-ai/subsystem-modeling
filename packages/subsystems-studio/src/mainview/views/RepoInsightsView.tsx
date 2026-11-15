import { useEffect, useState } from "react";
import { ExternalLink, FolderGit2, GitCommitHorizontal, Users } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import type { MergedPullRequestRepo, RepoInsights } from "../../shared/contract";
import { repoAvatarUrl } from "@principal-ai/subsystems-react";
import { electrobun } from "../rpc";
import { CenteredMessage, relativeTime } from "../ui";
import { SkeletonBar, SkeletonStyles } from "../components/Skeleton";
import { RepoCitySkeleton } from "../components/RepoCitySkeleton";
import { RepoActivityMap } from "./RepoActivityMap";

export function RepoInsightsView({ owner, repo }: { owner: string; repo: string }) {
	const { theme } = useTheme();
	const [localRepo, setLocalRepo] = useState<MergedPullRequestRepo | null>(null);
	const [insights, setInsights] = useState<RepoInsights | null>(null);
	const [repoLoading, setRepoLoading] = useState(true);
	const [createdLoading, setCreatedLoading] = useState(true);
	const [mergeLoading, setMergeLoading] = useState(true);
	const [gitLoading, setGitLoading] = useState(true);
	const [linesLoading, setLinesLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [lineWarnings, setLineWarnings] = useState<string[]>([]);
	const [refreshToken, setRefreshToken] = useState(0);
	const [avatarBroken, setAvatarBroken] = useState(false);
	const [selectedContributorId, setSelectedContributorId] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		setLocalRepo(null);
		setInsights(null);
		setRepoLoading(true);
		setCreatedLoading(true);
		setMergeLoading(true);
		setGitLoading(true);
		setLinesLoading(true);
		setError(null);
		setLineWarnings([]);
		void electrobun.rpc!.request.listMergedPullRequestRepos({})
			.then((repoResult) => {
				if (cancelled) return;
				const matchingRepo = repoResult.repos.find(
					(entry) =>
						entry.owner.toLowerCase() === owner.toLowerCase() &&
						entry.name.toLowerCase() === repo.toLowerCase(),
				);
				setLocalRepo(matchingRepo ?? null);
				if (!matchingRepo) setError("This repository is not cloned locally.");
			})
			.catch((loadError) => {
				if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError));
			})
			.finally(() => {
				if (!cancelled) setRepoLoading(false);
			});
		void electrobun.rpc!.request.getRepoCreatedAt({ owner, repo })
			.then((result) => {
				if (cancelled) return;
				if (!result.ok) {
					setError(result.error ?? "Could not load repository creation date.");
				} else {
					setInsights((current) => ({
						...(current ?? { contributors: [] }),
						createdAt: result.createdAt,
						description: result.description,
					}));
				}
			})
			.catch((loadError) => {
				if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError));
			})
			.finally(() => {
				if (!cancelled) setCreatedLoading(false);
			});
		void electrobun.rpc!.request.getRepoLastMerge({ owner, repo })
			.then((result) => {
				if (cancelled) return;
				if (!result.ok) {
					setError(result.error ?? "Could not load the last merge date.");
				} else {
					setInsights((current) => ({
						...(current ?? { contributors: [] }),
						lastMergeAt: result.lastMergeAt,
					}));
				}
			})
			.catch((loadError) => {
				if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError));
			})
			.finally(() => {
				if (!cancelled) setMergeLoading(false);
			});
		void electrobun.rpc!.request.getRepoGitSummary({ owner, repo })
			.then((result) => {
				if (cancelled) return;
				if (!result.ok) {
					setError(result.error ?? "Could not load local git history.");
				} else {
					setInsights((current) => ({
						...(current ?? { contributors: [] }),
						lastCommit: result.lastCommit,
						contributorCount: result.contributorCount,
					}));
				}
			})
			.catch((loadError) => {
				if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError));
			})
			.finally(() => {
				if (!cancelled) setGitLoading(false);
			});
		void electrobun.rpc!.request.getRepoLineBreakdown({ owner, repo })
			.then((result) => {
				if (cancelled) return;
				if (!result.ok) {
					setError(result.error ?? "Could not calculate contributor line attribution.");
					return;
				}
				setInsights((current) => ({
					...(current ?? { contributors: [] }),
					lineCount: result.lineCount,
					contributors: result.contributors ?? [],
				}));
				setLineWarnings(result.warnings ?? []);
			})
			.catch((loadError) => {
				if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError));
			})
			.finally(() => {
				if (!cancelled) setLinesLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [owner, repo, refreshToken]);

	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const border = theme.colors.border ?? "#333";
	const cardBackground = theme.colors.backgroundSecondary ?? theme.colors.background;
	const contributorSkeletonCount = Math.min(
		Math.max(insights?.contributorCount ?? 4, 1),
		6,
	);
	const selectedContributor = insights?.contributors.find(
		(contributor) => contributor.id === selectedContributorId,
	);
	if (!owner || !repo) {
		return <CenteredMessage title="Repository not specified" />;
	}

	return (
		<div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: theme.colors.background, color: theme.colors.text, fontFamily: theme.fonts.body }}>
			<header style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 18px", borderBottom: `1px solid ${border}`, background: cardBackground }}>
				<div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
					<div style={{ width: 32, height: 32, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", border: `1px solid ${border}`, borderRadius: 7, background: theme.colors.background }}>
						{avatarBroken ? (
							<FolderGit2 size={18} color={muted} aria-hidden="true" />
						) : (
							<img
								src={repoAvatarUrl(`pkg:github/${owner}/${repo}`)}
								alt=""
								width={32}
								height={32}
								onError={() => setAvatarBroken(true)}
								style={{ width: "100%", height: "100%", objectFit: "cover" }}
							/>
						)}
					</div>
					<div style={{ minWidth: 0 }}>
						<div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: theme.fontSizes[3], fontWeight: 650 }}>{repo}</div>
						{insights?.description && (
							<div title={insights.description} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: muted, fontSize: theme.fontSizes[0] }}>
								{insights.description}
							</div>
						)}
					</div>
				</div>
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<button
						type="button"
						onClick={() => setRefreshToken((current) => current + 1)}
						disabled={repoLoading || createdLoading || mergeLoading || gitLoading || linesLoading}
						style={{ padding: "6px 10px", border: `1px solid ${border}`, borderRadius: 6, background: "transparent", color: muted, cursor: repoLoading || createdLoading || mergeLoading || gitLoading || linesLoading ? "default" : "pointer", font: "inherit", fontSize: theme.fontSizes[0] }}
					>
						{repoLoading || createdLoading || mergeLoading || gitLoading || linesLoading ? "Refreshing…" : "Refresh"}
					</button>
					<button
						type="button"
						onClick={() => void electrobun.rpc!.request.openExternal({ url: localRepo?.url ?? `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` })}
						title="Open repository on GitHub"
						aria-label="Open repository on GitHub"
						style={{ width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", border: `1px solid ${border}`, borderRadius: 6, background: "transparent", color: muted, cursor: "pointer" }}
					>
						<ExternalLink size={14} aria-hidden="true" />
					</button>
				</div>
			</header>
			<div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
				<section aria-label={`${owner}/${repo} file city`} style={{ minWidth: 0, minHeight: 0, display: "flex", borderRight: `1px solid ${border}` }}>
					{localRepo ? (
						<RepoActivityMap
							repos={[localRepo]}
							layersByRepo={new Map()}
							selectedRepoKeys={new Set()}
							onToggleRepo={() => {}}
							onHoverRepo={() => {}}
							hoveredLayerId={null}
							layerSingular="merged PR"
							layerPlural="merged PRs"
							coverageNoun="changed-file references"
							listLabel={`${owner}/${repo} map`}
						emptyTitle="Repository map unavailable"
							emptyDetail="The local checkout could not be loaded as a File City."
							showFailedRepos
							display="city"
							highlightedFiles={selectedContributor?.files}
						/>
					) : (
						repoLoading ? (
							<div style={{ flex: 1, minWidth: 0, minHeight: 0, position: "relative", overflow: "hidden" }}>
								<RepoCitySkeleton />
							</div>
						) : (
							<CenteredMessage title="Local checkout unavailable" />
						)
					)}
				</section>
				<main style={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", padding: 18 }}>
					{error && <div role="status" style={{ marginBottom: 14, padding: 10, border: `1px solid ${theme.colors.error ?? "#e5534b"}66`, borderRadius: 6, color: theme.colors.error ?? "#e5534b", fontSize: theme.fontSizes[1] }}>{error}</div>}
					<>
							<div style={{ flexShrink: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
								<StatCard label="Created" value={createdLoading ? "Loading…" : formatDate(insights?.createdAt)} theme={theme} />
								<StatCard label="Last merge" value={mergeLoading ? "Loading…" : formatDate(insights?.lastMergeAt)} theme={theme} />
								<StatCard label="Tracked lines" value={linesLoading ? "Loading…" : formatNumber(insights?.lineCount)} theme={theme} />
								<StatCard label="Files" value={linesLoading ? "Loading…" : formatNumber(insights?.fileCount)} theme={theme} />
								<StatCard label="Contributors" value={gitLoading ? "Loading…" : formatNumber(insights?.contributorCount ?? insights?.contributors.length)} theme={theme} />
							</div>
							<section style={{ flexShrink: 0, marginTop: 18, padding: 14, border: `1px solid ${border}`, borderRadius: 8, background: cardBackground }}>
								<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: theme.fontSizes[1], fontWeight: 600 }}>
									<GitCommitHorizontal size={15} aria-hidden="true" /> Latest commit
								</div>
								{gitLoading ? (
									<div style={{ color: muted, fontSize: theme.fontSizes[1] }}>Loading commit details…</div>
								) : insights?.lastCommit ? (
									<>
										<div style={{ overflowWrap: "anywhere", fontSize: theme.fontSizes[1] }}>{insights.lastCommit.message}</div>
										<div style={{ marginTop: 7, color: muted, fontFamily: theme.fonts.monospace, fontSize: theme.fontSizes[0] }}>
											{insights.lastCommit.sha.slice(0, 8)} · {relativeTime(Date.parse(insights.lastCommit.committedAt))}
										</div>
									</>
								) : <div style={{ color: muted, fontSize: theme.fontSizes[1] }}>No commit details available.</div>}
							</section>
							<section style={{ flex: 1, minHeight: 0, overflowY: "auto", marginTop: 18, paddingRight: 6, paddingBottom: 8 }}>
								<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: theme.fontSizes[2], fontWeight: 650 }}>
									<Users size={16} aria-hidden="true" /> Contributor lines
								</div>
								<div style={{ marginBottom: 12, color: muted, fontSize: theme.fontSizes[0] }}>Most lines first · current tracked lines attributed by Git blame.</div>
								{linesLoading ? (
									<div role="status" aria-label="Loading contributor line attribution" style={{ padding: "4px 0", display: "flex", flexDirection: "column", gap: 12 }}>
										<SkeletonStyles />
										{Array.from({ length: contributorSkeletonCount }, (_, index) => (
											<div key={`contributor-skeleton-${index}`} style={{ display: "grid", gridTemplateColumns: "minmax(90px, 1fr) 84px", gap: "6px 10px", alignItems: "center" }}>
												<SkeletonBar width={`${48 + (index % 3) * 13}%`} height={11} delay={index * 70} />
												<SkeletonBar width="84px" height={10} delay={index * 70} />
												<div style={{ gridColumn: "1 / -1" }}>
													<SkeletonBar width="100%" height={4} delay={index * 70} radius={3} />
												</div>
											</div>
										))}
									</div>
								) : insights?.contributors.length ? (
									<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
										{insights.contributors.map((contributor, index) => {
											const percent = insights.lineCount ? (contributor.lines / insights.lineCount) * 100 : 0;
											return (
												<ContributorLineRow
													key={`${index}-${contributor.name}`}
													contributor={contributor}
													percent={percent}
													theme={theme}
													border={border}
													muted={muted}
													selected={selectedContributorId === contributor.id}
													onClick={() => setSelectedContributorId((current) => current === contributor.id ? null : contributor.id)}
												/>
											);
										})}
									</div>
								) : (
									<div style={{ padding: 12, border: `1px solid ${border}`, borderRadius: 6, color: muted, fontSize: theme.fontSizes[1] }}>No line attribution is available for this checkout.</div>
								)}
							</section>
							{[...(insights?.warnings ?? []), ...lineWarnings].map((warning, index) => (
								<div key={`${index}-${warning}`} style={{ marginTop: 12, color: muted, fontSize: theme.fontSizes[0] }}>{warning}</div>
							))}
					</>
				</main>
			</div>
		</div>
	);
}

function StatCard({ label, value, theme }: { label: string; value: string; theme: ReturnType<typeof useTheme>["theme"] }) {
	return (
		<div style={{ minWidth: 0, padding: 12, border: `1px solid ${theme.colors.border ?? "#333"}`, borderRadius: 8, background: theme.colors.backgroundSecondary ?? theme.colors.background }}>
			<div style={{ color: theme.colors.textMuted ?? theme.colors.textSecondary, fontSize: theme.fontSizes[0], textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
			<div title={value} style={{ marginTop: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: theme.fontSizes[2], fontWeight: 650 }}>{value}</div>
		</div>
	);
}

function ContributorLineRow({
	contributor,
	percent,
	theme,
	border,
	muted,
	selected,
	onClick,
}: {
	contributor: { id: string; name: string; lines: number; files: string[]; avatarUrl?: string };
	percent: number;
	theme: ReturnType<typeof useTheme>["theme"];
	border: string;
	muted: string;
	selected: boolean;
	onClick: () => void;
}) {
	const [avatarBroken, setAvatarBroken] = useState(false);
	return (
		<button
			type="button"
			aria-pressed={selected}
			aria-label={`${selected ? "Remove highlight for" : "Highlight"} ${contributor.name}: ${formatNumber(contributor.files.length)} files`}
			title={`${selected ? "Clear map highlight" : "Highlight"} ${contributor.name}'s contributed files`}
			onClick={onClick}
			style={{
				width: "100%",
				display: "grid",
				gridTemplateColumns: "28px minmax(0, 1fr) auto",
				gap: "4px 8px",
				alignItems: "center",
				padding: 4,
				border: "none",
				borderRadius: 6,
				background: selected ? `${theme.colors.primary}18` : "transparent",
				color: theme.colors.text,
				textAlign: "left",
				cursor: "pointer",
				font: "inherit",
			}}
		>
			<div style={{ width: 24, height: 24, overflow: "hidden", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: theme.colors.backgroundSecondary ?? theme.colors.background, color: muted, fontSize: theme.fontSizes[0] }}>
				{contributor.avatarUrl && !avatarBroken ? (
					<img
						src={contributor.avatarUrl}
						alt=""
						width={24}
						height={24}
						onError={() => setAvatarBroken(true)}
						style={{ width: 24, height: 24, objectFit: "cover" }}
					/>
				) : contributor.name.slice(0, 1).toUpperCase()}
			</div>
			<div title={contributor.name} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: theme.fontSizes[1] }}>{contributor.name}</div>
			<div style={{ color: muted, fontFamily: theme.fonts.monospace, fontSize: theme.fontSizes[0], whiteSpace: "nowrap" }}>{formatNumber(contributor.lines)} · {formatNumber(contributor.files.length)} files · {percent.toFixed(1)}%</div>
			<div style={{ gridColumn: "1 / -1", height: 4, overflow: "hidden", borderRadius: 3, background: border }}>
				<div style={{ width: `${percent}%`, height: "100%", background: theme.colors.primary }} />
			</div>
		</button>
	);
}

function formatDate(value?: string): string {
	if (!value) return "—";
	const date = new Date(value);
	return Number.isFinite(date.getTime())
		? date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
		: "—";
}

function formatNumber(value?: number): string {
	return value === undefined ? "—" : new Intl.NumberFormat().format(value);
}

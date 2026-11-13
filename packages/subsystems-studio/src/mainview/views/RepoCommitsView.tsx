import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
	ChevronDown,
	ChevronRight,
	ExternalLink,
	FileDiff,
	GitCommitHorizontal,
	RefreshCw,
} from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import type {
	MergedPullRequestRepo,
	RepoCommit,
} from "../../shared/contract";
import { electrobun, showFailedRepoCityCardsSubscribers } from "../rpc";
import { CenteredMessage, relativeTime } from "../ui";
import { RepoActivityMap } from "./RepoActivityMap";
import {
	AuthorFilterChip,
	Notice,
	OrganizationSelector,
} from "./MergedPullRequestsView";
import {
	ACTIVITY_WINDOWS as WINDOWS,
	ACTIVITY_POLL_INTERVAL_MS,
	asQueryDate,
	inActivityWindow as inWindow,
	windowStart,
	type ActivityWindow as CommitWindow,
} from "./repoActivityWindows";

function commitLayerId(commit: RepoCommit): string {
	return `${commit.owner}/${commit.repo}@${commit.sha}`;
}

function commitUrl(commit: RepoCommit): string {
	return `https://github.com/${commit.owner}/${commit.repo}/commit/${commit.sha}`;
}

export function RepoCommitsView() {
	const { theme } = useTheme();
	const [repos, setRepos] = useState<MergedPullRequestRepo[] | null>(null);
	const [owner, setOwner] = useState("");
	const [window, setWindow] = useState<CommitWindow>("today");
	const [selectedRepos, setSelectedRepos] = useState<ReadonlySet<string>>(() => new Set());
	const [selectedAuthors, setSelectedAuthors] = useState<ReadonlySet<string>>(() => new Set());
	const [commits, setCommits] = useState<RepoCommit[]>([]);
	const [showFailedRepos, setShowFailedRepos] = useState(false);
	const [hoveredRepoKey, setHoveredRepoKey] = useState<string | null>(null);
	const [hoveredCommitId, setHoveredCommitId] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [repoErrors, setRepoErrors] = useState<string[]>([]);
	const [truncatedRepos, setTruncatedRepos] = useState<string[]>([]);
	const requestId = useRef(0);

	const refreshRepos = useCallback(async () => {
		try {
			const result = await electrobun.rpc!.request.listMergedPullRequestRepos({});
			setRepos(result.repos);
			setOwner((current) =>
				current && result.repos.some((repo) => repo.owner === current)
					? current
					: (result.repos[0]?.owner ?? ""),
			);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setRepos([]);
		}
	}, []);

	useEffect(() => {
		let settingsChanged = false;
		const onShowFailedRepoCityCards = (enabled: boolean) => {
			settingsChanged = true;
			setShowFailedRepos(enabled);
		};
		showFailedRepoCityCardsSubscribers.add(onShowFailedRepoCityCards);
		void electrobun.rpc!.request
			.getSettings({})
			.then((settings) => {
				if (!settingsChanged) {
					setShowFailedRepos(settings.showFailedRepoCityCards);
				}
			})
			.catch(() => {});
		return () => {
			showFailedRepoCityCardsSubscribers.delete(onShowFailedRepoCityCards);
		};
	}, []);

	useEffect(() => {
		void refreshRepos();
	}, [refreshRepos]);

	const owners = useMemo(
		() => [...new Set((repos ?? []).map((repo) => repo.owner))].sort((a, b) => a.localeCompare(b)),
		[repos],
	);
	const repoCounts = useMemo(() => {
		const counts = new Map<string, number>();
		for (const repo of repos ?? []) counts.set(repo.owner, (counts.get(repo.owner) ?? 0) + 1);
		return counts;
	}, [repos]);
	const orgRepos = useMemo(
		() => (repos ?? []).filter((repo) => repo.owner === owner),
		[repos, owner],
	);
	const orgRepoKeys = useMemo(
		() => new Set(orgRepos.map((repo) => `pkg:github/${repo.owner}/${repo.name}`)),
		[orgRepos],
	);
	useEffect(() => {
		setSelectedRepos(new Set());
	}, [owner]);
	useEffect(() => {
		setSelectedAuthors(new Set());
	}, [owner, window]);

	const toggleRepo = useCallback((repoKey: string) => {
		setSelectedRepos((current) => {
			const next = new Set(current);
			if (next.has(repoKey)) next.delete(repoKey);
			else next.add(repoKey);
			return next;
		});
	}, []);

	const loadCommits = useCallback(() => {
		if (!owner || repos === null) return undefined;
		const id = ++requestId.current;
		const sinceStart = windowStart(window);
		// Query a day wider than the local window; local checkouts may sit in
		// any timezone while the window is evaluated in the viewer's own.
		sinceStart.setDate(sinceStart.getDate() - 1);
		const since = asQueryDate(sinceStart);
		setLoading(true);
		setError(null);
		setRepoErrors([]);
		setTruncatedRepos([]);
		void electrobun.rpc!.request
			.listRepoCommits({ owner, since })
			.then((result) => {
				if (id !== requestId.current) return;
				setCommits(result.commits);
				setError(result.ok ? null : (result.error ?? "Could not load commits."));
				setRepoErrors(result.errors ?? []);
				setTruncatedRepos(result.truncatedRepos ?? []);
			})
			.catch((err) => {
				if (id !== requestId.current) return;
				setCommits([]);
				setError(err instanceof Error ? err.message : String(err));
			})
			.finally(() => {
				if (id === requestId.current) setLoading(false);
			});
		return id;
	}, [owner, repos, window]);

	useEffect(() => {
		const id = loadCommits();
		return () => {
			if (id !== undefined && id === requestId.current) requestId.current++;
		};
	}, [loadCommits]);

	// Re-check for new commits on a timer; skipped while the window is hidden
	// to avoid GitHub API fan-out for a background tab.
	useEffect(() => {
		const timer = setInterval(() => {
			if (document.hidden) return;
			loadCommits();
		}, ACTIVITY_POLL_INTERVAL_MS);
		return () => clearInterval(timer);
	}, [loadCommits]);

	const commitsInWindow = useMemo(() => {
		const now = new Date();
		return commits.filter((commit) => inWindow(commit.committedAt, window, now));
	}, [commits, window]);
	const authors = useMemo(() => {
		const byLogin = new Map<string, { login: string; avatarUrl?: string; count: number }>();
		for (const commit of commitsInWindow) {
			if (!commit.author) continue;
			const existing = byLogin.get(commit.author);
			if (existing) existing.count++;
			else byLogin.set(commit.author, { login: commit.author, avatarUrl: commit.authorAvatarUrl, count: 1 });
		}
		return [...byLogin.values()].sort((a, b) => b.count - a.count || a.login.localeCompare(b.login));
	}, [commitsInWindow]);
	const authorFilteredCommits = useMemo(
		() => selectedAuthors.size === 0
			? commitsInWindow
			: commitsInWindow.filter((commit) => commit.author != null && selectedAuthors.has(commit.author)),
		[commitsInWindow, selectedAuthors],
	);
	const layersByRepo = useMemo(() => {
		const byRepo = new Map<string, Array<{ id: string; title: string; files: string[] }>>();
		for (const commit of authorFilteredCommits) {
			const key = `pkg:github/${commit.owner}/${commit.repo}`;
			const list = byRepo.get(key) ?? [];
			list.push({
				id: commitLayerId(commit),
				title: `${commit.sha.slice(0, 7)} · ${commit.message}`,
				files: commit.files ?? [],
			});
			byRepo.set(key, list);
		}
		return byRepo;
	}, [authorFilteredCommits]);
	const visibleCommits = useMemo(
		() =>
			authorFilteredCommits.filter((commit) => {
				const key = `pkg:github/${commit.owner}/${commit.repo}`;
				return orgRepoKeys.has(key) && (selectedRepos.size === 0 || selectedRepos.has(key));
			}),
		[authorFilteredCommits, orgRepoKeys, selectedRepos],
	);
	const toggleAuthor = useCallback((login: string) => {
		setSelectedAuthors((current) => {
			const next = new Set(current);
			if (next.has(login)) next.delete(login);
			else next.add(login);
			return next;
		});
	}, []);
	if (repos === null) return <CenteredMessage title="Loading local repositories…" />;
	if (repos.length === 0) {
		return (
			<CenteredMessage
				title="No locally cloned GitHub repos"
				detail="Open a GitHub repository in Principal to register its checkout."
			/>
		);
	}

	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	return (
		<div
			style={{
				flex: 1,
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
				background: theme.colors.background,
				color: theme.colors.text,
				fontFamily: theme.fonts.body,
			}}
		>
			<style>{`.repo-commits-author-filters{scrollbar-width:none}.repo-commits-author-filters::-webkit-scrollbar{display:none;width:0;height:0}
.merged-pr-org-option{background:transparent}
.merged-pr-org-option:hover,.merged-pr-org-option:focus,.merged-pr-org-option[aria-checked="true"]{background:var(--merged-pr-org-hover)}
.merged-pr-org-option:focus-visible{outline:1px solid var(--merged-pr-org-accent);outline-offset:-1px}`}</style>
			<header
				style={{
					flexShrink: 0,
					display: "flex",
					flexDirection: "column",
					borderBottom: `1px solid ${theme.colors.border ?? "#333"}`,
					background: theme.colors.backgroundSecondary ?? theme.colors.background,
				}}
			>
			<div style={{ display: "flex", alignItems: "stretch", minHeight: 36 }}>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 10,
						padding: "0 14px",
						borderRight: `1px solid ${theme.colors.border ?? "#333"}`,
					}}
				>
					<span
						style={{
							fontSize: theme.fontSizes[0],
							color: muted,
							textTransform: "uppercase",
							letterSpacing: 0.3,
						}}
					>
						Organization
					</span>
					<OrganizationSelector
						owners={owners}
						owner={owner}
						repoCounts={repoCounts}
						onChange={setOwner}
					/>
				</div>
				<div style={{ flex: 1, minWidth: 0, display: "flex" }}>
					{WINDOWS.map(({ key, label }, index) => {
						const active = window === key;
						return (
							<button
								key={key}
								type="button"
								aria-pressed={active}
								onClick={() => setWindow(key)}
								style={{
									padding: "0 14px",
									border: "none",
									borderRight: index < WINDOWS.length - 1 ? `1px solid ${theme.colors.border ?? "#333"}` : "none",
									background: active ? `${theme.colors.primary}22` : "transparent",
									color: active ? theme.colors.primary : muted,
									fontFamily: theme.fonts.body,
									fontSize: theme.fontSizes[0],
									fontWeight: active ? 600 : 400,
									letterSpacing: 0.3,
									textTransform: "uppercase",
									cursor: "pointer",
								}}
							>
								{label}
							</button>
						);
					})}
				</div>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						padding: "0 12px",
						color: muted,
						fontFamily: theme.fonts.monospace,
						fontSize: theme.fontSizes[0],
						whiteSpace: "nowrap",
					}}
				>
					{loading ? "Loading…" : `${visibleCommits.length} commits`}
				</div>
				<button
					type="button"
					aria-label="Refresh local repositories and commits"
					title="Refresh local repositories and commits"
					disabled={loading}
					onClick={() => void refreshRepos()}
					style={{
						width: 36,
						border: "none",
						borderLeft: `1px solid ${theme.colors.border ?? "#333"}`,
						background: "transparent",
						color: muted,
						cursor: loading ? "default" : "pointer",
						opacity: loading ? 0.5 : 1,
					}}
				>
					<RefreshCw size={14} aria-hidden="true" />
				</button>
			</div>
			{authors.length > 0 && (
				<div
					role="group"
					aria-label="Filter commits by author"
					className="repo-commits-author-filters"
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						minHeight: 44,
						padding: "4px 12px",
						borderTop: `1px solid ${theme.colors.border ?? "#333"}`,
						overflowX: "auto",
					}}
				>
					<span style={{ flexShrink: 0, color: muted, fontSize: theme.fontSizes[0], textTransform: "uppercase", letterSpacing: 0.3 }}>
						Authors
					</span>
					{selectedAuthors.size > 0 && (
						<button
							type="button"
							onClick={() => setSelectedAuthors(new Set())}
							style={{ flexShrink: 0, border: "none", background: "transparent", color: theme.colors.primary, cursor: "pointer", fontFamily: theme.fonts.body, fontSize: theme.fontSizes[0] }}
						>
							Clear
						</button>
					)}
					{authors.map((author) => (
						<AuthorFilterChip
							key={author.login}
							login={author.login}
							avatarUrl={author.avatarUrl}
							count={author.count}
							selected={selectedAuthors.has(author.login)}
							onClick={() => toggleAuthor(author.login)}
						/>
					))}
				</div>
			)}
			</header>

			<div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
				<div
					style={{
						width: "42%",
						minWidth: 300,
						minHeight: 0,
						display: "flex",
						flexDirection: "column",
						overflow: "hidden",
						borderRight: `1px solid ${theme.colors.border ?? "#333"}`,
					}}
				>
					<RepoActivityMap
						repos={orgRepos}
						layersByRepo={layersByRepo}
						showFailedRepos={showFailedRepos}
						selectedRepoKeys={selectedRepos}
						onToggleRepo={toggleRepo}
						onHoverRepo={setHoveredRepoKey}
						hoveredLayerId={hoveredCommitId}
						layerSingular="commit"
						layerPlural="commits"
						coverageNoun="changed-file references"
						listLabel="Commit maps"
						emptyTitle="No repo maps available"
						emptyDetail="The locally cloned repositories could not be turned into File Cities."
					/>
				</div>
				<main style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
					{error && <Notice theme={theme} danger>{error}</Notice>}
					{repoErrors.map((item) => <Notice key={item} theme={theme} danger>{item}</Notice>)}
					{truncatedRepos.length > 0 && (
						<Notice theme={theme}>
							Showing the newest 100 commits per repo for: {truncatedRepos.join(", ")}.
						</Notice>
					)}
					{loading && commits.length === 0 ? (
						<CenteredMessage title="Loading recent commits…" />
					) : visibleCommits.length === 0 ? (
						<CenteredMessage
							title={error ? "Could not load commits" : "No commits"}
							detail={error ? undefined : selectedRepos.size ? "No commits on the selected repos' branches in this window." : `No commits on ${owner}'s checked-out branches in this window.`}
						/>
					) : (
						<div style={{ maxWidth: 960, margin: "0 auto" }}>
							{visibleCommits.map((commit) => {
								const id = commitLayerId(commit);
								const repoKey = `pkg:github/${commit.owner}/${commit.repo}`;
								return (
									<RepoCommitCard
										key={id}
										commit={commit}
										highlighted={hoveredRepoKey === repoKey}
										onHover={() => setHoveredCommitId(id)}
										onLeave={() => setHoveredCommitId(null)}
										onOpen={() => void electrobun.rpc!.request.openExternal({ url: commitUrl(commit) })}
									/>
								);
							})}
						</div>
					)}
				</main>
			</div>
		</div>
	);
}

function RepoCommitCard({
	commit,
	highlighted,
	onHover,
	onLeave,
	onOpen,
}: {
	commit: RepoCommit;
	highlighted: boolean;
	onHover: () => void;
	onLeave: () => void;
	onOpen: () => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [expanded, setExpanded] = useState(false);
	const [avatarBroken, setAvatarBroken] = useState(false);
	const committedTime = Date.parse(commit.committedAt);
	const files = commit.files ?? [];
	return (
		<div
			data-repo-commit={`${commit.owner}/${commit.repo}@${commit.sha.slice(0, 12)}`}
			onMouseEnter={onHover}
			onMouseLeave={onLeave}
			style={{
				padding: 12,
				minHeight: 52,
				borderBottom: `1px solid ${theme.colors.border ?? "#333"}`,
				background: highlighted ? `${theme.colors.primary}12` : "transparent",
				transition: "background 120ms ease",
			}}
		>
			<div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
				<div style={{ flex: "1 1 220px", minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
					<GitCommitHorizontal
						size={14}
						style={{ flexShrink: 0, color: commit.merge ? (theme.colors.success ?? "#3d9a5f") : muted }}
						aria-hidden="true"
					/>
					<div
						title={commit.merge ? "Merge commit" : undefined}
						style={{ minWidth: 0, overflowWrap: "anywhere", color: highlighted ? theme.colors.primary : theme.colors.text }}
					>
						{commit.message || "(no message)"}
					</div>
				</div>
				<ActionButton
					icon={expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
					label={expanded ? "Hide files" : `Files · ${files.length}`}
					ariaLabel={`${expanded ? "Hide" : "Show"} changed files for ${commit.message}`}
					onClick={() => setExpanded((value) => !value)}
				/>
				<ActionButton
					icon={<ExternalLink size={12} />}
					label={`#${commit.sha.slice(0, 7)}`}
					ariaLabel={`Open commit ${commit.sha.slice(0, 12)} on GitHub`}
					onClick={onOpen}
				/>
			</div>
			<div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 5, paddingLeft: 0, fontSize: theme.fontSizes[0], fontFamily: theme.fonts.monospace, color: muted }}>
				<span
					aria-hidden="true"
					title={commit.author ? `Committed by ${commit.author}` : undefined}
					style={{ width: 14, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
				>
					{commit.author ? (
						commit.authorAvatarUrl && !avatarBroken ? (
							<img
								src={commit.authorAvatarUrl}
								alt=""
								width={14}
								height={14}
								onError={() => setAvatarBroken(true)}
								style={{ width: 14, height: 14, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
							/>
						) : (
							<span
								aria-hidden="true"
								style={{
									width: 14,
									height: 14,
									borderRadius: "50%",
									display: "inline-flex",
									alignItems: "center",
									justifyContent: "center",
									background: theme.colors.backgroundSecondary ?? "#333",
									color: muted,
									fontSize: 8,
									fontWeight: 700,
									flexShrink: 0,
								}}
							>
								{commit.author.slice(0, 1).toUpperCase()}
							</span>
						)
					) : null}
				</span>
				<span>{commit.owner}/{commit.repo}</span>
				{commit.author && <span>· {commit.author}</span>}
				<span>· {files.length} file{files.length === 1 ? "" : "s"}</span>
				{commit.branch && <span>· {commit.branch}</span>}
				{commit.merge && <span>· merge</span>}
				{Number.isFinite(committedTime) && <time dateTime={commit.committedAt} title={new Date(committedTime).toLocaleString()}>· committed {relativeTime(committedTime)}</time>}
			</div>
			<div style={{ display: "grid", gridTemplateRows: expanded ? "1fr" : "0fr", transition: "grid-template-rows 220ms cubic-bezier(0.4, 0, 0.2, 1)" }}>
				<div inert={!expanded} style={{ minHeight: 0, overflow: "hidden" }}>
					{expanded && (
						<div style={{ marginTop: 8, marginLeft: 22, paddingTop: 8, borderTop: `1px solid ${theme.colors.border ?? "#333"}`, display: "flex", flexDirection: "column", gap: 4 }}>
							<div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, fontSize: theme.fontSizes[0], color: muted }}>
								<FileDiff size={12} aria-hidden="true" /> Changed paths · highlighted in repo map
							</div>
							{files.length === 0 ? (
								<div style={{ fontSize: theme.fontSizes[1], color: muted }}>No changed-file paths were recorded for this commit.</div>
							) : files.map((path) => (
								<div key={path} title={path} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: theme.fonts.monospace, fontSize: theme.fontSizes[0] }}>
									{path}
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

function ActionButton({
	icon,
	label,
	ariaLabel,
	onClick,
}: {
	icon: ReactNode;
	label: string;
	ariaLabel: string;
	onClick: () => void;
}) {
	const { theme } = useTheme();
	const [hovered, setHovered] = useState(false);
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	return (
		<button
			type="button"
			aria-label={ariaLabel}
			onClick={onClick}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			style={{
				flexShrink: 0,
				display: "inline-flex",
				alignItems: "center",
				gap: 4,
				padding: "4px 8px",
				borderRadius: 4,
				border: `1px solid ${hovered ? theme.colors.primary : theme.colors.border ?? "#333"}`,
				background: "transparent",
				color: hovered ? theme.colors.primary : muted,
				cursor: "pointer",
				fontSize: theme.fontSizes[0],
				fontFamily: theme.fonts.body,
			}}
		>
			{icon}{label}
		</button>
	);
}


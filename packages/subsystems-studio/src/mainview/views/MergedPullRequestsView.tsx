import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
	ChevronDown,
	ChevronRight,
	ExternalLink,
	FileDiff,
	GitPullRequest,
	RefreshCw,
} from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import type {
	MergedPullRequest,
	MergedPullRequestRepo,
} from "../../shared/contract";
import { electrobun } from "../rpc";
import { CenteredMessage, relativeTime } from "../ui";
import { MergedPullRequestRepoMap, pullRequestLayerId } from "./MergedPullRequestRepoMap";

type MergedWindow = "today" | "yesterday" | "week" | "all";
type PullRequestDiffState = {
	files?: string[];
	loading: boolean;
	error?: string;
	truncated?: boolean;
};

const WINDOWS: ReadonlyArray<{ key: MergedWindow; label: string }> = [
	{ key: "today", label: "Today" },
	{ key: "yesterday", label: "Yesterday" },
	{ key: "week", label: "This week" },
	{ key: "all", label: "All" },
];

function windowStart(window: MergedWindow, now = new Date()): Date | null {
	if (window === "all") return null;
	const today = new Date(now);
	today.setHours(0, 0, 0, 0);
	if (window === "today") return today;
	if (window === "yesterday") {
		today.setDate(today.getDate() - 1);
		return today;
	}
	const day = today.getDay();
	today.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
	return today;
}

function windowEnd(window: MergedWindow, now = new Date()): Date | null {
	if (window === "all" || window === "week") return null;
	const end = new Date(now);
	if (window === "today") return end;
	end.setHours(0, 0, 0, 0);
	return end;
}

function asQueryDate(date: Date | null): string | undefined {
	if (!date) return undefined;
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function inWindow(mergedAt: string, window: MergedWindow, now: Date): boolean {
	if (window === "all") return true;
	const time = Date.parse(mergedAt);
	if (!Number.isFinite(time)) return false;
	const start = windowStart(window, now)!.getTime();
	const end = windowEnd(window, now)?.getTime() ?? now.getTime();
	return time >= start && (window === "yesterday" ? time < end : time <= end);
}

export function MergedPullRequestsView() {
	const { theme } = useTheme();
	const [repos, setRepos] = useState<MergedPullRequestRepo[] | null>(null);
	const [owner, setOwner] = useState("");
	const [window, setWindow] = useState<MergedWindow>("week");
	const [selectedRepos, setSelectedRepos] = useState<ReadonlySet<string>>(() => new Set());
	const [selectedAuthors, setSelectedAuthors] = useState<ReadonlySet<string>>(() => new Set());
	const [pullRequests, setPullRequests] = useState<MergedPullRequest[]>([]);
	const [hoveredRepoKey, setHoveredRepoKey] = useState<string | null>(null);
	const [hoveredPullRequestId, setHoveredPullRequestId] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [repoErrors, setRepoErrors] = useState<string[]>([]);
	const [truncatedRepos, setTruncatedRepos] = useState<string[]>([]);
	const [fileDiffs, setFileDiffs] = useState<Map<string, PullRequestDiffState>>(() => new Map());
	const fileDiffsRef = useRef(fileDiffs);
	const requestId = useRef(0);

	const updateFileDiff = useCallback((id: string, state: PullRequestDiffState) => {
		const next = new Map(fileDiffsRef.current);
		next.set(id, state);
		fileDiffsRef.current = next;
		setFileDiffs(next);
	}, []);
	const loadPullRequestFiles = useCallback(async (pr: MergedPullRequest) => {
		const id = pullRequestLayerId(pr);
		const current = fileDiffsRef.current.get(id);
		if (current?.loading || (current?.files && !current.error)) return;
		updateFileDiff(id, { loading: true });
		try {
			const result = await electrobun.rpc!.request.getMergedPullRequestFiles({
				owner: pr.owner,
				repo: pr.repo,
				number: pr.number,
			});
			updateFileDiff(
				id,
				result.ok
					? { loading: false, files: result.files ?? [], truncated: result.truncated }
					: { loading: false, error: result.error ?? "Could not load PR files." },
			);
		} catch (error) {
			updateFileDiff(id, {
				loading: false,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}, [updateFileDiff]);

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
		void refreshRepos();
	}, [refreshRepos]);

	const owners = useMemo(
		() => [...new Set((repos ?? []).map((repo) => repo.owner))].sort((a, b) => a.localeCompare(b)),
		[repos],
	);
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

	useEffect(() => {
		if (!owner || repos === null) return;
		const id = ++requestId.current;
		const sinceStart = windowStart(window);
		// Query a day wider than the local window; GitHub indexes merge dates in UTC.
		if (sinceStart) sinceStart.setDate(sinceStart.getDate() - 1);
		const since = asQueryDate(sinceStart);
		setLoading(true);
		setError(null);
		setRepoErrors([]);
		setTruncatedRepos([]);
		void electrobun.rpc!.request
			.listMergedPullRequests({ owner, since })
			.then((result) => {
				if (id !== requestId.current) return;
				setPullRequests(result.pullRequests);
				setError(result.ok ? null : (result.error ?? "Could not load merged PRs."));
				setRepoErrors(result.errors ?? []);
				setTruncatedRepos(result.truncatedRepos ?? []);
			})
			.catch((err) => {
				if (id !== requestId.current) return;
				setPullRequests([]);
				setError(err instanceof Error ? err.message : String(err));
			})
			.finally(() => {
				if (id === requestId.current) setLoading(false);
			});
		return () => {
			if (id === requestId.current) requestId.current++;
		};
	}, [owner, repos, window]);

	const mergedInWindow = useMemo(() => {
		const now = new Date();
		return pullRequests.filter((pr) => inWindow(pr.mergedAt, window, now));
	}, [pullRequests, window]);
	const authors = useMemo(() => {
		const byLogin = new Map<string, { login: string; avatarUrl?: string; count: number }>();
		for (const pr of mergedInWindow) {
			if (!pr.author) continue;
			const existing = byLogin.get(pr.author);
			if (existing) existing.count++;
			else byLogin.set(pr.author, { login: pr.author, avatarUrl: pr.authorAvatarUrl, count: 1 });
		}
		return [...byLogin.values()].sort((a, b) => b.count - a.count || a.login.localeCompare(b.login));
	}, [mergedInWindow]);
	const authorFilteredPullRequests = useMemo(
		() => selectedAuthors.size === 0
			? mergedInWindow
			: mergedInWindow.filter((pr) => pr.author != null && selectedAuthors.has(pr.author)),
		[mergedInWindow, selectedAuthors],
	);
	const mappedPullRequests = useMemo(
		() => authorFilteredPullRequests.map((pr) => ({
			...pr,
			files: fileDiffs.get(pullRequestLayerId(pr))?.files ?? pr.files ?? [],
		})),
		[authorFilteredPullRequests, fileDiffs],
	);
	const visiblePullRequests = useMemo(
		() =>
			authorFilteredPullRequests.filter((pr) => {
				const key = `pkg:github/${pr.owner}/${pr.repo}`;
				return orgRepoKeys.has(key) && (selectedRepos.size === 0 || selectedRepos.has(key));
			}),
		[authorFilteredPullRequests, orgRepoKeys, selectedRepos],
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
			<style>{`.merged-pr-author-filters{scrollbar-width:none}.merged-pr-author-filters::-webkit-scrollbar{display:none;width:0;height:0}`}</style>
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
				<label
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						padding: "0 14px",
						borderRight: `1px solid ${theme.colors.border ?? "#333"}`,
						fontSize: theme.fontSizes[0],
						color: muted,
						textTransform: "uppercase",
						letterSpacing: 0.3,
					}}
				>
					Organization
					<select
						aria-label="GitHub organization"
						value={owner}
						onChange={(event) => setOwner(event.target.value)}
						style={{
							maxWidth: 220,
							border: `1px solid ${theme.colors.border ?? "#444"}`,
							borderRadius: 4,
							padding: "4px 8px",
							background: theme.colors.background,
							color: theme.colors.text,
							fontFamily: theme.fonts.body,
							fontSize: theme.fontSizes[1],
						}}
					>
						{owners.map((item) => <option key={item} value={item}>{item}</option>)}
					</select>
				</label>
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
					{loading ? "Loading…" : `${visiblePullRequests.length} merged`}
				</div>
				<button
					type="button"
					aria-label="Refresh merged pull requests"
					title="Refresh local repositories and merged PRs"
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
					aria-label="Filter merged pull requests by author"
					className="merged-pr-author-filters"
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
						borderRight: `1px solid ${theme.colors.border ?? "#333"}`,
					}}
				>
					<MergedPullRequestRepoMap
						repos={orgRepos}
						pullRequests={mappedPullRequests}
						selectedRepoKeys={selectedRepos}
						onToggleRepo={toggleRepo}
						onHoverRepo={setHoveredRepoKey}
						hoveredPullRequestId={hoveredPullRequestId}
					/>
				</div>
				<main style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
					{error && <Notice theme={theme} danger>{error}</Notice>}
					{repoErrors.map((item) => <Notice key={item} theme={theme} danger>{item}</Notice>)}
					{truncatedRepos.length > 0 && (
						<Notice theme={theme}>
							GitHub search is limited to 1,000 results for: {truncatedRepos.join(", ")}.
						</Notice>
					)}
					{loading && pullRequests.length === 0 ? (
						<CenteredMessage title="Loading merged pull requests…" />
					) : visiblePullRequests.length === 0 ? (
						<CenteredMessage
							title={error ? "Could not load merged pull requests" : "No merged pull requests"}
							detail={error ? undefined : selectedRepos.size ? "No merges for the selected repos in this window." : `No merges for ${owner} in this window.`}
						/>
					) : (
						<div style={{ maxWidth: 960, margin: "0 auto" }}>
							{visiblePullRequests.map((pr) => {
								const id = pullRequestLayerId(pr);
								const repoKey = `pkg:github/${pr.owner}/${pr.repo}`;
								return (
									<MergedPullRequestCard
										key={id}
										pullRequest={pr}
										diff={fileDiffs.get(id)}
										highlighted={hoveredRepoKey === repoKey}
										onHover={() => setHoveredPullRequestId(id)}
										onLeave={() => setHoveredPullRequestId(null)}
										onLoadFiles={() => void loadPullRequestFiles(pr)}
										onOpen={() => void electrobun.rpc!.request.openExternal({ url: pr.url })}
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

function AuthorFilterChip({
	login,
	avatarUrl,
	count,
	selected,
	onClick,
}: {
	login: string;
	avatarUrl?: string;
	count: number;
	selected: boolean;
	onClick: () => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [avatarBroken, setAvatarBroken] = useState(false);
	return (
		<button
			type="button"
			aria-pressed={selected}
			aria-label={`Filter by ${login}, ${count} merged pull request${count === 1 ? "" : "s"}`}
			title={`${login} · ${count} merged PR${count === 1 ? "" : "s"}`}
			onClick={onClick}
			style={{
				flexShrink: 0,
				display: "inline-flex",
				alignItems: "center",
				gap: 6,
				padding: "3px 8px 3px 4px",
				border: `1px solid ${selected ? theme.colors.primary : theme.colors.border ?? "#444"}`,
				borderRadius: 999,
				background: selected ? `${theme.colors.primary}22` : "transparent",
				color: selected ? theme.colors.primary : theme.colors.text,
				cursor: "pointer",
				fontFamily: theme.fonts.body,
				fontSize: theme.fontSizes[0],
			}}
		>
			{avatarUrl && !avatarBroken ? (
				<img
					src={avatarUrl}
					alt=""
					width={24}
					height={24}
					onError={() => setAvatarBroken(true)}
					style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover" }}
				/>
			) : (
				<span
					aria-hidden="true"
					style={{
						width: 24,
						height: 24,
						borderRadius: "50%",
						display: "inline-flex",
						alignItems: "center",
						justifyContent: "center",
						background: theme.colors.background,
						color: muted,
						fontSize: theme.fontSizes[0],
					}}
				>
					{login.slice(0, 1).toUpperCase()}
				</span>
			)}
			<span>{login}</span>
			<span
				style={{
					minWidth: 18,
					padding: "1px 5px",
					borderRadius: 999,
					background: selected ? `${theme.colors.primary}33` : (theme.colors.backgroundSecondary ?? "#333"),
					color: selected ? theme.colors.primary : muted,
					fontFamily: theme.fonts.monospace,
					textAlign: "center",
				}}
			>
				{count}
			</span>
		</button>
	);
}

function MergedPullRequestCard({
	pullRequest,
	diff,
	highlighted,
	onHover,
	onLeave,
	onLoadFiles,
	onOpen,
}: {
	pullRequest: MergedPullRequest;
	diff?: PullRequestDiffState;
	highlighted: boolean;
	onHover: () => void;
	onLeave: () => void;
	onLoadFiles: () => void;
	onOpen: () => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [expanded, setExpanded] = useState(false);
	const mergedTime = Date.parse(pullRequest.mergedAt);
	const files = diff?.files ?? pullRequest.files ?? [];
	const filesLoaded = diff?.files !== undefined || pullRequest.files !== undefined;
	return (
		<div
			data-merged-pull-request={`${pullRequest.owner}/${pullRequest.repo}#${pullRequest.number}`}
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
					<GitPullRequest size={14} style={{ flexShrink: 0, color: theme.colors.success ?? "#3d9a5f" }} aria-hidden="true" />
					<div style={{ minWidth: 0, overflowWrap: "anywhere", color: highlighted ? theme.colors.primary : theme.colors.text }}>
						{pullRequest.title}
					</div>
				</div>
				<ActionButton
					icon={expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
					label={expanded ? "Hide files" : diff?.loading ? "Loading…" : filesLoaded ? `Files · ${files.length}` : "Load diff"}
					ariaLabel={`${expanded ? "Hide" : "Load and show"} changed files for ${pullRequest.title}`}
					onClick={() => {
						const nextExpanded = !expanded;
						setExpanded(nextExpanded);
						if (nextExpanded && !filesLoaded && !diff?.loading) onLoadFiles();
					}}
				/>
				<ActionButton
					icon={<ExternalLink size={12} />}
					label={`#${pullRequest.number}`}
					ariaLabel={`Open pull request ${pullRequest.number} on GitHub`}
					onClick={onOpen}
				/>
			</div>
			<div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 5, paddingLeft: 22, fontSize: theme.fontSizes[0], fontFamily: theme.fonts.monospace, color: muted }}>
				<span>{pullRequest.owner}/{pullRequest.repo}</span>
				{pullRequest.author && <span>· {pullRequest.author}</span>}
				<span>· {filesLoaded ? `${files.length} file${files.length === 1 ? "" : "s"}` : "diff not loaded"}</span>
				{Number.isFinite(mergedTime) && <time dateTime={pullRequest.mergedAt} title={new Date(mergedTime).toLocaleString()}>· merged {relativeTime(mergedTime)}</time>}
			</div>
			<div style={{ display: "grid", gridTemplateRows: expanded ? "1fr" : "0fr", transition: "grid-template-rows 220ms cubic-bezier(0.4, 0, 0.2, 1)" }}>
				<div inert={!expanded} style={{ minHeight: 0, overflow: "hidden" }}>
					{expanded && (
						<div style={{ marginTop: 8, marginLeft: 22, paddingTop: 8, borderTop: `1px solid ${theme.colors.border ?? "#333"}`, display: "flex", flexDirection: "column", gap: 4 }}>
							<div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, fontSize: theme.fontSizes[0], color: muted }}>
								<FileDiff size={12} aria-hidden="true" /> Changed paths · highlighted in repo map
							</div>
							{diff?.loading ? (
								<div style={{ fontSize: theme.fontSizes[1], color: muted }}>Loading changed paths from GitHub…</div>
							) : diff?.error ? (
								<div style={{ fontSize: theme.fontSizes[1], color: theme.colors.error ?? "#e5534b" }}>
									{diff.error}{" "}
									<button type="button" onClick={onLoadFiles} style={{ border: "none", background: "transparent", color: theme.colors.primary, cursor: "pointer", font: "inherit" }}>Retry</button>
								</div>
							) : !filesLoaded ? (
								<div style={{ fontSize: theme.fontSizes[1], color: muted }}>Expand this PR to load its changed paths and highlight the repo map.</div>
							) : files.length === 0 ? (
								<div style={{ fontSize: theme.fontSizes[1], color: muted }}>No changed-file paths were returned by GitHub.</div>
							) : files.map((path) => (
								<div key={path} title={path} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: theme.fonts.monospace, fontSize: theme.fontSizes[0] }}>
									{path}
								</div>
							))}
							{diff?.truncated && <div style={{ marginTop: 4, fontSize: theme.fontSizes[0], color: muted }}>Showing the first 300 changed paths.</div>}
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

function Notice({
	theme,
	children,
	danger = false,
}: {
	theme: ReturnType<typeof useTheme>["theme"];
	children: ReactNode;
	danger?: boolean;
}) {
	return (
		<div style={{ padding: "10px 16px", borderBottom: `1px solid ${theme.colors.border ?? "#333"}`, color: danger ? "#e5534b" : (theme.colors.textSecondary ?? theme.colors.text), fontSize: theme.fontSizes[1] }}>
			{children}
		</div>
	);
}

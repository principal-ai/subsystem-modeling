import type { MergedPullRequestRepo, RepoInsights } from "../shared/contract";
import { resolveGithubToken } from "./gist-publish";
import { listMergedPullRequestRepos } from "./merged-pull-requests";
import { gitStdout } from "./git-repo";

const GITHUB_API = "https://api.github.com";
const BLAME_CONCURRENCY = 5;
let localReposPromise: Promise<MergedPullRequestRepo[]> | null = null;
let localReposCachedAt = 0;

type GitHubRepository = { created_at?: string };
type GitHubPullRequest = { merged_at?: string | null };

async function githubJson<T>(url: string, token?: string | null): Promise<T> {
	const response = await fetch(url, {
		headers: {
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		signal: AbortSignal.timeout(15_000),
	});
	if (!response.ok) throw new Error(`GitHub API request failed (${response.status}).`);
	return (await response.json()) as T;
}

async function currentLineBreakdown(
	repoRoot: string,
): Promise<{ lineCount: number; fileCount: number; contributors: Array<{ id: string; name: string; lines: number; files: string[]; avatarUrl?: string }>; truncated: boolean } | null> {
	const rawFiles = await gitStdout(repoRoot, ["ls-files", "-z"]);
	if (rawFiles === null) return null;
	const files = rawFiles.split("\0").filter(Boolean);
	const byEmail = new Map<string, {
		name: string;
		lines: number;
		files: Set<string>;
		avatarUrl?: string;
		lastAuthoredAt: number;
	}>();
	let lineCount = 0;
	let nextFile = 0;
	let truncated = false;

	const workers = Array.from({ length: Math.min(BLAME_CONCURRENCY, files.length) }, async () => {
		while (nextFile < files.length) {
			const file = files[nextFile++]!;
			const blame = await gitStdout(repoRoot, ["blame", "--line-porcelain", "HEAD", "--", file]);
			if (blame === null) continue;
			if (blame.length >= 32 * 1024 * 1024) truncated = true;
			let pendingName = "";
			let pendingAuthorTime = 0;
			for (const line of blame.split("\n")) {
				if (line.startsWith("author ")) {
					pendingName = line.slice("author ".length);
					continue;
				}
				if (line.startsWith("author-time ")) {
					pendingAuthorTime = Number(line.slice("author-time ".length)) || 0;
					continue;
				}
				if (!line.startsWith("author-mail ")) continue;
				const email = line.slice("author-mail ".length).replace(/^<|>$/g, "");
				const githubLogin = email.match(/^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/i)?.[1];
				const author = byEmail.get(email) ?? {
					name: pendingName || email || "Unknown contributor",
					lines: 0,
					files: new Set(),
					lastAuthoredAt: 0,
					...(githubLogin
						? { avatarUrl: `https://github.com/${encodeURIComponent(githubLogin)}.png?size=64` }
						: {}),
				};
				if (pendingName) author.name = pendingName;
				author.lines++;
				author.files.add(file);
				author.lastAuthoredAt = Math.max(author.lastAuthoredAt, pendingAuthorTime);
				byEmail.set(email, author);
				lineCount++;
			}
		}
	});
	await Promise.all(workers);
	return {
		lineCount,
		fileCount: files.length,
		contributors: [...byEmail.entries()]
			.sort(([, a], [, b]) => b.lastAuthoredAt - a.lastAuthoredAt || b.lines - a.lines || a.name.localeCompare(b.name))
			.map(([id, { name, lines, files, avatarUrl }]) => ({
				id,
				name,
				lines,
				files: [...files].sort((a, b) => a.localeCompare(b)),
				avatarUrl,
			})),
		truncated,
	};
}

async function findLocalRepo(owner: string, name: string) {
	if (!localReposPromise || Date.now() - localReposCachedAt > 2_000) {
		localReposCachedAt = Date.now();
		localReposPromise = listMergedPullRequestRepos();
	}
	const repos = await localReposPromise;
	return repos.find(
		(repo) =>
			repo.owner.toLowerCase() === owner.toLowerCase() &&
			repo.name.toLowerCase() === name.toLowerCase(),
	);
}

/** Repository creation date, fetched independently from the other overview facts. */
export async function getRepoCreatedAt(opts: {
	owner: string;
	repo: string;
}): Promise<{ ok: boolean; createdAt?: string; error?: string }> {
	const owner = opts.owner.trim();
	const name = opts.repo.trim();
	if (!owner || !name) return { ok: false, error: "Choose a repository." };
	const localRepo = await findLocalRepo(owner, name);
	if (!localRepo) return { ok: false, error: "This repository is not cloned locally." };
	try {
		const repository = await githubJson<GitHubRepository>(
			`${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
			resolveGithubToken(),
		);
		return repository.created_at
			? { ok: true, createdAt: repository.created_at }
			: { ok: false, error: "GitHub did not return a repository creation date." };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}

/** Latest merge date, fetched independently from the other overview facts. */
export async function getRepoLastMerge(opts: {
	owner: string;
	repo: string;
}): Promise<{ ok: boolean; lastMergeAt?: string; error?: string }> {
	const owner = opts.owner.trim();
	const name = opts.repo.trim();
	if (!owner || !name) return { ok: false, error: "Choose a repository." };
	const localRepo = await findLocalRepo(owner, name);
	if (!localRepo) return { ok: false, error: "This repository is not cloned locally." };
	const params = new URLSearchParams({
		state: "closed",
		sort: "updated",
		direction: "desc",
		per_page: "100",
	});
	try {
		const pullRequests = await githubJson<GitHubPullRequest[]>(
			`${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pulls?${params}`,
			resolveGithubToken(),
		);
		const merges = pullRequests
			.map((pullRequest) => pullRequest.merged_at)
			.filter((date): date is string => Boolean(date))
			.sort((a, b) => Date.parse(b) - Date.parse(a));
		return merges[0]
			? { ok: true, lastMergeAt: merges[0] }
			: { ok: true };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}

/** Local latest commit and all-time contributor count. */
export async function getRepoGitSummary(opts: {
	owner: string;
	repo: string;
}): Promise<{
	ok: boolean;
	lastCommit?: RepoInsights["lastCommit"];
	contributorCount?: number;
	error?: string;
}> {
	const owner = opts.owner.trim();
	const name = opts.repo.trim();
	if (!owner || !name) return { ok: false, error: "Choose a repository." };
	const localRepo = await findLocalRepo(owner, name);
	if (!localRepo) return { ok: false, error: "This repository is not cloned locally." };
	const [commit, shortlog] = await Promise.all([
		gitStdout(localRepo.path, ["log", "-1", "--format=%H%x00%s%x00%cI"]),
		gitStdout(localRepo.path, ["shortlog", "-sne", "--all"]),
	]);
	const [sha, message, committedAt] = commit?.trim().split("\0") ?? [];
	const lastCommit = sha && message && committedAt ? { sha, message, committedAt } : undefined;
	const contributorCount = shortlog === null
		? undefined
		: shortlog
			.split("\n")
			.filter((line) => /^\s*\d+\s+/.test(line)).length;
	if (!lastCommit && contributorCount === undefined) {
		return { ok: false, error: "Could not read local git history." };
	}
	return { ok: true, lastCommit, contributorCount };
}

/** Calculate tracked HEAD lines and contributor attribution in the background. */
export async function getRepoLineBreakdown(opts: {
	owner: string;
	repo: string;
}): Promise<{
	ok: boolean;
	lineCount?: number;
	fileCount?: number;
	contributors?: Array<{ id: string; name: string; lines: number; files: string[]; avatarUrl?: string }>;
	warnings?: string[];
	error?: string;
}> {
	const owner = opts.owner.trim();
	const name = opts.repo.trim();
	if (!owner || !name) return { ok: false, error: "Choose a repository." };
	const localRepo = await findLocalRepo(owner, name);
	if (!localRepo) return { ok: false, error: "This repository is not cloned locally." };
	try {
		const breakdown = await currentLineBreakdown(localRepo.path);
		if (!breakdown) return { ok: false, error: "Could not calculate line attribution." };
		return {
			ok: true,
			lineCount: breakdown.lineCount,
			fileCount: breakdown.fileCount,
			contributors: breakdown.contributors,
			warnings: breakdown.truncated
				? ["Some large files were truncated while calculating line attribution."]
				: undefined,
		};
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}

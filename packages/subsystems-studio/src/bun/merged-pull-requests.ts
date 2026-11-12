import { existsSync } from "node:fs";
import type {
	MergedPullRequest,
	MergedPullRequestRepo,
} from "../shared/contract";
import { loadAlexandriaRepos } from "./alexandria";
import { resolveGithubToken } from "./gist-publish";
import { gitHeadSha } from "./graphify-store";

const SEARCH_PAGE_SIZE = 100;
const SEARCH_PAGE_LIMIT = 10;
const FILE_PAGE_SIZE = 100;
const FILE_PAGE_LIMIT = 3;
const pullRequestFilesCache = new Map<string, { files: string[]; truncated: boolean }>();

interface SearchIssue {
	number: number;
	title: string;
	html_url: string;
	repository_url?: string;
	closed_at?: string | null;
	user?: { login?: string; avatar_url?: string } | null;
	pull_request?: unknown;
}

interface SearchResponse {
	total_count?: number;
	items?: SearchIssue[];
	message?: string;
}

interface SearchResult {
	pullRequests: MergedPullRequest[];
	truncated: boolean;
}

/** Locally cloned GitHub repos, deduplicated to one checkout per owner/name. */
export async function listMergedPullRequestRepos(): Promise<MergedPullRequestRepo[]> {
	const byIdentity = new Map<string, MergedPullRequestRepo>();
	for (const info of loadAlexandriaRepos().values()) {
		const owner = info.owner?.trim();
		const name = info.repo?.trim();
		if (!owner || !name || !existsSync(info.root)) continue;
		if (!(await gitHeadSha(info.root))) continue;
		const key = `${owner}/${name}`.toLowerCase();
		const next = {
			owner,
			name,
			path: info.root,
			url: `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
		};
		const current = byIdentity.get(key);
		if (!current || next.path.length < current.path.length) byIdentity.set(key, next);
	}
	return [...byIdentity.values()].sort((a, b) =>
		`${a.owner}/${a.name}`.localeCompare(`${b.owner}/${b.name}`),
	);
}

export function repoIdentityFromIssue(item: {
	repository_url?: string;
	html_url: string;
}): { owner: string; name: string } | null {
	const raw = item.repository_url ?? item.html_url;
	try {
		const url = new URL(raw);
		const path = url.pathname.split("/").filter(Boolean);
		if (url.hostname.toLowerCase() === "api.github.com" && path[0] === "repos") {
			if (path[1] && path[2]) return { owner: path[1], name: path[2] };
		}
		if (url.hostname.toLowerCase() === "github.com" && path[0] && path[1]) {
			return { owner: path[0], name: path[1] };
		}
	} catch {
		return null;
	}
	return null;
}

async function searchOrgMergedPullRequests(
	owner: string,
	token: string,
	since: string | undefined,
	localRepos: ReadonlyMap<string, MergedPullRequestRepo>,
): Promise<SearchResult> {
	const query = [
		`org:${owner}`,
		"is:pr",
		"is:merged",
		since ? `merged:>=${since.slice(0, 10)}` : "",
	]
		.filter(Boolean)
		.join(" ");
	const pullRequests: MergedPullRequest[] = [];
	let total = 0;
	for (let page = 1; page <= SEARCH_PAGE_LIMIT; page++) {
		const params = new URLSearchParams({
			q: query,
			per_page: String(SEARCH_PAGE_SIZE),
			page: String(page),
			sort: "updated",
			order: "desc",
		});
		const response = await fetch(
			`https://api.github.com/search/issues?${params.toString()}`,
			{
				headers: {
					Accept: "application/vnd.github+json",
					Authorization: `Bearer ${token}`,
					"X-GitHub-Api-Version": "2022-11-28",
				},
			},
		);
		const body = (await response.json().catch(() => ({}))) as SearchResponse;
		if (!response.ok) {
			throw new Error(
				body.message
					? `GitHub API ${response.status}: ${body.message}`
					: `GitHub API request failed (${response.status})`,
			);
		}
		if (page === 1) total = body.total_count ?? 0;
		for (const item of body.items ?? []) {
			if (!item.pull_request || !item.closed_at) continue;
			const identity = repoIdentityFromIssue(item);
			if (!identity) continue;
			const repoKey = `${identity.owner}/${identity.name}`.toLowerCase();
			const repo = localRepos.get(repoKey);
			if (!repo) continue;
			pullRequests.push({
				owner: repo.owner,
				repo: repo.name,
				number: item.number,
				title: item.title,
				url: item.html_url,
				author: item.user?.login,
				authorAvatarUrl: item.user?.avatar_url,
				mergedAt: item.closed_at,
			});
		}
		if ((body.items?.length ?? 0) < SEARCH_PAGE_SIZE || page * SEARCH_PAGE_SIZE >= total) {
			break;
		}
	}
	return {
		pullRequests,
		truncated: total > SEARCH_PAGE_SIZE * SEARCH_PAGE_LIMIT,
	};
}

async function mergedPullRequestFiles(
	pullRequest: Pick<MergedPullRequest, "owner" | "repo" | "number">,
	token: string,
): Promise<{ files: string[]; truncated: boolean }> {
	const cacheKey = `${pullRequest.owner}/${pullRequest.repo}#${pullRequest.number}`.toLowerCase();
	const cached = pullRequestFilesCache.get(cacheKey);
	if (cached) return cached;
	const files: string[] = [];
	let truncated = false;
	for (let page = 1; page <= FILE_PAGE_LIMIT; page++) {
		const response = await fetch(
			`https://api.github.com/repos/${encodeURIComponent(pullRequest.owner)}/${encodeURIComponent(pullRequest.repo)}/pulls/${pullRequest.number}/files?per_page=${FILE_PAGE_SIZE}&page=${page}`,
			{
				headers: {
					Accept: "application/vnd.github+json",
					Authorization: `Bearer ${token}`,
					"X-GitHub-Api-Version": "2022-11-28",
				},
			},
		);
		const raw = (await response.json().catch(() => [])) as unknown;
		if (!response.ok) {
			const message =
				typeof raw === "object" && raw !== null && "message" in raw &&
				typeof raw.message === "string"
					? raw.message
					: undefined;
			throw new Error(
				message
					? `GitHub API ${response.status}: ${message}`
					: `Could not load PR files (${response.status})`,
			);
		}
		const body = (Array.isArray(raw) ? raw : []) as Array<{ filename?: string }>;
		for (const file of body) {
			if (file.filename) files.push(file.filename);
		}
		if (body.length < FILE_PAGE_SIZE) break;
		if (page === FILE_PAGE_LIMIT) truncated = true;
	}
	const result = { files, truncated };
	pullRequestFilesCache.set(cacheKey, result);
	return result;
}

/** Load a PR's changed paths only when the user expands that PR's file list. */
export async function getMergedPullRequestFiles(opts: {
	owner: string;
	repo: string;
	number: number;
}): Promise<{ ok: boolean; files?: string[]; error?: string; truncated?: boolean }> {
	const owner = opts.owner.trim();
	const repo = opts.repo.trim();
	if (!owner || !repo || !Number.isInteger(opts.number) || opts.number < 1) {
		return { ok: false, error: "Invalid pull request identity." };
	}
	const localRepos = await listMergedPullRequestRepos();
	if (!localRepos.some((entry) =>
		entry.owner.toLowerCase() === owner.toLowerCase() &&
		entry.name.toLowerCase() === repo.toLowerCase(),
	)) {
		return { ok: false, error: "This repository is not cloned locally." };
	}
	const token = resolveGithubToken();
	if (!token) return { ok: false, error: "No GitHub token found. Sign in with `gh auth login`." };
	try {
		const result = await mergedPullRequestFiles(
			{ owner, repo, number: opts.number },
			token,
		);
		return { ok: true, ...result };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}

/** Search merged PR activity for an org, then retain only repos cloned locally. */
export async function listMergedPullRequests(opts: {
	owner: string;
	since?: string;
}): Promise<{
	ok: boolean;
	pullRequests: MergedPullRequest[];
	error?: string;
	errors?: string[];
	truncatedRepos?: string[];
}> {
	const owner = opts.owner.trim();
	if (!owner) return { ok: false, pullRequests: [], error: "Choose a GitHub organization." };
	const repos = (await listMergedPullRequestRepos()).filter(
		(repo) => repo.owner.toLowerCase() === owner.toLowerCase(),
	);
	if (repos.length === 0) return { ok: true, pullRequests: [] };
	const token = resolveGithubToken();
	if (!token) {
		return {
			ok: false,
			pullRequests: [],
			error: "No GitHub CLI token found. Sign in with `gh auth login` to load merged PRs.",
		};
	}

	const localRepos = new Map(
		repos.map((repo) => [`${repo.owner}/${repo.name}`.toLowerCase(), repo]),
	);
	let searchResult: SearchResult;
	try {
		searchResult = await searchOrgMergedPullRequests(owner, token, opts.since, localRepos);
	} catch (error) {
		return {
			ok: false,
			pullRequests: [],
			error: error instanceof Error ? error.message : String(error),
		};
	}

	const pullRequests = searchResult.pullRequests;
	pullRequests.sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt));
	return {
		ok: true,
		pullRequests,
		truncatedRepos: searchResult.truncated ? [owner] : [],
	};
}

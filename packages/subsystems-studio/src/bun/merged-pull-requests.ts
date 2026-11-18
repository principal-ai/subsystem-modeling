import { existsSync } from "node:fs";
import type {
	FileChange,
	FileChangeStatus,
	MergedPullRequest,
	MergedPullRequestRepo,
} from "../shared/contract";
import { loadAlexandriaRepos } from "./alexandria";
import { resolveGithubToken } from "./gist-publish";
import { gitHeadSha } from "./graphify-store";

const SEARCH_PAGE_SIZE = 100;
const SEARCH_PAGE_LIMIT = 10;
const SEARCH_REPO_CONCURRENCY = 4;
/** Leave room beneath GitHub's authenticated Search API ceiling of 30/minute. */
const SEARCH_REQUEST_INTERVAL_MS = 6_100;
const FILE_PAGE_SIZE = 100;
const FILE_PAGE_LIMIT = 3;
let searchRequestQueue = Promise.resolve();
let nextSearchRequestAt = 0;
const pullRequestFilesCache = new Map<
	string,
	{ files: string[]; changes: FileChange[]; truncated: boolean }
>();

function pullRequestFileStatus(status: string | undefined): FileChangeStatus {
	switch ((status ?? "").toLowerCase()) {
		case "added":
			return "added";
		case "removed":
		case "deleted":
			return "deleted";
		case "renamed":
			return "renamed";
		case "copied":
			return "copied";
		default:
			return "modified";
	}
}

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

/** Process-wide pacing applies to every Search API page, not just each repo. */
function waitForSearchRequestSlot(): Promise<void> {
	const scheduled = searchRequestQueue.then(async () => {
		const delay = Math.max(0, nextSearchRequestAt - Date.now());
		if (delay > 0) await Bun.sleep(delay);
		nextSearchRequestAt = Date.now() + SEARCH_REQUEST_INTERVAL_MS;
	});
	searchRequestQueue = scheduled.catch(() => {});
	return scheduled;
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

async function searchRepoMergedPullRequests(
	repo: MergedPullRequestRepo,
	token: string,
	since: string,
): Promise<SearchResult> {
	const query = [
		`repo:${repo.owner}/${repo.name}`,
		"is:pr",
		"is:merged",
		`merged:>=${since.slice(0, 10)}`,
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
		await waitForSearchRequestSlot();
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
			if (
				!identity ||
				identity.owner.toLowerCase() !== repo.owner.toLowerCase() ||
				identity.name.toLowerCase() !== repo.name.toLowerCase()
			) {
				continue;
			}
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

/** Find the signed-in user's merged PRs across an org to prioritize repo scans. */
export async function searchMergedPullRequestsByAuthor(opts: {
	owner: string;
	since: string;
	author: string;
}): Promise<{
	ok: boolean;
	pullRequests: MergedPullRequest[];
	truncated?: boolean;
	error?: string;
}> {
	const owner = opts.owner.trim();
	const author = opts.author.trim();
	const since = (opts.since ?? "").trim().slice(0, 10);
	if (!/^[a-z\d-]+$/i.test(owner) || !/^[a-z\d-]+$/i.test(author)) {
		return { ok: false, pullRequests: [], error: "Choose a valid GitHub organization and author." };
	}
	if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) {
		return { ok: false, pullRequests: [], error: "Choose a time window to load merged PRs." };
	}
	const token = resolveGithubToken();
	if (!token) {
		return {
			ok: false,
			pullRequests: [],
			error: "No GitHub CLI token found. Sign in with `gh auth login` to load merged PRs.",
		};
	}

	const query = [
		`org:${owner}`,
		"is:pr",
		"is:merged",
		`author:${author}`,
		`merged:>=${since}`,
	].join(" ");
	const pullRequests: MergedPullRequest[] = [];
	let total = 0;
	try {
		for (let page = 1; page <= SEARCH_PAGE_LIMIT; page++) {
			const params = new URLSearchParams({
				q: query,
				per_page: String(SEARCH_PAGE_SIZE),
				page: String(page),
				sort: "updated",
				order: "desc",
			});
			await waitForSearchRequestSlot();
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
				if (!identity || identity.owner.toLowerCase() !== owner.toLowerCase()) continue;
				pullRequests.push({
					owner: identity.owner,
					repo: identity.name,
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
		pullRequests.sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt));
		return {
			ok: true,
			pullRequests,
			truncated: total > SEARCH_PAGE_SIZE * SEARCH_PAGE_LIMIT,
		};
	} catch (error) {
		return {
			ok: false,
			pullRequests: [],
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

async function mergedPullRequestFiles(
	pullRequest: Pick<MergedPullRequest, "owner" | "repo" | "number">,
	token: string,
): Promise<{ files: string[]; changes: FileChange[]; truncated: boolean }> {
	const cacheKey = `${pullRequest.owner}/${pullRequest.repo}#${pullRequest.number}`.toLowerCase();
	const cached = pullRequestFilesCache.get(cacheKey);
	if (cached) return cached;
	const files: string[] = [];
	const changes: FileChange[] = [];
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
		const body = (Array.isArray(raw) ? raw : []) as Array<{
			filename?: string;
			status?: string;
			previous_filename?: string;
			additions?: number;
			deletions?: number;
		}>;
		for (const file of body) {
			if (!file.filename) continue;
			files.push(file.filename);
			changes.push({
				path: file.filename,
				status: pullRequestFileStatus(file.status),
				previousPath: file.previous_filename,
				additions: file.additions ?? 0,
				deletions: file.deletions ?? 0,
			});
		}
		if (body.length < FILE_PAGE_SIZE) break;
		if (page === FILE_PAGE_LIMIT) truncated = true;
	}
	const result = { files, changes, truncated };
	pullRequestFilesCache.set(cacheKey, result);
	return result;
}

/** Load a PR's changed paths only when the user expands that PR's file list. */
export async function getMergedPullRequestFiles(opts: {
	owner: string;
	repo: string;
	number: number;
}): Promise<{
	ok: boolean;
	files?: string[];
	changes?: FileChange[];
	error?: string;
	truncated?: boolean;
}> {
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

/**
 * Read one merged PR (metadata + changed files) for the agent HTTP API.
 *
 * The list endpoints come from GitHub Search, which only exposes `closed_at`.
 * A single-PR read uses the core pulls endpoint, so `mergedAt` is the real
 * merge time and the response is authoritative enough to author a model
 * against. Requires a local checkout for this repo, matching the tab's
 * "visible" rule.
 */
export async function getMergedPullRequestDetail(opts: {
	owner: string;
	repo: string;
	number: number;
}): Promise<{
	ok: boolean;
	pullRequest?: MergedPullRequest;
	files?: string[];
	changes?: FileChange[];
	truncated?: boolean;
	error?: string;
}> {
	const owner = opts.owner.trim();
	const repo = opts.repo.trim();
	if (!owner || !repo || !Number.isInteger(opts.number) || opts.number < 1) {
		return { ok: false, error: "Invalid pull request identity." };
	}
	const localRepos = await listMergedPullRequestRepos();
	const local = localRepos.find(
		(entry) =>
			entry.owner.toLowerCase() === owner.toLowerCase() &&
			entry.name.toLowerCase() === repo.toLowerCase(),
	);
	if (!local) {
		return { ok: false, error: "This repository is not cloned locally." };
	}
	const token = resolveGithubToken();
	if (!token) {
		return {
			ok: false,
			error: "No GitHub CLI token found. Sign in with `gh auth login` to load merged PRs.",
		};
	}
	try {
		const response = await fetch(
			`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${opts.number}`,
			{
				headers: {
					Accept: "application/vnd.github+json",
					Authorization: `Bearer ${token}`,
					"X-GitHub-Api-Version": "2022-11-28",
				},
			},
		);
		const body = (await response.json().catch(() => ({}))) as {
			number?: number;
			title?: string;
			html_url?: string;
			user?: { login?: string; avatar_url?: string } | null;
			merged_at?: string | null;
			closed_at?: string | null;
			message?: string;
		};
		if (!response.ok) {
			return {
				ok: false,
				error: body.message
					? `GitHub API ${response.status}: ${body.message}`
					: `GitHub API request failed (${response.status})`,
			};
		}
		if (!body.merged_at) {
			return { ok: false, error: "Pull request is not merged." };
		}
		const pullRequest: MergedPullRequest = {
			owner: local.owner,
			repo: local.name,
			number: body.number ?? opts.number,
			title: body.title ?? "",
			url: body.html_url ?? `https://github.com/${local.owner}/${local.name}/pull/${opts.number}`,
			author: body.user?.login,
			authorAvatarUrl: body.user?.avatar_url,
			mergedAt: body.merged_at,
		};
		const files = await mergedPullRequestFiles(pullRequest, token);
		return { ok: true, pullRequest, ...files };
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/** Search merged PR activity for an org, then retain only repos cloned locally.
 * `since` (YYYY-MM-DD) is required — unbounded lifetime queries are rejected
 * to keep GitHub search fan-out predictable. */
export async function listMergedPullRequests(opts: {
	owner: string;
	since: string;
	/** Optional single repo; the renderer uses this to report incremental progress. */
	repo?: string;
}): Promise<{
	ok: boolean;
	pullRequests: MergedPullRequest[];
	error?: string;
	errors?: string[];
	truncatedRepos?: string[];
}> {
	const owner = opts.owner.trim();
	if (!owner) return { ok: false, pullRequests: [], error: "Choose a GitHub organization." };
	const since = (opts.since ?? "").trim().slice(0, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) {
		return { ok: false, pullRequests: [], error: "Choose a time window to load merged PRs." };
	}
	const repos = (await listMergedPullRequestRepos()).filter(
		(repo) =>
			repo.owner.toLowerCase() === owner.toLowerCase() &&
			(!opts.repo || repo.name.toLowerCase() === opts.repo.trim().toLowerCase()),
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

	const searchResults: Array<{ repo: MergedPullRequestRepo; result: SearchResult }> = [];
	const errors: string[] = [];
	for (let start = 0; start < repos.length; start += SEARCH_REPO_CONCURRENCY) {
		const batch = repos.slice(start, start + SEARCH_REPO_CONCURRENCY);
		const batchResults: Array<
			| { repo: MergedPullRequestRepo; result: SearchResult }
			| { repo: MergedPullRequestRepo; error: string }
		> = await Promise.all(
			batch.map(async (repo) => {
				try {
					return {
						repo,
						result: await searchRepoMergedPullRequests(repo, token, since),
					};
				} catch (error) {
					return {
						repo,
						error: `${repo.owner}/${repo.name}: ${error instanceof Error ? error.message : String(error)}`,
					};
				}
			}),
		);
		for (const result of batchResults) {
			if ("result" in result) {
				searchResults.push(result);
			} else {
				errors.push(result.error);
			}
		}
	}

	if (searchResults.length === 0 && errors.length > 0) {
		return {
			ok: false,
			pullRequests: [],
			error: "Could not load merged pull requests for any local repositories.",
			errors,
		};
	}

	const pullRequests = searchResults.flatMap(({ result }) => result.pullRequests);
	pullRequests.sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt));
	return {
		ok: true,
		pullRequests,
		errors: errors.length > 0 ? errors : undefined,
		truncatedRepos: searchResults.flatMap(({ repo, result }) =>
			result.truncated ? [`${repo.owner}/${repo.name}`] : [],
		),
	};
}

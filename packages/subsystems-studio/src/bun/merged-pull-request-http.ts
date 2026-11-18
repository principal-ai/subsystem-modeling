/**
 * Agent-facing HTTP access to the merged-PR data behind the Merged PRs tab.
 *
 * The tab itself is renderer state; agents need the same source of truth without
 * scraping the UI. These routes read the locally cloned GitHub repos (the tab's
 * "visible" rule) and return PR metadata, optional changed files, and the
 * subsystem models already associated with each PR.
 */

import type {
	FileChange,
	MergedPullRequest,
	MergedPullRequestRepo,
} from "../shared/contract";
import { pullRequestRefKey } from "../shared/pull-request-ref";
import {
	getMergedPullRequestDetail,
	listMergedPullRequestRepos,
	listMergedPullRequests,
} from "./merged-pull-requests";
import {
	listSubsystemModels,
	type SubsystemModelIndexEntry,
} from "./subsystem-model-store";

const DEFAULT_HOURS = 24;
const MAX_HOURS = 24 * 90;
const PREFIX = "/api/merged-pull-requests";

export interface MergedPullRequestModelRef {
	id: string;
	title: string;
	updatedAt: string;
}

export interface MergedPullRequestHttpDeps {
	listRepos(): Promise<MergedPullRequestRepo[]>;
	listPullRequests(opts: {
		owner: string;
		since: string;
		repo?: string;
	}): Promise<{
		ok: boolean;
		pullRequests: MergedPullRequest[];
		error?: string;
		errors?: string[];
		truncatedRepos?: string[];
	}>;
	getDetail(opts: {
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
	}>;
	listModels(): Promise<
		Array<
			Pick<
				SubsystemModelIndexEntry,
				"id" | "title" | "updatedAt" | "pullRequests"
			>
		>
	>;
}

export const mergedPullRequestHttpDeps: MergedPullRequestHttpDeps = {
	listRepos: listMergedPullRequestRepos,
	listPullRequests: listMergedPullRequests,
	getDetail: getMergedPullRequestDetail,
	listModels: listSubsystemModels,
};

function reply(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"Content-Type": "application/json",
			"Access-Control-Allow-Origin": "*",
		},
	});
}

function fail(message: string, status = 400, extra?: Record<string, unknown>) {
	return reply({ ok: false, error: message, ...extra }, status);
}

/** `YYYY-MM-DD` in the checkout's local timezone, matching the tab's query. */
function localDateString(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function sinceFromQuery(url: URL): { since: string } | { error: string } {
	const rawSince = url.searchParams.get("since")?.trim();
	if (rawSince) {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(rawSince)) {
			return { error: "since must be YYYY-MM-DD." };
		}
		return { since: rawSince };
	}
	const rawHours = url.searchParams.get("hours")?.trim();
	const hours = rawHours ? Number(rawHours) : DEFAULT_HOURS;
	if (!Number.isFinite(hours) || hours <= 0 || hours > MAX_HOURS) {
		return {
			error: `hours must be a positive number no greater than ${MAX_HOURS}.`,
		};
	}
	return {
		since: localDateString(new Date(Date.now() - hours * 60 * 60 * 1000)),
	};
}

async function modelLinksByPullRequest(
	deps: MergedPullRequestHttpDeps,
): Promise<Map<string, MergedPullRequestModelRef[]>> {
	const byKey = new Map<string, MergedPullRequestModelRef[]>();
	let entries: Awaited<ReturnType<MergedPullRequestHttpDeps["listModels"]>> = [];
	try {
		entries = await deps.listModels();
	} catch {
		return byKey;
	}
	for (const entry of entries) {
		for (const ref of entry.pullRequests ?? []) {
			const key = pullRequestRefKey(ref);
			const list = byKey.get(key) ?? [];
			list.push({
				id: entry.id,
				title: entry.title,
				updatedAt: entry.updatedAt,
			});
			byKey.set(key, list);
		}
	}
	for (const list of byKey.values()) {
		list.sort(
			(a, b) =>
				a.title.localeCompare(b.title) || a.id.localeCompare(b.id),
		);
	}
	return byKey;
}

function withModels(
	pullRequest: MergedPullRequest,
	models: Map<string, MergedPullRequestModelRef[]>,
) {
	const subsystemModels =
		models.get(pullRequestRefKey(pullRequest)) ?? [];
	return {
		...pullRequest,
		subsystemModels,
		modeled: subsystemModels.length > 0,
	};
}

async function handleRepos(deps: MergedPullRequestHttpDeps): Promise<Response> {
	const repos = await deps.listRepos();
	const owners = [...new Set(repos.map((repo) => repo.owner))].sort((a, b) =>
		a.localeCompare(b),
	);
	return reply({
		ok: true,
		owners,
		repos: repos.map(({ owner, name, path, url }) => ({
			owner,
			name,
			path,
			url,
		})),
	});
}

async function handleList(
	url: URL,
	deps: MergedPullRequestHttpDeps,
): Promise<Response> {
	const sinceResult = sinceFromQuery(url);
	if ("error" in sinceResult) return fail(sinceResult.error);
	const { since } = sinceResult;

	const ownerFilter = url.searchParams.get("owner")?.trim() || undefined;
	const repoFilter = url.searchParams.get("repo")?.trim() || undefined;
	const author = url.searchParams.get("author")?.trim().toLowerCase() || undefined;

	const allRepos = await deps.listRepos();
	const eligibleRepos = allRepos.filter(
		(repo) =>
			(!ownerFilter ||
				repo.owner.toLowerCase() === ownerFilter.toLowerCase()) &&
			(!repoFilter || repo.name.toLowerCase() === repoFilter.toLowerCase()),
	);
	const owners = [
		...new Set(eligibleRepos.map((repo) => repo.owner)),
	].sort((a, b) => a.localeCompare(b));

	const errors: string[] = [];
	const truncatedRepos = new Set<string>();
	const byKey = new Map<string, MergedPullRequest>();
	let successfulOwners = 0;
	for (const owner of owners) {
		const result = await deps.listPullRequests({
			owner,
			since,
			...(repoFilter ? { repo: repoFilter } : {}),
		});
		if (result.ok) successfulOwners++;
		else if (result.error) errors.push(result.error);
		errors.push(...(result.errors ?? []));
		for (const repo of result.truncatedRepos ?? []) truncatedRepos.add(repo);
		for (const pr of result.pullRequests) {
			byKey.set(pullRequestRefKey(pr), pr);
		}
	}
	if (owners.length > 0 && successfulOwners === 0 && errors.length > 0) {
		const status = errors.some((error) => /No GitHub CLI token/i.test(error))
			? 503
			: 502;
		return fail(
			"Could not load merged pull requests for the local repositories.",
			status,
			{ errors },
		);
	}

	const models = await modelLinksByPullRequest(deps);
	const pullRequests = [...byKey.values()]
		.filter(
			(pr) =>
				!author ||
				(pr.author != null && pr.author.toLowerCase() === author),
		)
		.sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt))
		.map((pr) => withModels(pr, models));

	return reply({
		ok: true,
		since,
		owners,
		repos: eligibleRepos.map(({ owner, name, path, url }) => ({
			owner,
			name,
			path,
			url,
		})),
		pullRequests,
		...(errors.length > 0 ? { errors } : {}),
		...(truncatedRepos.size > 0
			? { truncatedRepos: [...truncatedRepos] }
			: {}),
	});
}

async function handleDetail(
	owner: string,
	repo: string,
	number: number,
	deps: MergedPullRequestHttpDeps,
): Promise<Response> {
	const repos = await deps.listRepos();
	const local = repos.find(
		(entry) =>
			entry.owner.toLowerCase() === owner.toLowerCase() &&
			entry.name.toLowerCase() === repo.toLowerCase(),
	);
	if (!local) {
		return fail("This repository is not cloned locally.", 404);
	}
	const result = await deps.getDetail({ owner, repo, number });
	if (!result.ok || !result.pullRequest) {
		const error = result.error ?? "Could not load merged pull request.";
		const status = /No GitHub CLI token/i.test(error)
			? 503
			: /not merged|not found|Invalid pull request identity/i.test(error)
				? 404
				: 502;
		return fail(error, status);
	}
	const models = await modelLinksByPullRequest(deps);
	return reply({
		ok: true,
		repo: {
			owner: local.owner,
			name: local.name,
			path: local.path,
			url: local.url,
		},
		pullRequest: {
			...withModels(result.pullRequest, models),
			files: result.files ?? [],
			changes: result.changes ?? [],
			truncated: result.truncated === true,
		},
	});
}

/**
 * Handle `/api/merged-pull-requests…`; returns null for unrelated paths so the
 * main dispatcher can continue.
 */
export async function handleMergedPullRequestHttpRequest(
	req: Request,
	deps: MergedPullRequestHttpDeps = mergedPullRequestHttpDeps,
): Promise<Response | null> {
	const url = new URL(req.url);
	if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) {
		return null;
	}
	if (req.method !== "GET") {
		return fail("Method not allowed", 405);
	}
	if (url.pathname === `${PREFIX}/repos`) {
		return handleRepos(deps);
	}
	if (url.pathname === PREFIX) {
		return handleList(url, deps);
	}
	const detail = url.pathname.match(
		/^\/api\/merged-pull-requests\/([^/]+)\/([^/]+)\/(\d+)$/,
	);
	if (detail) {
		const number = Number.parseInt(detail[3]!, 10);
		if (!Number.isInteger(number) || number < 1) {
			return fail("Pull request number must be a positive integer.");
		}
		return handleDetail(detail[1]!, detail[2]!, number, deps);
	}
	return fail("Not found", 404);
}

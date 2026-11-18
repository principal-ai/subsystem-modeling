import { describe, expect, test } from "bun:test";
import type {
	FileChange,
	MergedPullRequest,
	MergedPullRequestRepo,
} from "../shared/contract";
import {
	handleMergedPullRequestHttpRequest,
	type MergedPullRequestHttpDeps,
} from "./merged-pull-request-http";

const repos: MergedPullRequestRepo[] = [
	{
		owner: "acme",
		name: "api",
		path: "/work/acme/api",
		url: "https://github.com/acme/api",
	},
	{
		owner: "other",
		name: "web",
		path: "/work/other/web",
		url: "https://github.com/other/web",
	},
];

const pullRequests: MergedPullRequest[] = [
	{
		owner: "acme",
		repo: "api",
		number: 1,
		title: "Add endpoints",
		url: "https://github.com/acme/api/pull/1",
		author: "octocat",
		mergedAt: "2026-11-17T10:00:00Z",
	},
	{
		owner: "acme",
		repo: "api",
		number: 2,
		title: "Docs",
		url: "https://github.com/acme/api/pull/2",
		author: "ada",
		mergedAt: "2026-11-16T10:00:00Z",
	},
	{
		owner: "other",
		repo: "web",
		number: 3,
		title: "Landing page",
		url: "https://github.com/other/web/pull/3",
		author: "octocat",
		mergedAt: "2026-11-15T10:00:00Z",
	},
];

const changes: FileChange[] = [
	{ path: "src/api.ts", status: "modified", additions: 10, deletions: 2 },
];

function deps(overrides: Partial<MergedPullRequestHttpDeps> = {}): MergedPullRequestHttpDeps {
	const calls: Array<{ owner: string; since: string; repo?: string }> = [];
	const base: MergedPullRequestHttpDeps = {
		listRepos: async () => repos,
		listPullRequests: async (opts) => {
			calls.push(opts);
			return {
				ok: true,
				pullRequests: pullRequests.filter(
					(pr) =>
						pr.owner.toLowerCase() === opts.owner.toLowerCase() &&
						(!opts.repo ||
							pr.repo.toLowerCase() === opts.repo.toLowerCase()) &&
						pr.mergedAt.slice(0, 10) >= opts.since,
				),
			};
		},
		getDetail: async ({ owner, repo, number }) => {
			const pullRequest = pullRequests.find(
				(pr) =>
					pr.owner === owner && pr.repo === repo && pr.number === number,
			);
			return pullRequest
				? { ok: true, pullRequest, files: ["src/api.ts"], changes, truncated: false }
				: { ok: false, error: "Pull request not found." };
		},
		listModels: async () => [
			{
				id: "sg-1",
				title: "API model",
				updatedAt: "2026-11-17T11:00:00Z",
				pullRequests: [{ owner: "acme", repo: "api", number: 1 }],
			},
		],
	};
	Object.assign(base, overrides);
	(base as MergedPullRequestHttpDeps & { calls?: typeof calls }).calls = calls;
	return base;
}

function request(path: string, method = "GET"): Request {
	return new Request(`http://127.0.0.1:3045${path}`, { method });
}

describe("GET /api/merged-pull-requests/repos", () => {
	test("returns local repos and owners", async () => {
		const res = await handleMergedPullRequestHttpRequest(
			request("/api/merged-pull-requests/repos"),
			deps(),
		);
		expect(res?.status).toBe(200);
		const body = (await res!.json()) as {
			ok: boolean;
			owners: string[];
			repos: MergedPullRequestRepo[];
		};
		expect(body.ok).toBe(true);
		expect(body.owners).toEqual(["acme", "other"]);
		expect(body.repos[0]).toEqual(repos[0]!);
	});
});

describe("GET /api/merged-pull-requests", () => {
	test("filters by owner/author and attaches model associations", async () => {
		const d = deps();
		const res = await handleMergedPullRequestHttpRequest(
			request(
				"/api/merged-pull-requests?owner=acme&since=2026-11-01&author=OCTOCAT",
			),
			d,
		);
		expect(res?.status).toBe(200);
		const body = (await res!.json()) as {
			ok: boolean;
			since: string;
			owners: string[];
			pullRequests: Array<{
				number: number;
				modeled: boolean;
				subsystemModels: Array<{ id: string; title: string }>;
			}>;
		};
		expect(body.ok).toBe(true);
		expect(body.since).toBe("2026-11-01");
		expect(body.owners).toEqual(["acme"]);
		expect(body.pullRequests).toHaveLength(1);
		expect(body.pullRequests[0]).toMatchObject({
			number: 1,
			modeled: true,
			subsystemModels: [{ id: "sg-1", title: "API model" }],
		});
		expect(
			(d as MergedPullRequestHttpDeps & {
				calls?: Array<{ owner: string; since: string; repo?: string }>;
			}).calls,
		).toEqual([{ owner: "acme", since: "2026-11-01" }]);
	});

	test("omitting owner scans every local owner", async () => {
		const d = deps();
		const res = await handleMergedPullRequestHttpRequest(
			request("/api/merged-pull-requests?since=2026-11-01"),
			d,
		);
		const body = (await res!.json()) as {
			owners: string[];
			pullRequests: Array<{ number: number }>;
		};
		expect(body.owners).toEqual(["acme", "other"]);
		expect(body.pullRequests.map((pr) => pr.number)).toEqual([1, 2, 3]);
		expect(
			(d as MergedPullRequestHttpDeps & {
				calls?: Array<{ owner: string; since: string; repo?: string }>;
			}).calls?.map((call) => call.owner),
		).toEqual(["acme", "other"]);
	});

	test("defaults to the last 24 hours", async () => {
		const d = deps();
		const local = new Date(Date.now() - 24 * 60 * 60 * 1000);
		const expected = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
		const res = await handleMergedPullRequestHttpRequest(
			request("/api/merged-pull-requests?repo=web"),
			d,
		);
		const body = (await res!.json()) as {
			since: string;
			owners: string[];
		};
		expect(body.since).toBe(expected);
		// repo alone still derives owners from local repos.
		expect(body.owners).toEqual(["other"]);
	});

	test("supports repo filtering", async () => {
		const res = await handleMergedPullRequestHttpRequest(
			request("/api/merged-pull-requests?repo=web&since=2026-11-01"),
			deps(),
		);
		const body = (await res!.json()) as {
			owners: string[];
			pullRequests: Array<{ number: number }>;
		};
		expect(body.owners).toEqual(["other"]);
		expect(body.pullRequests.map((pr) => pr.number)).toEqual([3]);
	});

	test("rejects invalid windows", async () => {
		for (const query of ["since=nope", "hours=0", "hours=9999", "hours=abc"]) {
			const res = await handleMergedPullRequestHttpRequest(
				request(`/api/merged-pull-requests?${query}`),
				deps(),
			);
			expect(res?.status).toBe(400);
		}
	});
});

describe("GET /api/merged-pull-requests/:owner/:repo/:number", () => {
	test("returns file detail plus model associations", async () => {
		const res = await handleMergedPullRequestHttpRequest(
			request("/api/merged-pull-requests/acme/api/1"),
			deps(),
		);
		expect(res?.status).toBe(200);
		const body = (await res!.json()) as {
			ok: boolean;
			repo: { path: string };
			pullRequest: {
				number: number;
				files: string[];
				changes: FileChange[];
				modeled: boolean;
				subsystemModels: Array<{ id: string }>;
			};
		};
		expect(body.ok).toBe(true);
		expect(body.repo.path).toBe("/work/acme/api");
		expect(body.pullRequest.files).toEqual(["src/api.ts"]);
		expect(body.pullRequest.changes).toEqual(changes);
		expect(body.pullRequest.modeled).toBe(true);
		expect(body.pullRequest.subsystemModels[0]?.id).toBe("sg-1");
	});

	test("404s for a repo that is not cloned locally", async () => {
		const res = await handleMergedPullRequestHttpRequest(
			request("/api/merged-pull-requests/acme/missing/1"),
			deps(),
		);
		expect(res?.status).toBe(404);
	});
});

describe("routing", () => {
	test("returns null for unrelated paths and 405 for non-GET", async () => {
		expect(
			await handleMergedPullRequestHttpRequest(
				request("/api/subsystem-model"),
				deps(),
			),
		).toBeNull();
		const res = await handleMergedPullRequestHttpRequest(
			request("/api/merged-pull-requests", "POST"),
			deps(),
		);
		expect(res?.status).toBe(405);
	});
});

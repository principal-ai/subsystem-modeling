import { describe, expect, test } from "bun:test";
import { handleSubsystemModelRequest } from "./http-server";
import { MAX_STUDIO_ROUTE_LOOKUPS } from "./route-catalog";

const noop = async () => ({ ok: true });

function request(path: string, init?: RequestInit): Request {
	return new Request(`http://127.0.0.1:3045${path}`, init);
}

function handle(req: Request): Promise<Response> {
	return handleSubsystemModelRequest(req, noop, noop, noop);
}

async function lookup(body: unknown): Promise<Response> {
	return handle(
		request("/routes", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
}

describe("GET /routes", () => {
	test("indexes groups and includes the PR association route", async () => {
		const res = await handle(request("/routes"));
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			service: string;
			port: number;
			groups: Array<{
				name: string;
				routes: Array<{ method: string; path: string; summary: string }>;
			}>;
			lookup: { method: string; path: string; maxRoutes: number };
		};
		expect(body.service).toContain("Principal Studio");
		expect(body.port).toBeGreaterThan(0);
		expect(body.lookup).toMatchObject({ method: "POST", path: "/routes" });
		expect(body.lookup.maxRoutes).toBe(MAX_STUDIO_ROUTE_LOOKUPS);
		const subsystemModels = body.groups.find((group) => group.name === "subsystem-models");
		expect(subsystemModels).toBeTruthy();
		expect(
			subsystemModels!.routes.some(
				(route) =>
					route.method === "POST" &&
					route.path === "/api/subsystem-model/:id/pull-requests",
			),
		).toBe(true);
	});
});

describe("POST /routes", () => {
	test("returns full docs and reports unknown patterns per entry", async () => {
		const res = await lookup({
			routes: [
				{ method: "POST", path: "/api/subsystem-model/:id/pull-requests" },
				{ path: "/api/subsystem-model/:id/pull-requests" },
				{ path: "/api/not-a-route" },
			],
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			success: boolean;
			results: Array<{
				request: { path: string; method?: string };
				found: boolean;
				routes: Array<{
					category: string;
					method: string;
					path: string;
					body?: Record<string, string>;
				}>;
				error?: string;
			}>;
		};
		expect(body.success).toBe(true);
		expect(body.results).toHaveLength(3);
		expect(body.results[0]!.found).toBe(true);
		expect(body.results[0]!.routes[0]).toMatchObject({
			category: "subsystem-models",
			method: "POST",
			path: "/api/subsystem-model/:id/pull-requests",
		});
		expect(body.results[0]!.routes[0]!.body?.["pullRequests"]).toContain(
			"SubsystemModelPullRequestRef[]",
		);
		// No method: every method on the path.
		expect(body.results[1]!.routes.map((route) => route.method).sort()).toEqual([
			"DELETE",
			"GET",
			"POST",
		]);
		expect(body.results[2]!.found).toBe(false);
		expect(body.results[2]!.error).toContain("No documented route");
	});

	test("rejects invalid batches and entries", async () => {
		expect((await lookup({ routes: [] })).status).toBe(400);
		expect((await lookup({ routes: [{ path: "relative" }] })).status).toBe(400);
		expect(
			(await lookup({ routes: [{ path: "/api/subsystem-model", method: "TRACE" }] }))
				.status,
		).toBe(400);
		expect(
			(
				await lookup({
					routes: Array.from({ length: MAX_STUDIO_ROUTE_LOOKUPS + 1 }, () => ({
						path: "/health",
					})),
				})
			).status,
		).toBe(400);
	});
});

import { describe, expect, test } from "bun:test";
import {
	buildMaintainerCandidates,
	listOpenCodeModels,
	modelProviderOf,
	parseOpenCodeModelCatalog,
	requireMaintainerModel,
	resolveSubsystemMaintainerModel,
} from "./opencode-models";
import type { OpencodeConnection } from "./server-sessions";

function model(id: string, providerID = "opencode-go", overrides: Record<string, unknown> = {}) {
	return {
		id, providerID, name: id, enabled: true, status: "active",
		capabilities: { tools: true },
		cost: [{ input: 1, output: 2 }],
		...overrides,
	};
}

const CATALOG = [
	model("deepseek-v4.1-flash"),
	model("big-pickle", "opencode", { cost: [{ input: 0, output: 0 }] }),
	model("org/nested-model", "openrouter"),
	model("qwen3.6:27b", "ollama", { cost: [] }),
	model("disabled-free", "opencode", { enabled: false }),
	model("embedding-free", "nvidia", { capabilities: { tools: false } }),
	model("old-free", "opencode", { status: "deprecated" }),
];

async function withCatalog(
	run: (connection: OpencodeConnection, requests: URL[]) => Promise<void>,
	opts?: { data?: unknown; status?: number },
) {
	const requests: URL[] = [];
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch(req) {
			expect(req.headers.get("authorization")).toBe(
				`Basic ${Buffer.from("opencode:test-only").toString("base64")}`,
			);
			const url = new URL(req.url);
			requests.push(url);
			if (url.pathname === "/api/info") return Response.json({ version: "test" });
			return Response.json(opts?.data ?? { data: CATALOG }, { status: opts?.status ?? 200 });
		},
	});
	try {
		await run({ url: server.url.origin, password: "test-only" }, requests);
	} finally {
		await server.stop(true);
	}
}

describe("OpenCode server catalog", () => {
	test("uses V2 capabilities.tools, pricing tiers, and unrestricted model IDs", () => {
		const models = parseOpenCodeModelCatalog({ data: CATALOG });
		expect(models).toHaveLength(CATALOG.length);
		expect(models.find((m) => m.id === "big-pickle")?.free).toBe(true);
		expect(models.find((m) => m.id === "deepseek-v4.1-flash")?.free).toBe(false);
		expect(models.find((m) => m.id === "qwen3.6:27b")?.free).toBe(false);
		expect(models.some((m) => m.ref === "openrouter/org/nested-model")).toBe(true);
		expect(models.find((m) => m.id === "embedding-free")?.toolcall).toBe(false);
	});

	test("does not treat a paid pricing tier as free", () => {
		const models = parseOpenCodeModelCatalog({ data: [
			model("tiered", "custom", { cost: [{ input: 0, output: 0 }, { input: 1, output: 2 }] }),
		] });
		expect(models[0]?.free).toBe(false);
	});

	test("rejects malformed catalog responses", () => {
		for (const payload of [null, [], {}, { data: {} }, { data: [null] },
			{ data: [{ id: "broken", providerID: "custom" }] }]) {
			expect(() => parseOpenCodeModelCatalog(payload)).toThrow("OpenCode model catalog");
		}
	});

	test("keeps all available tool-capable models, preferring free models", () => {
		const models = buildMaintainerCandidates(parseOpenCodeModelCatalog({ data: CATALOG }));
		expect(models[0]?.ref).toBe("opencode/big-pickle");
		expect(models.map((m) => m.ref).sort()).toEqual([
			"ollama/qwen3.6:27b", "opencode-go/deepseek-v4.1-flash",
			"opencode/big-pickle", "openrouter/org/nested-model",
		]);
	});

	test("rejects removed, disabled, deprecated, and non-tool models", () => {
		const models = parseOpenCodeModelCatalog({ data: CATALOG });
		for (const ref of ["opencode-go/deepseek-v4-flash", "opencode/disabled-free",
			"opencode/old-free", "nvidia/embedding-free"]) {
			expect(() => requireMaintainerModel(ref, models)).toThrow("not available for maintenance");
		}
		expect(requireMaintainerModel("opencode-go/deepseek-v4.1-flash", models).id)
			.toBe("deepseek-v4.1-flash");
	});

	test("reads an authenticated, repository-scoped server snapshot on every call", async () => {
		await withCatalog(async (connection, requests) => {
			for (const refresh of [false, true]) {
				const models = await listOpenCodeModels({ connection, directory: "/repo with spaces", refresh });
				expect(models).toHaveLength(CATALOG.length);
			}
			expect(requests).toHaveLength(2);
			for (const url of requests) {
				expect(url.pathname).toBe("/api/model");
				expect(url.searchParams.get("location[directory]")).toBe("/repo with spaces");
			}
		});
	});

	test("propagates catalog HTTP and payload errors instead of inventing a fallback", async () => {
		await withCatalog(async (connection) => {
			await expect(listOpenCodeModels({ connection })).rejects.toThrow("(503)");
			await expect(resolveSubsystemMaintainerModel({ connection })).rejects.toThrow("(503)");
		}, { status: 503 });
		await withCatalog(async (connection) => {
			await expect(resolveSubsystemMaintainerModel({ connection })).rejects.toThrow("invalid response");
		}, { data: {} });
	});

	test("reports an empty catalog without a hardcoded fallback", async () => {
		await withCatalog(async (connection) => {
			await expect(resolveSubsystemMaintainerModel({ connection }))
				.rejects.toThrow("No enabled tool-capable models");
		}, { data: { data: [] } });
	});

	test("restores valid selections and replaces stale remembered selections with a note", async () => {
		await withCatalog(async (connection) => {
			const valid = await resolveSubsystemMaintainerModel({
				connection, configured: "opencode-go/deepseek-v4.1-flash",
			});
			expect(valid.model).toBe("opencode-go/deepseek-v4.1-flash");
			expect(valid.source).toBe("settings");
			expect(valid.candidates).toHaveLength(4);
			const stale = await resolveSubsystemMaintainerModel({
				connection, configured: "opencode-go/deepseek-v4-flash",
			});
			expect(stale.model).toBe("opencode/big-pickle");
			expect(stale.source).toBe("auto");
			expect(stale.note).toContain("no longer available");
		});
	});

	test("does not silently replace an explicitly requested unavailable model", async () => {
		await withCatalog(async (connection) => {
			await expect(resolveSubsystemMaintainerModel({
				connection, configured: "opencode-go/deepseek-v4-flash", strictConfigured: true,
			})).rejects.toThrow("not available for maintenance");
		});
	});

	test("uses a valid environment selection after an unavailable remembered selection", async () => {
		const previous = process.env["SUBSYSTEM_MAINTAINER_MODEL"];
		process.env["SUBSYSTEM_MAINTAINER_MODEL"] = "openrouter/org/nested-model";
		try {
			await withCatalog(async (connection) => {
				const result = await resolveSubsystemMaintainerModel({
					connection, configured: "opencode-go/deepseek-v4-flash",
				});
				expect(result.model).toBe("openrouter/org/nested-model");
				expect(result.source).toBe("env");
				expect(result.note).toContain("no longer available");
			});
		} finally {
			if (previous === undefined) delete process.env["SUBSYSTEM_MAINTAINER_MODEL"];
			else process.env["SUBSYSTEM_MAINTAINER_MODEL"] = previous;
		}
	});

	test("validates against the same service before creating any session", async () => {
		await withCatalog(async (connection, requests) => {
			const previousUrl = process.env["OPENCODE_SERVER_URL"];
			const previousPassword = process.env["OPENCODE_SERVER_PASSWORD"];
			process.env["OPENCODE_SERVER_URL"] = connection.url;
			process.env["OPENCODE_SERVER_PASSWORD"] = connection.password;
			try {
				const { runOpencodeV2AgentSession } = await import("./opencode-v2-live");
				const result = await runOpencodeV2AgentSession({
					title: "test", agent: "construct-fixer",
					model: "opencode-go/deepseek-v4-flash",
					directory: "/maintenance/repo", text: "must not execute",
				});
				expect(result.ok).toBe(false);
				expect(result.error).toContain("not available for maintenance");
				expect(result.sessionId).toBeUndefined();
				expect(requests.map((url) => url.pathname)).toEqual(["/api/info", "/api/model"]);
				expect(requests[1]?.searchParams.get("location[directory]")).toBe("/maintenance/repo");
			} finally {
				if (previousUrl === undefined) delete process.env["OPENCODE_SERVER_URL"];
				else process.env["OPENCODE_SERVER_URL"] = previousUrl;
				if (previousPassword === undefined) delete process.env["OPENCODE_SERVER_PASSWORD"];
				else process.env["OPENCODE_SERVER_PASSWORD"] = previousPassword;
			}
		});
	});

	test("modelProviderOf keeps nested model IDs intact", () => {
		expect(modelProviderOf("openrouter/org/nested")).toBe("openrouter");
		expect(modelProviderOf("no-slash")).toBe("");
		expect(modelProviderOf(undefined)).toBe("");
	});
});

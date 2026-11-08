import { describe, expect, test } from "bun:test";
import type { PartialViewerSettings, ViewerSettings } from "../shared/contract";
import { defaultViewerSettings } from "./viewer-settings";
import { handleSettingsRequest, type SettingsHttpDeps } from "./settings-http";
import type { OllamaProbe } from "./ollama";

const TAGS: OllamaProbe = {
	reachable: true,
	baseUrl: "http://localhost:11434",
	models: [
		{ name: "nomic-embed-text:latest", capabilities: ["embedding"], toolcall: false },
		{ name: "qwen3.6:27b", capabilities: ["completion", "tools", "thinking"], toolcall: true },
	],
};

function harness(options?: Partial<SettingsHttpDeps> & { initial?: Partial<ViewerSettings>; tags?: OllamaProbe }) {
	const { initial, tags, ...overrides } = options ?? {};
	let settings: ViewerSettings = { ...defaultViewerSettings(), ...initial };
	const patches: PartialViewerSettings[] = [];
	const writes: unknown[] = [];
	let restarts = 0;
	const deps: SettingsHttpDeps = {
		settings: {
			get: () => settings,
			// Normalize like the host does, but never touch the real settings file.
			patch: (patch) => {
				patches.push(patch);
				settings = normalize(settings, patch);
				return settings;
			},
			isMaintaining: () => false,
		},
		probe: async () => tags ?? TAGS,
		readProvider: () => ({ provider: null, defaultModel: null }),
		writeProvider: (input, path) => {
			writes.push(input);
			return { path: path ?? "/tmp/opencode.json", changed: true, provider: { baseUrl: "http://localhost:11434", models: input.models } };
		},
		configPath: () => "/tmp/opencode.json",
		restartOpencode: async () => {
			restarts += 1;
			return { ok: true, connection: { url: "http://127.0.0.1:1", password: "" } };
		},
		listCatalog: async () => [{
			ref: "ollama/qwen3.6:27b", id: "qwen3.6:27b", providerID: "ollama", free: false, toolcall: true, enabled: true,
		}],
		...overrides,
	};
	return { deps, patches, writes, get settings() { return settings; }, get restarts() { return restarts; } };
}

/** In-memory stand-in for patchViewerSettings (which writes to disk). */
function normalize(current: ViewerSettings, patch: PartialViewerSettings): ViewerSettings {
	const next = { ...current, ...patch, defaultTabs: { ...current.defaultTabs, ...(patch.defaultTabs ?? {}) } } as ViewerSettings;
	if (patch.ollamaBaseUrl !== undefined) next.ollamaBaseUrl = patch.ollamaBaseUrl ? new URL(patch.ollamaBaseUrl).origin : null;
	return next;
}

function request(path: string, init?: RequestInit & { host?: string }): Request {
	return new Request(`http://${init?.host ?? "127.0.0.1"}:3045${path}`, init);
}

async function body(res: Response | null): Promise<Record<string, unknown>> {
	return (await res!.json()) as Record<string, unknown>;
}

describe("settings HTTP", () => {
	test("fresh settings hide Constructs and Maintainer by default", () => {
		const { defaultTabs } = defaultViewerSettings();
		expect(defaultTabs.subsystems).toBe(true);
		expect(defaultTabs.constructs).toBe(false);
		expect(defaultTabs.maintenance).toBe(false);
	});

	test("ignores unrelated paths and refuses non-loopback hosts", async () => {
		const { deps } = harness();
		expect(await handleSettingsRequest(request("/api/subsystem-model"), deps)).toBeNull();
		const res = await handleSettingsRequest(request("/api/settings", { host: "evil.example" }), deps);
		expect(res!.status).toBe(403);
		const foreign = await handleSettingsRequest(request("/api/settings", { headers: { origin: "https://evil.example" } }), deps);
		expect(foreign!.status).toBe(403);
	});

	test("GET redacts the TypeSafe key", async () => {
		const { deps } = harness({ initial: { typesafeApiKey: "secret" } });
		const res = await body(await handleSettingsRequest(request("/api/settings"), deps));
		const settings = res["settings"] as Record<string, unknown>;
		expect(settings["typesafeApiKeySet"]).toBe(true);
		expect("typesafeApiKey" in settings).toBe(false);
		expect(settings["secondOpinionProvider"]).toBe("typesafe");
	});

	test("PATCH merges known settings and rejects unknown or invalid ones", async () => {
		const h = harness();
		const ok = await handleSettingsRequest(request("/api/settings", {
			method: "PATCH",
			body: JSON.stringify({ secondOpinionProvider: "ollama", ollamaJudgeModel: "qwen3.6:27b", ollamaBaseUrl: "http://gpu:11434/" }),
		}), h.deps);
		expect(ok!.status).toBe(200);
		expect(h.settings.secondOpinionProvider).toBe("ollama");
		expect(h.settings.ollamaJudgeModel).toBe("qwen3.6:27b");
		expect(h.settings.ollamaBaseUrl).toBe("http://gpu:11434");

		const unknown = await handleSettingsRequest(request("/api/settings", { method: "PATCH", body: JSON.stringify({ nope: 1 }) }), h.deps);
		expect(unknown!.status).toBe(400);
		const badProvider = await handleSettingsRequest(request("/api/settings", { method: "PATCH", body: JSON.stringify({ secondOpinionProvider: "gpt" }) }), h.deps);
		expect(badProvider!.status).toBe(400);
		const badUrl = await handleSettingsRequest(request("/api/settings", { method: "PATCH", body: JSON.stringify({ ollamaBaseUrl: "gpu:11434" }) }), h.deps);
		expect(badUrl!.status).toBe(400);
		expect(h.patches).toHaveLength(1);
	});
});

describe("ollama HTTP", () => {
	test("GET reports reachability, models, judge readiness, and OpenCode state", async () => {
		const { deps } = harness({ initial: { secondOpinionProvider: "ollama", ollamaJudgeModel: "missing:1b" } });
		const res = await body(await handleSettingsRequest(request("/api/ollama"), deps));
		expect(res["reachable"]).toBe(true);
		expect((res["models"] as unknown[]).length).toBe(2);
		expect(res["judge"]).toEqual({ provider: "ollama", model: "missing:1b", ready: false });
		expect((res["agent"] as { opencode: { configPath: string } }).opencode.configPath).toBe("/tmp/opencode.json");
	});

	test("GET /models returns 502 when Ollama is down", async () => {
		const { deps } = harness({ tags: { reachable: false, baseUrl: "http://localhost:11434", error: "Ollama is not reachable" } });
		const res = await handleSettingsRequest(request("/api/ollama/models"), deps);
		expect(res!.status).toBe(502);
	});

	test("PUT with an agent model writes OpenCode config, restarts, and remembers the maintainer model", async () => {
		const h = harness();
		const res = await handleSettingsRequest(request("/api/ollama", {
			method: "PUT",
			body: JSON.stringify({ agentModel: "qwen3.6:27b", judgeModel: "qwen3.6:27b" }),
		}), h.deps);
		expect(res!.status).toBe(200);
		const out = await body(res);
		expect(out["applied"]).toMatchObject({
			agentModel: "qwen3.6:27b",
			maintainerModel: "ollama/qwen3.6:27b",
			judgeModel: "qwen3.6:27b",
			secondOpinionProvider: "ollama",
			opencodeRestarted: true,
			opencodeCatalogHasModel: true,
			opencodeConfig: { path: "/tmp/opencode.json", changed: true },
		});
		expect(out["warnings"]).toEqual([]);
		expect(h.writes).toEqual([{ baseUrl: "http://localhost:11434", models: ["qwen3.6:27b"], defaultModel: "qwen3.6:27b" }]);
		expect(h.restarts).toBe(1);
		expect(h.settings.subsystemMaintainerModel).toBe("ollama/qwen3.6:27b");
		expect(h.settings.secondOpinionProvider).toBe("ollama");
	});

	test("PUT validates models against the Ollama catalog before writing anything", async () => {
		const h = harness();
		const missing = await handleSettingsRequest(request("/api/ollama", {
			method: "PUT", body: JSON.stringify({ agentModel: "llama9:1t" }),
		}), h.deps);
		expect(missing!.status).toBe(404);
		expect((await body(missing))["error"]).toContain("ollama pull llama9:1t");

		const noTools = await handleSettingsRequest(request("/api/ollama", {
			method: "PUT", body: JSON.stringify({ agentModel: "nomic-embed-text:latest" }),
		}), h.deps);
		expect(noTools!.status).toBe(422);

		const empty = await handleSettingsRequest(request("/api/ollama", { method: "PUT", body: JSON.stringify({}) }), h.deps);
		expect(empty!.status).toBe(400);
		expect(h.writes).toEqual([]);
		expect(h.patches).toEqual([]);
	});

	test("PUT refuses to restart OpenCode while a Maintain run is active", async () => {
		const h = harness();
		h.deps.settings.isMaintaining = () => true;
		const res = await handleSettingsRequest(request("/api/ollama", {
			method: "PUT", body: JSON.stringify({ agentModel: "qwen3.6:27b" }),
		}), h.deps);
		expect(res!.status).toBe(409);
		expect(h.writes).toEqual([]);

		const deferred = await handleSettingsRequest(request("/api/ollama", {
			method: "PUT", body: JSON.stringify({ agentModel: "qwen3.6:27b", restartOpencode: false }),
		}), h.deps);
		expect(deferred!.status).toBe(200);
		expect(h.restarts).toBe(0);
		expect((await body(deferred))["warnings"]).toEqual([expect.stringContaining("restart OpenCode")]);
	});

	test("PUT surfaces a failed restart as a warning, not an error", async () => {
		const h = harness({ restartOpencode: async () => ({ ok: false, error: "opencode2 is not installed" }) });
		const res = await handleSettingsRequest(request("/api/ollama", {
			method: "PUT", body: JSON.stringify({ agentModel: "qwen3.6:27b" }),
		}), h.deps);
		expect(res!.status).toBe(200);
		const out = await body(res);
		expect((out["applied"] as { opencodeRestarted: boolean }).opencodeRestarted).toBe(false);
		expect(out["warnings"]).toEqual([expect.stringContaining("opencode2 is not installed")]);
	});

	test("PUT with only a judge model touches settings, not OpenCode", async () => {
		const h = harness();
		const res = await handleSettingsRequest(request("/api/ollama", {
			method: "PUT", body: JSON.stringify({ judgeModel: "qwen3.6:27b", secondOpinionProvider: "typesafe" }),
		}), h.deps);
		expect(res!.status).toBe(200);
		expect(h.writes).toEqual([]);
		expect(h.restarts).toBe(0);
		expect(h.settings.ollamaJudgeModel).toBe("qwen3.6:27b");
		// An explicit provider wins over the "chosen judge implies ollama" default.
		expect(h.settings.secondOpinionProvider).toBe("typesafe");
	});
});

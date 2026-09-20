import { describe, expect, test } from "bun:test";
import {
	buildMaintainerCandidates,
	isUsableModelRef,
	modelProviderOf,
	parseCredentialedProvidersFromAuthJson,
	parseOpenCodeModelsVerbose,
	pickDefaultFreeModel,
	pickDefaultMaintainerModel,
	scoreFreeMaintainerModel,
} from "./opencode-models";

const SAMPLE = `opencode/mimo-v2.5-free
{
  "id": "mimo-v2.5-free",
  "providerID": "opencode",
  "name": "MiMo Free",
  "status": "active",
  "cost": { "input": 0, "output": 0, "cache": { "read": 0, "write": 0 } },
  "capabilities": { "toolcall": true }
}
opencode-go/deepseek-v4-flash
{
  "id": "deepseek-v4-flash",
  "providerID": "opencode-go",
  "name": "DeepSeek Flash",
  "status": "active",
  "cost": { "input": 0.1, "output": 0.2, "cache": { "read": 0, "write": 0 } },
  "capabilities": { "toolcall": true }
}
opencode/nemotron-3.5-lightning-free
{
  "id": "nemotron-3.5-lightning-free",
  "providerID": "opencode",
  "name": "Lightning Free",
  "status": "active",
  "cost": { "input": 0, "output": 0, "cache": { "read": 0, "write": 0 } },
  "capabilities": { "toolcall": true }
}
opencode/big-pickle
{
  "id": "big-pickle",
  "providerID": "opencode",
  "name": "Big Pickle",
  "status": "active",
  "cost": { "input": 0, "output": 0, "cache": { "read": 0, "write": 0 } },
  "capabilities": { "toolcall": true }
}
`;

describe("opencode-models", () => {
	test("parses verbose listing and marks free models", () => {
		const models = parseOpenCodeModelsVerbose(SAMPLE);
		expect(models).toHaveLength(4);
		expect(models.filter((m) => m.free).map((m) => m.ref).sort()).toEqual([
			"opencode/big-pickle",
			"opencode/mimo-v2.5-free",
			"opencode/nemotron-3.5-lightning-free",
		]);
		expect(models.find((m) => m.id === "deepseek-v4-flash")?.free).toBe(false);
	});

	test("prefers big-pickle free as default", () => {
		const models = parseOpenCodeModelsVerbose(SAMPLE);
		const picked = pickDefaultFreeModel(models);
		expect(picked?.ref).toBe("opencode/big-pickle");
		expect(scoreFreeMaintainerModel(picked!)).toBeGreaterThan(
			scoreFreeMaintainerModel(
				models.find((m) => m.id === "nemotron-3.5-lightning-free")!,
			),
		);
	});

	test("parses credentialed providers from auth.json", () => {
		expect(
			[...parseCredentialedProvidersFromAuthJson("[]")].sort(),
		).toEqual([]);
		expect(
			[
				...parseCredentialedProvidersFromAuthJson(
					JSON.stringify({
						openrouter: { type: "api", key: "sk-..." },
						"opencode-go": { type: "api", key: "tok" },
					}),
				),
			].sort(),
		).toEqual(["opencode-go", "openrouter"]);
		expect(
			[...parseCredentialedProvidersFromAuthJson("not json")].sort(),
		).toEqual([]);
	});

	test("drops free models when their provider has no credential", () => {
		const models = parseOpenCodeModelsVerbose(SAMPLE);
		const credentialed = new Set(["opencode-go"]);
		const picked = pickDefaultMaintainerModel(models, credentialed);
		expect(picked?.ref).toBe("opencode-go/deepseek-v4-flash");
	});

	test("keeps free pick when credentials unknown (null)", () => {
		const models = parseOpenCodeModelsVerbose(SAMPLE);
		const picked = pickDefaultMaintainerModel(models, null);
		expect(picked?.ref).toBe("opencode/big-pickle");
	});

	test("returns null when no model matches credentialed providers", () => {
		const models = parseOpenCodeModelsVerbose(SAMPLE);
		const picked = pickDefaultMaintainerModel(
			models,
			new Set(["nvidia"]),
		);
		expect(picked).toBeNull();
	});

	test("candidate list prefers credentialed free, else credentialed pool", () => {
		const models = parseOpenCodeModelsVerbose(SAMPLE);
		const free = models.filter((m) => m.free);
		const candidates = buildMaintainerCandidates(
			models,
			new Set(["opencode-go"]),
			free,
		);
		expect(candidates.map((m) => m.ref)).toEqual([
			"opencode-go/deepseek-v4-flash",
		]);
		expect(buildMaintainerCandidates(models, null, free)).toEqual(free);
	});

	test("modelProviderOf splits provider/id refs", () => {
		expect(modelProviderOf("opencode-go/deepseek-v4-flash")).toBe(
			"opencode-go",
		);
		expect(modelProviderOf("no-slash")).toBe("");
		expect(modelProviderOf(undefined)).toBe("");
	});

	test("isUsableModelRef requires a credentialed provider", () => {
		const creds = new Set(["opencode-go", "openrouter"]);
		expect(isUsableModelRef("opencode-go/deepseek-v4-flash", creds)).toBe(
			true,
		);
		expect(isUsableModelRef("opencode/muse-spark-1.3-contributor-free", creds)).toBe(
			false,
		);
		expect(isUsableModelRef("opencode/big-pickle", null)).toBe(true);
		expect(isUsableModelRef("", creds)).toBe(false);
	});
});

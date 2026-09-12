import { describe, expect, test } from "bun:test";
import {
	parseOpenCodeModelsVerbose,
	pickDefaultFreeModel,
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
});

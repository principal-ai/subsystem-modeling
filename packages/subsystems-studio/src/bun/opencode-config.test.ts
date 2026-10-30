import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	opencodeConfigPath,
	readOpencodeOllamaProvider,
	writeOpencodeOllamaProvider,
} from "./opencode-config";

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "opencode-config-"));
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("opencodeConfigPath", () => {
	test("honours OPENCODE_CONFIG then XDG_CONFIG_HOME", () => {
		const prev = [process.env["OPENCODE_CONFIG"], process.env["XDG_CONFIG_HOME"]];
		try {
			process.env["OPENCODE_CONFIG"] = "/tmp/explicit.json";
			expect(opencodeConfigPath()).toBe("/tmp/explicit.json");
			delete process.env["OPENCODE_CONFIG"];
			process.env["XDG_CONFIG_HOME"] = "/tmp/xdg";
			expect(opencodeConfigPath()).toBe("/tmp/xdg/opencode/opencode.json");
		} finally {
			for (const [i, key] of ["OPENCODE_CONFIG", "XDG_CONFIG_HOME"].entries()) {
				if (prev[i] == null) delete process.env[key];
				else process.env[key] = prev[i];
			}
		}
	});
});

describe("writeOpencodeOllamaProvider", () => {
	test("creates the file with the provider and default model", () => {
		const path = join(dir, "nested", "opencode.json");
		const result = writeOpencodeOllamaProvider(
			{ baseUrl: "http://localhost:11434", models: ["qwen3.6:27b"], defaultModel: "qwen3.6:27b" },
			path,
		);
		expect(result.changed).toBe(true);
		const written = JSON.parse(readFileSync(path, "utf8"));
		expect(written["$schema"]).toBe("https://opencode.ai/config.json");
		expect(written.model).toBe("ollama/qwen3.6:27b");
		expect(written.provider.ollama).toEqual({
			npm: "@ai-sdk/openai-compatible",
			name: "Ollama (local)",
			options: { baseURL: "http://localhost:11434/v1" },
			models: { "qwen3.6:27b": { name: "qwen3.6:27b" } },
		});
		expect(readOpencodeOllamaProvider(path)).toEqual({
			provider: { baseUrl: "http://localhost:11434", models: ["qwen3.6:27b"] },
			defaultModel: "ollama/qwen3.6:27b",
		});
	});

	test("preserves the user's other config, provider models, and custom names", () => {
		const path = join(dir, "opencode.json");
		writeFileSync(path, JSON.stringify({
			theme: "dark",
			provider: {
				anthropic: { options: { apiKey: "{env:KEY}" } },
				ollama: {
					npm: "@ai-sdk/openai-compatible",
					name: "My Ollama",
					options: { baseURL: "http://old:11434/v1" },
					models: { "qwen2.5-coder:7b": { name: "qwen" } },
				},
			},
		}));
		const result = writeOpencodeOllamaProvider(
			{ baseUrl: "http://gpu-box:11434", models: ["llama3.3:70b"], defaultModel: "llama3.3:70b" },
			path,
		);
		expect(result.changed).toBe(true);
		expect(result.provider.models).toEqual(["llama3.3:70b", "qwen2.5-coder:7b"]);
		const written = JSON.parse(readFileSync(path, "utf8"));
		expect(written.theme).toBe("dark");
		expect(written.provider.anthropic).toEqual({ options: { apiKey: "{env:KEY}" } });
		expect(written.provider.ollama.name).toBe("My Ollama");
		expect(written.provider.ollama.options.baseURL).toBe("http://gpu-box:11434/v1");
		expect(written.provider.ollama.models["qwen2.5-coder:7b"]).toEqual({ name: "qwen" });
		expect(written.model).toBe("ollama/llama3.3:70b");
	});

	test("is idempotent", () => {
		const path = join(dir, "opencode.json");
		const input = { baseUrl: "http://localhost:11434", models: ["m"], defaultModel: "m" };
		expect(writeOpencodeOllamaProvider(input, path).changed).toBe(true);
		expect(writeOpencodeOllamaProvider(input, path).changed).toBe(false);
	});

	test("refuses to overwrite a config it cannot parse", () => {
		const path = join(dir, "opencode.json");
		writeFileSync(path, "{ // jsonc\n \"theme\": \"dark\" }");
		expect(() => writeOpencodeOllamaProvider({ baseUrl: null, models: ["m"] }, path))
			.toThrow(/not plain JSON/);
		expect(readFileSync(path, "utf8")).toContain("// jsonc");
	});
});

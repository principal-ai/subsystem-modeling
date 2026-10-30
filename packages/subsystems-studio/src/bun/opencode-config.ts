/**
 * OpenCode user config (`opencode.json`) — Studio writes exactly one thing
 * there: the `ollama` provider block that exposes local Ollama models to the
 * OpenCode server (and therefore to Maintain agents), plus the default
 * `model`. Everything else in the file is the user's and is preserved.
 *
 * Provider shape per https://opencode.ai/docs/providers/#ollama
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { ollamaOrigin } from "./judge";

export const OPENCODE_OLLAMA_PROVIDER_ID = "ollama";

/** `$OPENCODE_CONFIG` → `$XDG_CONFIG_HOME/opencode/opencode.json` → `~/.config/opencode/opencode.json`. */
export function opencodeConfigPath(): string {
	const env = process.env as Record<string, string | undefined>;
	if (env["OPENCODE_CONFIG"]) return env["OPENCODE_CONFIG"];
	const configHome = env["XDG_CONFIG_HOME"] || join(homedir(), ".config");
	return join(configHome, "opencode", "opencode.json");
}

export interface OpencodeOllamaProvider {
	baseUrl: string;
	/** Model ids exposed to OpenCode, sorted. */
	models: string[];
}

/** Current `ollama` provider block and default model, or null when absent. */
export function readOpencodeOllamaProvider(path = opencodeConfigPath()): {
	provider: OpencodeOllamaProvider | null;
	defaultModel: string | null;
} {
	const config = readConfig(path);
	const provider = record(record(config["provider"])?.[OPENCODE_OLLAMA_PROVIDER_ID]);
	const defaultModel = typeof config["model"] === "string" ? config["model"] : null;
	if (!provider) return { provider: null, defaultModel };
	const baseURL = record(provider["options"])?.["baseURL"];
	return {
		provider: {
			baseUrl: typeof baseURL === "string" ? baseURL.replace(/\/v1\/?$/, "") : "",
			models: Object.keys(record(provider["models"]) ?? {}).sort(),
		},
		defaultModel,
	};
}

/**
 * Add (or refresh) the `ollama` provider and make `defaultModel` OpenCode's
 * default. Existing provider models are kept so previously configured ids
 * stay selectable. Returns whether the file content changed.
 */
export function writeOpencodeOllamaProvider(
	input: { baseUrl: string | null | undefined; models: string[]; defaultModel?: string },
	path = opencodeConfigPath(),
): { path: string; changed: boolean; provider: OpencodeOllamaProvider } {
	const origin = ollamaOrigin(input.baseUrl);
	const config = readConfig(path);
	const providers = record(config["provider"]) ?? {};
	const existing = record(providers[OPENCODE_OLLAMA_PROVIDER_ID]) ?? {};
	const existingModels = record(existing["models"]) ?? {};
	const models: Record<string, unknown> = { ...existingModels };
	for (const id of input.models) {
		if (!id.trim()) continue;
		models[id] = record(existingModels[id]) ?? { name: id };
	}
	const next: Record<string, unknown> = {
		...config,
		provider: {
			...providers,
			[OPENCODE_OLLAMA_PROVIDER_ID]: {
				...existing,
				npm: "@ai-sdk/openai-compatible",
				name: typeof existing["name"] === "string" ? existing["name"] : "Ollama (local)",
				options: { ...(record(existing["options"]) ?? {}), baseURL: `${origin}/v1` },
				models,
			},
		},
	};
	if (input.defaultModel) {
		next["model"] = `${OPENCODE_OLLAMA_PROVIDER_ID}/${input.defaultModel}`;
	}
	if (!("$schema" in next)) {
		next["$schema"] = "https://opencode.ai/config.json";
	}
	const before = serialize(config);
	const after = serialize(next);
	if (before !== after) {
		mkdirSync(dirname(path), { recursive: true });
		// Write-then-rename so a crash never leaves OpenCode a half-written config.
		const tmp = `${path}.${process.pid}.tmp`;
		writeFileSync(tmp, after, "utf8");
		renameSync(tmp, path);
	}
	return {
		path,
		changed: before !== after,
		provider: { baseUrl: origin, models: Object.keys(models).sort() },
	};
}

function readConfig(path: string): Record<string, unknown> {
	let text: string;
	try {
		text = readFileSync(path, "utf8");
	} catch {
		return {};
	}
	try {
		const parsed = JSON.parse(text);
		if (!record(parsed)) throw new Error("not an object");
		return parsed as Record<string, unknown>;
	} catch (err) {
		// Refuse to clobber a file we cannot round-trip (JSONC, comments, typos).
		throw new Error(
			`OpenCode config at ${path} is not plain JSON (${(err as Error).message}); fix it before Studio can add the Ollama provider.`,
		);
	}
}

function serialize(config: Record<string, unknown>): string {
	return `${JSON.stringify(config, null, 2)}\n`;
}

function record(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? value as Record<string, unknown>
		: null;
}

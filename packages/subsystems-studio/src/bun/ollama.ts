/**
 * Ollama server discovery: which models are pulled locally and what they can
 * do. Shared by the Ollama judge and the OpenCode provider writer so both
 * validate against the same catalog.
 *
 * API: https://github.com/ollama/ollama/blob/main/docs/api.md#list-local-models
 */

import type { OllamaModel } from "../shared/contract";
import { ollamaOrigin } from "./judge";

export type OllamaModelInfo = OllamaModel;

export type OllamaProbe =
	| { reachable: true; baseUrl: string; models: OllamaModelInfo[] }
	| { reachable: false; baseUrl: string; error: string };

export function parseOllamaTags(payload: unknown): OllamaModelInfo[] {
	if (!payload || typeof payload !== "object" ||
		!("models" in payload) || !Array.isArray(payload.models)) {
		throw new Error("Ollama /api/tags returned an invalid response");
	}
	return payload.models.flatMap((value: unknown) => {
		if (!value || typeof value !== "object") return [];
		const m = value as Record<string, unknown>;
		const name = typeof m["name"] === "string" ? m["name"]
			: typeof m["model"] === "string" ? m["model"] : "";
		if (!name) return [];
		const capabilities = Array.isArray(m["capabilities"])
			? m["capabilities"].filter((c): c is string => typeof c === "string")
			: [];
		const details = (m["details"] ?? {}) as Record<string, unknown>;
		return [{
			name,
			capabilities,
			toolcall: capabilities.includes("tools"),
			family: typeof details["family"] === "string" ? details["family"] : undefined,
			parameterSize: typeof details["parameter_size"] === "string" ? details["parameter_size"] : undefined,
			contextLength: typeof details["context_length"] === "number" ? details["context_length"] : undefined,
		}];
	}).sort((a, b) => a.name.localeCompare(b.name));
}

export async function probeOllama(
	baseUrl: string | null | undefined,
	opts?: { fetch?: typeof fetch; timeoutMs?: number },
): Promise<OllamaProbe> {
	const origin = ollamaOrigin(baseUrl);
	try {
		const res = await (opts?.fetch ?? fetch)(`${origin}/api/tags`, {
			signal: AbortSignal.timeout(opts?.timeoutMs ?? 5_000),
		});
		if (!res.ok) {
			return { reachable: false, baseUrl: origin, error: `Ollama HTTP ${res.status}` };
		}
		return { reachable: true, baseUrl: origin, models: parseOllamaTags(await res.json()) };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			reachable: false,
			baseUrl: origin,
			error: /abort|timeout/i.test(message)
				? `Ollama did not answer at ${origin} within the timeout`
				: `Ollama is not reachable at ${origin} (${message})`,
		};
	}
}

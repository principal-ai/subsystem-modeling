/**
 * Discover OpenCode models and pick a free-tier default for Studio agents
 * (issue-fixer / gap-filler, later extractors). Uses `opencode models --verbose`.
 */

import { OPENCODE_BIN } from "./opencode-bin";

export interface OpenCodeModelInfo {
	/** `provider/id` as passed to `opencode run -m`. */
	ref: string;
	id: string;
	providerID: string;
	name?: string;
	/** True when verbose cost is zero (or id ends with `-free`). */
	free: boolean;
	toolcall: boolean;
	status?: string;
}

let cache: { at: number; models: OpenCodeModelInfo[] } | null = null;
const CACHE_MS = 5 * 60 * 1000;

/** Shared OpenCode binary path (env override, then conventional install). */
export { OPENCODE_BIN };

function isFreeModel(m: {
	id: string;
	cost?: { input?: number; output?: number };
}): boolean {
	if (/-free$/i.test(m.id) || /\bfree\b/i.test(m.id)) return true;
	const input = m.cost?.input ?? null;
	const output = m.cost?.output ?? null;
	if (input === 0 && output === 0) return true;
	return false;
}

/**
 * Parse `opencode models --verbose` stdout: alternating `provider/id` lines and
 * JSON metadata blobs.
 */
export function parseOpenCodeModelsVerbose(stdout: string): OpenCodeModelInfo[] {
	const lines = stdout.split("\n");
	const out: OpenCodeModelInfo[] = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i]!.trim();
		i++;
		if (!line || !/^[\w.@+-]+\/[\w.@+-]+$/.test(line)) continue;
		const ref = line;
		// Collect following JSON object (may span lines).
		while (i < lines.length && !lines[i]!.trim()) i++;
		if (i >= lines.length || lines[i]!.trim()[0] !== "{") {
			const [providerID, ...rest] = ref.split("/");
			const id = rest.join("/");
			out.push({
				ref,
				id,
				providerID: providerID ?? "",
				free: isFreeModel({ id }),
				toolcall: true,
			});
			continue;
		}
		let depth = 0;
		const buf: string[] = [];
		for (; i < lines.length; i++) {
			const raw = lines[i]!;
			buf.push(raw);
			for (const ch of raw) {
				if (ch === "{") depth++;
				else if (ch === "}") depth--;
			}
			if (depth === 0) {
				i++;
				break;
			}
		}
		try {
			const meta = JSON.parse(buf.join("\n")) as {
				id?: string;
				providerID?: string;
				name?: string;
				status?: string;
				cost?: { input?: number; output?: number };
				capabilities?: { toolcall?: boolean };
			};
			const id = typeof meta.id === "string" ? meta.id : ref.split("/").slice(1).join("/");
			const providerID =
				typeof meta.providerID === "string"
					? meta.providerID
					: (ref.split("/")[0] ?? "");
			out.push({
				ref: `${providerID}/${id}`,
				id,
				providerID,
				name: typeof meta.name === "string" ? meta.name : undefined,
				free: isFreeModel({ id, cost: meta.cost }),
				toolcall: meta.capabilities?.toolcall !== false,
				status: typeof meta.status === "string" ? meta.status : undefined,
			});
		} catch {
			const [providerID, ...rest] = ref.split("/");
			out.push({
				ref,
				id: rest.join("/"),
				providerID: providerID ?? "",
				free: isFreeModel({ id: rest.join("/") }),
				toolcall: true,
			});
		}
	}
	return out;
}

/** Score free models — higher is better for default maintainer. */
export function scoreFreeMaintainerModel(m: OpenCodeModelInfo): number {
	let score = 0;
	if (!m.free) return -1000;
	if (m.toolcall) score += 50;
	if (m.status === "active" || !m.status) score += 10;
	if (m.providerID === "opencode") score += 20;
	if (m.providerID === "opencode-go") score -= 5; // often paid Zen Go
	const id = m.id.toLowerCase();
	// Prefer Big Pickle when available (reliable free default).
	if (id.includes("big-pickle") || id.includes("bigpickle")) score += 80;
	if (id.includes("lightning")) score += 30;
	if (id.includes("flash")) score += 25;
	if (id.includes("mimo")) score += 20;
	if (id.includes("nemotron")) score += 15;
	if (id.includes("ultra")) score -= 10; // heavier
	if (id.endsWith("-free")) score += 15;
	return score;
}

export function pickDefaultFreeModel(
	models: OpenCodeModelInfo[],
): OpenCodeModelInfo | null {
	const free = models.filter((m) => m.free && m.toolcall);
	if (free.length === 0) return null;
	return [...free].sort(
		(a, b) => scoreFreeMaintainerModel(b) - scoreFreeMaintainerModel(a),
	)[0]!;
}

/** Hardcoded last resort when `opencode models` fails. */
export const FALLBACK_FREE_MAINTAINER_MODEL = "opencode/big-pickle";

export async function listOpenCodeModels(opts?: {
	refresh?: boolean;
}): Promise<OpenCodeModelInfo[]> {
	const now = Date.now();
	if (!opts?.refresh && cache && now - cache.at < CACHE_MS) {
		return cache.models;
	}

	const args = ["models", "--verbose"];
	if (opts?.refresh) args.push("--refresh");

	const proc = Bun.spawn({
		cmd: [OPENCODE_BIN, ...args],
		stdio: ["ignore", "pipe", "pipe"],
	});
	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	const code = await proc.exited;
	if (code !== 0) {
		throw new Error(
			stderr.trim().split("\n").pop() ||
				`opencode models exited ${code}`,
		);
	}
	const models = parseOpenCodeModelsVerbose(stdout);
	cache = { at: now, models };
	return models;
}

export async function listFreeOpenCodeModels(opts?: {
	refresh?: boolean;
}): Promise<OpenCodeModelInfo[]> {
	const all = await listOpenCodeModels(opts);
	return all
		.filter((m) => m.free)
		.sort((a, b) => scoreFreeMaintainerModel(b) - scoreFreeMaintainerModel(a));
}

/**
 * Resolve which model the subsystem maintainer should use.
 * Order: explicit override → env → auto free discovery → fallback.
 */
export async function resolveSubsystemMaintainerModel(opts?: {
	/** From viewer settings when the user (later) picks one. */
	configured?: string | null;
	refresh?: boolean;
}): Promise<{
	model: string;
	source: "settings" | "env" | "auto" | "fallback";
	freeModels: OpenCodeModelInfo[];
}> {
	const configured = opts?.configured?.trim();
	if (configured) {
		let freeModels: OpenCodeModelInfo[] = [];
		try {
			freeModels = await listFreeOpenCodeModels({ refresh: opts?.refresh });
		} catch {
			/* ignore — still honor explicit setting */
		}
		return { model: configured, source: "settings", freeModels };
	}

	const fromEnv = process.env["SUBSYSTEM_MAINTAINER_MODEL"]?.trim();
	if (fromEnv) {
		let freeModels: OpenCodeModelInfo[] = [];
		try {
			freeModels = await listFreeOpenCodeModels({ refresh: opts?.refresh });
		} catch {
			/* ignore */
		}
		return { model: fromEnv, source: "env", freeModels };
	}

	try {
		const freeModels = await listFreeOpenCodeModels({ refresh: opts?.refresh });
		const picked = pickDefaultFreeModel(freeModels);
		if (picked) {
			return { model: picked.ref, source: "auto", freeModels };
		}
		return {
			model: FALLBACK_FREE_MAINTAINER_MODEL,
			source: "fallback",
			freeModels,
		};
	} catch {
		return {
			model: FALLBACK_FREE_MAINTAINER_MODEL,
			source: "fallback",
			freeModels: [],
		};
	}
}

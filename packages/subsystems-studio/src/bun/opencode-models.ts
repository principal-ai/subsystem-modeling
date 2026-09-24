/**
 * Discover OpenCode models and pick a free-tier default for Studio agents
 * (the maintain verifier/fixer agents, later extractors). Uses `opencode models --verbose`.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";

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

function topScored(models: OpenCodeModelInfo[]): OpenCodeModelInfo | null {
	return [...models].sort(
		(a, b) => scoreFreeMaintainerModel(b) - scoreFreeMaintainerModel(a),
	)[0] ?? null;
}

/**
 * Pick the default Maintainer model. When the credentialed provider set is
 * known, free models whose provider has no credential are unusable (e.g. the
 * `opencode`/Zen provider fails headless without a Zen API key) and are
 * skipped; the best credentialed tool-calling model is used instead. When
 * credentials are unknown (null), fall back to free-only selection.
 */
export function pickDefaultMaintainerModel(
	models: OpenCodeModelInfo[],
	credentialed: Set<string> | null,
): OpenCodeModelInfo | null {
	const toolcap = models.filter((m) => m.toolcall);
	if (toolcap.length === 0) return null;
	if (credentialed === null) {
		const free = toolcap.filter((m) => m.free);
		return topScored(free.length > 0 ? free : toolcap);
	}
	const pool = toolcap.filter((m) => credentialed.has(m.providerID));
	if (pool.length === 0) return null;
	const free = pool.filter((m) => m.free);
	return topScored(free.length > 0 ? free : pool);
}

/**
 * Credential-aware list surfaced to the model picker: eligible free models
 * when known, otherwise the credentialed tool-calling pool (or the free list
 * when credentials are unknown).
 */
export function buildMaintainerCandidates(
	models: OpenCodeModelInfo[],
	credentialed: Set<string> | null,
	freeModels: OpenCodeModelInfo[],
): OpenCodeModelInfo[] {
	if (credentialed === null) return freeModels;
	const pool = models.filter(
		(m) => m.toolcall && credentialed.has(m.providerID),
	);
	if (pool.length === 0) return freeModels;
	const free = pool.filter((m) => m.free);
	return [...(free.length > 0 ? free : pool)].sort(
		(a, b) => scoreFreeMaintainerModel(b) - scoreFreeMaintainerModel(a),
	);
}

/** Path to OpenCode's shared credential store (`auth list` reads it too). */
export function resolveOpenCodeAuthJsonPath(): string | null {
	const env = process.env as Record<string, string | undefined>;
	if (env["OPENCODE_DATA_DIR"]) return `${env["OPENCODE_DATA_DIR"]}/opencode/auth.json`;
	const xdgData = env["XDG_DATA_HOME"] || `${homedir()}/.local/share`;
	return `${xdgData}/opencode/auth.json`;
}

/** Parse OpenCode `auth.json`: top-level keys = credentialed providers. */
export function parseCredentialedProvidersFromAuthJson(
	text: string,
): Set<string> {
	const out = new Set<string>();
	try {
		const obj = JSON.parse(text) as Record<string, unknown>;
		for (const [key, val] of Object.entries(obj)) {
			if (val !== null && typeof val === "object") out.add(key);
		}
	} catch {
		/* malformed store — treat as empty */
	}
	return out;
}

/**
 * Providers OpenCode has credentials for, or null when the store cannot be
 * read (unknown — do not gate model selection on it).
 */
export async function getCredentialedProviders(): Promise<Set<string> | null> {
	const path = resolveOpenCodeAuthJsonPath();
	if (!path) return null;
	try {
		return parseCredentialedProvidersFromAuthJson(
			readFileSync(path, "utf8"),
		);
	} catch {
		return null;
	}
}

/**
 * Hardcoded last resort when `opencode models` fails or no eligible model can
 * be auto-picked. Prefers a credentialed, tool-capable model because the
 * `opencode`/Zen free tier currently cannot execute headless agent sessions.
 */
export const FALLBACK_MAINTAINER_MODEL = "opencode-go/deepseek-v4-flash";

/** @deprecated Use FALLBACK_MAINTAINER_MODEL. */
export const FALLBACK_FREE_MAINTAINER_MODEL = FALLBACK_MAINTAINER_MODEL;

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
 * Paid Zen Go (`opencode-go/*`) tool-call models — the credentialed tier that
 * currently runs headless agent sessions while the free Zen tier is gated.
 * Surfaced separately so the picker can offer a one-click "Go" choice.
 */
export async function listGoOpenCodeModels(opts?: {
	refresh?: boolean;
}): Promise<OpenCodeModelInfo[]> {
	const all = await listOpenCodeModels(opts);
	return all
		.filter((m) => m.toolcall && m.providerID === "opencode-go")
		.sort((a, b) => a.ref.localeCompare(b.ref));
}

/** Provider part of a `provider/id` model ref, or "" when malformed. */
export function modelProviderOf(ref: string | undefined): string {
	if (!ref) return "";
	const idx = ref.indexOf("/");
	return idx > 0 ? ref.slice(0, idx) : "";
}

/**
 * A `provider/id` ref is usable when we have no credential data (null —
 * honor it) or when the ref's provider holds a credential.
 */
export function isUsableModelRef(
	ref: string | undefined,
	credentialed: Set<string> | null,
): boolean {
	if (!ref) return false;
	if (credentialed === null) return true;
	return credentialed.has(modelProviderOf(ref));
}

/**
 * Resolve which model the subsystem maintainer should use.
 * Order: credentialed override → credentialed env → credentialed-aware auto →
 * fallback. Overrides whose provider has no credential are skipped so a
 * remembered free/Zen model never triggers an instant headless failure.
 */
export async function resolveSubsystemMaintainerModel(opts?: {
	/** From viewer settings when the user (later) picks one. */
	configured?: string | null;
	refresh?: boolean;
}): Promise<{
	model: string;
	source: "settings" | "env" | "auto" | "fallback";
	freeModels: OpenCodeModelInfo[];
	/** Paid Zen Go (`opencode-go/*`) tool-call models for the picker's Go tier. */
	goModels?: OpenCodeModelInfo[];
	/** Credential-aware selectable maintainer models. */
	candidates?: OpenCodeModelInfo[];
	/** Providers with credentials, or null when unknown. */
	credentialedProviders?: string[] | null;
}> {
	const credentialed = await getCredentialedProviders();

	const configured = opts?.configured?.trim();
	if (configured && isUsableModelRef(configured, credentialed)) {
		const freeModels = await listFreeOpenCodeModelsOrEmpty({ refresh: opts?.refresh });
		const goModels = await listGoOpenCodeModelsOrEmpty({ refresh: opts?.refresh });
		return {
			model: configured,
			source: "settings",
			freeModels,
			goModels,
			credentialedProviders: credentialed ? [...credentialed] : null,
		};
	}

	const fromEnv = process.env["SUBSYSTEM_MAINTAINER_MODEL"]?.trim();
	if (fromEnv && isUsableModelRef(fromEnv, credentialed)) {
		const freeModels = await listFreeOpenCodeModelsOrEmpty({ refresh: opts?.refresh });
		const goModels = await listGoOpenCodeModelsOrEmpty({ refresh: opts?.refresh });
		return {
			model: fromEnv,
			source: "env",
			freeModels,
			goModels,
			credentialedProviders: credentialed ? [...credentialed] : null,
		};
	}

	try {
		const all = await listOpenCodeModels({ refresh: opts?.refresh });
		const picked = pickDefaultMaintainerModel(all, credentialed);
		const freeModels = all
			.filter((m) => m.free)
			.sort(
				(a, b) => scoreFreeMaintainerModel(b) - scoreFreeMaintainerModel(a),
			);
		const goModels = all
			.filter((m) => m.toolcall && m.providerID === "opencode-go")
			.sort((a, b) => a.ref.localeCompare(b.ref));
		const candidates = buildMaintainerCandidates(
			all,
			credentialed,
			freeModels,
		);
		if (picked) {
			return {
				model: picked.ref,
				source: "auto",
				freeModels,
				goModels,
				candidates,
				credentialedProviders: credentialed ? [...credentialed] : null,
			};
		}
		return {
			model: FALLBACK_MAINTAINER_MODEL,
			source: "fallback",
			freeModels,
			goModels,
			candidates,
			credentialedProviders: credentialed ? [...credentialed] : null,
		};
	} catch {
		return {
			model: FALLBACK_MAINTAINER_MODEL,
			source: "fallback",
			freeModels: [],
			goModels: [],
			credentialedProviders: credentialed ? [...credentialed] : null,
		};
	}
}

async function listFreeOpenCodeModelsOrEmpty(opts?: {
	refresh?: boolean;
}): Promise<OpenCodeModelInfo[]> {
	try {
		return await listFreeOpenCodeModels({ refresh: opts?.refresh });
	} catch {
		return [];
	}
}

async function listGoOpenCodeModelsOrEmpty(opts?: {
	refresh?: boolean;
}): Promise<OpenCodeModelInfo[]> {
	try {
		return await listGoOpenCodeModels({ refresh: opts?.refresh });
	} catch {
		return [];
	}
}

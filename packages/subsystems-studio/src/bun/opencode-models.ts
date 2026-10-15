/**
 * Discover maintenance models from the same location-scoped V2 catalog that
 * executes sessions. The server owns provider authentication and availability.
 */
import { ensureOpencodeServiceRunning } from "./opencode-connection";
import { serverAuthHeaders, type OpencodeConnection } from "./server-sessions";

export interface OpenCodeModelInfo {
	ref: string;
	id: string;
	providerID: string;
	name?: string;
	free: boolean;
	toolcall: boolean;
	status?: string;
	enabled: boolean;
}

/** Validate the wire boundary without assuming unknown pricing means free. */
export function parseOpenCodeModelCatalog(payload: unknown): OpenCodeModelInfo[] {
	if (!payload || typeof payload !== "object" ||
		!("data" in payload) || !Array.isArray(payload.data)) {
		throw new Error("OpenCode model catalog returned an invalid response");
	}
	return payload.data.map((value: unknown) => {
		if (!value || typeof value !== "object") {
			throw new Error("OpenCode model catalog returned an invalid model");
		}
		const m = value as Record<string, unknown>;
		const capabilities = m["capabilities"] as { tools?: unknown } | undefined;
		if (typeof m["id"] !== "string" || !m["id"] ||
			typeof m["providerID"] !== "string" || !m["providerID"] ||
			!capabilities || typeof capabilities.tools !== "boolean" ||
			typeof m["enabled"] !== "boolean") {
			throw new Error("OpenCode model catalog returned invalid model metadata");
		}
		const costs = m["cost"];
		const free = Array.isArray(costs) && costs.length > 0
			? costs.every((cost: unknown) => {
				if (!cost || typeof cost !== "object") return false;
				return "input" in cost && cost.input === 0 &&
					"output" in cost && cost.output === 0;
			})
			: /-free$/i.test(m["id"]);
		return {
			ref: `${m["providerID"]}/${m["id"]}`,
			id: m["id"],
			providerID: m["providerID"],
			name: typeof m["name"] === "string" ? m["name"] : undefined,
			free,
			toolcall: capabilities.tools,
			status: typeof m["status"] === "string" ? m["status"] : undefined,
			enabled: m["enabled"],
		};
	});
}

export async function listOpenCodeModels(opts?: {
	refresh?: boolean;
	directory?: string;
	connection?: OpencodeConnection;
}): Promise<OpenCodeModelInfo[]> {
	let connection = opts?.connection;
	if (!connection) {
		const ensured = await ensureOpencodeServiceRunning();
		if (!ensured.ok) throw new Error(ensured.error);
		connection = ensured.connection;
	}
	const url = new URL("/api/model", connection.url);
	url.searchParams.set("location[directory]", opts?.directory ?? process.cwd());
	// Always read a fresh server snapshot, including on Refresh. A separate
	// Studio cache could otherwise outlive a provider/configuration change.
	const res = await fetch(url, {
		headers: serverAuthHeaders(connection.password),
		signal: AbortSignal.timeout(15_000),
	});
	if (!res.ok) {
		throw new Error(`OpenCode model catalog request failed (${res.status})`);
	}
	return parseOpenCodeModelCatalog(await res.json());
}

export function scoreFreeMaintainerModel(m: OpenCodeModelInfo): number {
	let score = m.free ? 1000 : 0;
	if (m.toolcall) score += 50;
	if (m.status === "active" || !m.status) score += 10;
	if (m.providerID === "opencode") score += 20;
	const id = m.id.toLowerCase();
	if (id.includes("big-pickle") || id.includes("bigpickle")) score += 80;
	if (id.includes("lightning")) score += 30;
	if (id.includes("flash")) score += 25;
	if (id.includes("mimo")) score += 20;
	if (id.includes("nemotron")) score += 15;
	if (id.includes("ultra")) score -= 10;
	return score;
}

export function buildMaintainerCandidates(models: OpenCodeModelInfo[]): OpenCodeModelInfo[] {
	return models.filter((m) => m.enabled && m.toolcall && m.status !== "deprecated")
		.sort((a, b) => scoreFreeMaintainerModel(b) - scoreFreeMaintainerModel(a) ||
			a.ref.localeCompare(b.ref));
}

export function requireMaintainerModel(ref: string, models: OpenCodeModelInfo[]): OpenCodeModelInfo {
	const model = buildMaintainerCandidates(models).find((m) => m.ref === ref);
	if (!model) {
		throw new Error(`Model ${ref} is not available for maintenance in the OpenCode server catalog. Refresh the model list and choose an available tool-capable model.`);
	}
	return model;
}

export function modelProviderOf(ref: string | undefined): string {
	if (!ref) return "";
	const idx = ref.indexOf("/");
	return idx > 0 ? ref.slice(0, idx) : "";
}

export async function resolveSubsystemMaintainerModel(opts?: {
	configured?: string | null;
	/** An explicit Run selection must fail rather than silently change models. */
	strictConfigured?: boolean;
	refresh?: boolean;
	directory?: string;
	connection?: OpencodeConnection;
}): Promise<{
	model: string;
	source: "settings" | "env" | "auto";
	freeModels: OpenCodeModelInfo[];
	goModels: OpenCodeModelInfo[];
	candidates: OpenCodeModelInfo[];
	note?: string;
}> {
	const candidates = buildMaintainerCandidates(await listOpenCodeModels(opts));
	if (candidates.length === 0) {
		throw new Error("No enabled tool-capable models are available in the OpenCode server catalog. Connect a provider in OpenCode and refresh the model list.");
	}
	const configured = opts?.configured?.trim();
	const fromEnv = process.env["SUBSYSTEM_MAINTAINER_MODEL"]?.trim();
	if (configured && opts?.strictConfigured) requireMaintainerModel(configured, candidates);
	const configuredModel = candidates.find((m) => m.ref === configured);
	const envModel = candidates.find((m) => m.ref === fromEnv);
	const selected = configuredModel ?? envModel;
	const unavailable = configured && !configuredModel ? configured
		: fromEnv && !envModel ? fromEnv : undefined;
	return {
		model: selected?.ref ?? candidates[0]!.ref,
		source: configuredModel ? "settings" : envModel ? "env" : "auto",
		freeModels: candidates.filter((m) => m.free),
		goModels: candidates.filter((m) => m.providerID === "opencode-go"),
		candidates,
		note: unavailable
			? `Model ${unavailable} is no longer available for maintenance in the OpenCode server catalog. Using ${selected?.ref ?? "Auto"} instead.`
			: undefined,
	};
}

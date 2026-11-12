/**
 * Loopback-only HTTP for Studio configuration: viewer settings and the
 * Ollama integration (local judge + OpenCode `ollama` provider).
 *
 * Mounted under `/api/settings` and `/api/ollama`. Mutations here reach the
 * stored TypeSafe key and rewrite the user's OpenCode config, so, like the
 * model-source routes, they refuse non-loopback hosts and foreign origins.
 */

import type {
	OllamaConfigureInput,
	OllamaConfigureOutcome,
	OllamaIntegrationStatus,
	PartialViewerSettings,
	ViewerSettings,
} from "../shared/contract";
import { listOpenCodeModels, type OpenCodeModelInfo } from "./opencode-models";
import { restartOpencodeService } from "./opencode-connection";
import {
	opencodeConfigPath,
	readOpencodeOllamaProvider,
	writeOpencodeOllamaProvider,
} from "./opencode-config";
import { probeOllama, type OllamaModelInfo, type OllamaProbe } from "./ollama";
import { ollamaOrigin } from "./judge";
import { coerceOllamaBaseUrl } from "./viewer-settings";

/** Host-owned settings access so HTTP patches re-sync tabs and schedulers exactly like IPC. */
export interface SettingsHttpHandlers {
	get(): ViewerSettings;
	patch(patch: PartialViewerSettings): ViewerSettings;
	/** True while a Maintain run is in flight — restarting OpenCode would kill it. */
	isMaintaining?: () => boolean;
}

export interface SettingsHttpDeps {
	settings: SettingsHttpHandlers;
	fetch?: typeof fetch;
	probe?: typeof probeOllama;
	readProvider?: typeof readOpencodeOllamaProvider;
	writeProvider?: typeof writeOpencodeOllamaProvider;
	configPath?: () => string;
	restartOpencode?: typeof restartOpencodeService;
	listCatalog?: typeof listOpenCodeModels;
}

export class SettingsHttpError extends Error {
	constructor(message: string, readonly status = 400) {
		super(message);
	}
}

/** Settings as exposed over HTTP: the key itself never leaves the host. */
export function redactSettings(settings: ViewerSettings): Omit<ViewerSettings, "typesafeApiKey"> & {
	typesafeApiKeySet: boolean;
} {
	const { typesafeApiKey, ...rest } = settings;
	return { ...rest, typesafeApiKeySet: Boolean(typesafeApiKey) };
}

const SETTINGS_KEYS: ReadonlySet<keyof PartialViewerSettings> = new Set([
	"defaultTabs",
	"showFailedRepoCityCards",
	"autoAcceptSubsystemModelProposals",
	"autoAcceptSubsystemModelConfidenceThreshold",
	"subsystemMaintainerModel",
	"regularAuditEnabled",
	"regularAuditIntervalMinutes",
	"autoApplyAuditFixes",
	"typesafeApiKey",
	"secondOpinionProvider",
	"ollamaBaseUrl",
	"ollamaJudgeModel",
	"maintenanceRepoKey",
	"lastActiveTabId",
]);

function parseSettingsPatch(body: unknown): PartialViewerSettings {
	const obj = record(body);
	if (!obj) throw new SettingsHttpError("Body must be a JSON object of settings");
	const unknown = Object.keys(obj).filter((k) => !SETTINGS_KEYS.has(k as keyof PartialViewerSettings));
	if (unknown.length) throw new SettingsHttpError(`Unknown settings: ${unknown.join(", ")}`);
	if ("secondOpinionProvider" in obj &&
		obj["secondOpinionProvider"] !== "typesafe" && obj["secondOpinionProvider"] !== "ollama") {
		throw new SettingsHttpError('secondOpinionProvider must be "typesafe" or "ollama"');
	}
	if ("ollamaBaseUrl" in obj && obj["ollamaBaseUrl"] !== null &&
		coerceOllamaBaseUrl(obj["ollamaBaseUrl"]) === null) {
		throw new SettingsHttpError("ollamaBaseUrl must be an http(s) URL");
	}
	return obj as PartialViewerSettings;
}

export type OllamaStatus = OllamaIntegrationStatus;

export async function ollamaStatus(deps: SettingsHttpDeps): Promise<OllamaStatus> {
	const settings = deps.settings.get();
	const probe = await (deps.probe ?? probeOllama)(settings.ollamaBaseUrl, { fetch: deps.fetch });
	const configPath = (deps.configPath ?? opencodeConfigPath)();
	let opencode: OllamaStatus["agent"]["opencode"] = { configPath, provider: null, defaultModel: null };
	try {
		const read = (deps.readProvider ?? readOpencodeOllamaProvider)(configPath);
		opencode = { configPath, ...read };
	} catch {
		// An unreadable config is reported when the user tries to write it.
	}
	const judgeModel = settings.ollamaJudgeModel;
	return {
		baseUrl: probe.baseUrl,
		reachable: probe.reachable,
		...(probe.reachable ? {} : { error: probe.error }),
		models: probe.reachable ? probe.models : [],
		judge: {
			provider: settings.secondOpinionProvider,
			model: judgeModel,
			ready: settings.secondOpinionProvider !== "ollama" ||
				(Boolean(judgeModel) && probe.reachable && probe.models.some((m) => m.name === judgeModel)),
		},
		agent: {
			maintainerModel: settings.subsystemMaintainerModel,
			opencode,
		},
	};
}

type ConfigureInput = Omit<OllamaConfigureInput, "restartOpencode"> & { restartOpencode: boolean };

/** Validate untrusted input (HTTP body or IPC params) into a configure request. */
export function parseConfigureInput(body: unknown): ConfigureInput {
	const obj = record(body);
	if (!obj) throw new SettingsHttpError("Body must be a JSON object");
	const input: ConfigureInput = { restartOpencode: obj["restartOpencode"] !== false };
	if (obj["baseUrl"] !== undefined) {
		const origin = coerceOllamaBaseUrl(obj["baseUrl"]);
		if (!origin) throw new SettingsHttpError("baseUrl must be an http(s) URL");
		input.baseUrl = origin;
	}
	if (obj["agentModel"] !== undefined) {
		if (typeof obj["agentModel"] !== "string" || !obj["agentModel"].trim()) {
			throw new SettingsHttpError("agentModel must be a non-empty Ollama model name");
		}
		input.agentModel = obj["agentModel"].trim();
	}
	if (obj["judgeModel"] !== undefined) {
		if (obj["judgeModel"] === null) input.judgeModel = null;
		else if (typeof obj["judgeModel"] !== "string" || !obj["judgeModel"].trim()) {
			throw new SettingsHttpError("judgeModel must be an Ollama model name or null");
		} else input.judgeModel = obj["judgeModel"].trim();
	}
	if (obj["secondOpinionProvider"] !== undefined) {
		if (obj["secondOpinionProvider"] !== "typesafe" && obj["secondOpinionProvider"] !== "ollama") {
			throw new SettingsHttpError('secondOpinionProvider must be "typesafe" or "ollama"');
		}
		input.secondOpinionProvider = obj["secondOpinionProvider"];
	}
	if (input.baseUrl === undefined && input.agentModel === undefined &&
		input.judgeModel === undefined && input.secondOpinionProvider === undefined) {
		throw new SettingsHttpError("Nothing to configure: pass baseUrl, agentModel, judgeModel, or secondOpinionProvider");
	}
	return input;
}

function requireModel(probe: OllamaProbe, name: string, role: string): OllamaModelInfo {
	if (!probe.reachable) throw new SettingsHttpError(probe.error, 502);
	const model = probe.models.find((m) => m.name === name);
	if (!model) {
		throw new SettingsHttpError(
			`${role} model "${name}" is not pulled on ${probe.baseUrl}. Run \`ollama pull ${name}\` or pick one of: ${probe.models.map((m) => m.name).join(", ") || "(none)"}`,
			404,
		);
	}
	return model;
}

export type OllamaConfigureResult = OllamaConfigureOutcome & { ok: true };

export async function configureOllama(input: ConfigureInput, deps: SettingsHttpDeps): Promise<OllamaConfigureResult> {
	const current = deps.settings.get();
	const origin = ollamaOrigin(input.baseUrl ?? current.ollamaBaseUrl);
	const applied: OllamaConfigureResult["applied"] = {};
	const warnings: string[] = [];

	// Validate against the live Ollama catalog before touching any config.
	let probe: OllamaProbe | null = null;
	if (input.agentModel || input.judgeModel) {
		probe = await (deps.probe ?? probeOllama)(origin, { fetch: deps.fetch });
		if (input.judgeModel) requireModel(probe, input.judgeModel, "Judge");
		if (input.agentModel) {
			const model = requireModel(probe, input.agentModel, "Agent");
			if (!model.toolcall) {
				throw new SettingsHttpError(
					`Agent model "${model.name}" does not report tool calling; Maintain agents need tools. Tool-capable models: ${probe.reachable ? probe.models.filter((m) => m.toolcall).map((m) => m.name).join(", ") || "(none)" : "(unknown)"}`,
					422,
				);
			}
		}
	}

	const rewriteProvider = input.agentModel !== undefined ||
		(input.baseUrl !== undefined && hasOllamaProvider(deps));
	if (rewriteProvider && input.restartOpencode && deps.settings.isMaintaining?.()) {
		throw new SettingsHttpError(
			"A Maintain run is in progress; restarting OpenCode would kill it. Retry when it finishes or pass restartOpencode:false.",
			409,
		);
	}

	const patch: PartialViewerSettings = {};
	if (input.baseUrl !== undefined) patch.ollamaBaseUrl = input.baseUrl;
	if (input.judgeModel !== undefined) patch.ollamaJudgeModel = input.judgeModel;
	// Choosing a judge model means using it, unless the caller said otherwise.
	const provider = input.secondOpinionProvider ??
		(input.judgeModel ? "ollama" : undefined);
	if (provider !== undefined) patch.secondOpinionProvider = provider;
	if (input.agentModel) patch.subsystemMaintainerModel = `ollama/${input.agentModel}`;

	if (rewriteProvider) {
		const write = (deps.writeProvider ?? writeOpencodeOllamaProvider)(
			{
				baseUrl: origin,
				models: input.agentModel ? [input.agentModel] : [],
				defaultModel: input.agentModel,
			},
			(deps.configPath ?? opencodeConfigPath)(),
		);
		applied.opencodeConfig = { path: write.path, changed: write.changed };
	}

	if (Object.keys(patch).length) {
		const next = deps.settings.patch(patch);
		if (patch.ollamaBaseUrl !== undefined) applied.baseUrl = ollamaOrigin(next.ollamaBaseUrl);
		if (patch.ollamaJudgeModel !== undefined) applied.judgeModel = next.ollamaJudgeModel;
		if (patch.secondOpinionProvider !== undefined) applied.secondOpinionProvider = next.secondOpinionProvider;
		if (input.agentModel) {
			applied.agentModel = input.agentModel;
			applied.maintainerModel = next.subsystemMaintainerModel ?? undefined;
		}
	}

	if (rewriteProvider && input.restartOpencode) {
		const restarted = await (deps.restartOpencode ?? restartOpencodeService)();
		applied.opencodeRestarted = restarted.ok;
		if (!restarted.ok) {
			warnings.push(`OpenCode was not restarted: ${restarted.error}. Restart it (\`opencode2 service restart\`) so it picks up the Ollama provider.`);
		} else if (input.agentModel) {
			try {
				const catalog: OpenCodeModelInfo[] = await (deps.listCatalog ?? listOpenCodeModels)({
					connection: restarted.connection,
				});
				const ref = `ollama/${input.agentModel}`;
				const hit = catalog.find((m) => m.ref === ref);
				applied.opencodeCatalogHasModel = Boolean(hit && hit.enabled && hit.toolcall);
				if (!hit) warnings.push(`OpenCode restarted but its catalog does not list ${ref} yet.`);
				else if (!hit.enabled || !hit.toolcall) warnings.push(`OpenCode lists ${ref} but not as an enabled tool-capable model.`);
			} catch (err) {
				warnings.push(`Could not read the OpenCode catalog after restart: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
	} else if (rewriteProvider && applied.opencodeConfig?.changed) {
		warnings.push("OpenCode config changed; restart OpenCode (`opencode2 service restart`) before running Maintain.");
	}

	return { ok: true, applied, warnings, status: await ollamaStatus(deps) };
}

function hasOllamaProvider(deps: SettingsHttpDeps): boolean {
	try {
		return (deps.readProvider ?? readOpencodeOllamaProvider)((deps.configPath ?? opencodeConfigPath)()).provider !== null;
	} catch {
		return false;
	}
}

export function isLoopbackRequest(req: Request): boolean {
	const url = new URL(req.url);
	return ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
		(!req.headers.has("origin") || req.headers.get("origin") === url.origin);
}

export async function handleSettingsRequest(
	req: Request,
	deps: SettingsHttpDeps,
): Promise<Response | null> {
	const url = new URL(req.url);
	const path = url.pathname;
	const isSettings = path === "/api/settings";
	const isOllama = path === "/api/ollama" || path.startsWith("/api/ollama/");
	if (!isSettings && !isOllama) return null;
	const reply = (data: unknown, status = 200) => Response.json(data, { status });
	if (!isLoopbackRequest(req)) {
		return reply({ ok: false, error: "Cross-origin settings requests are not allowed" }, 403);
	}
	try {
		if (isSettings) {
			if (req.method === "GET") return reply({ ok: true, settings: redactSettings(deps.settings.get()) });
			if (req.method === "PATCH" || req.method === "PUT") {
				const patch = parseSettingsPatch(await readJson(req));
				return reply({ ok: true, settings: redactSettings(deps.settings.patch(patch)) });
			}
		}
		if (path === "/api/ollama") {
			if (req.method === "GET") return reply({ ok: true, ...await ollamaStatus(deps) });
			if (req.method === "PUT" || req.method === "POST") {
				return reply(await configureOllama(parseConfigureInput(await readJson(req)), deps));
			}
		}
		if (path === "/api/ollama/models" && req.method === "GET") {
			const probe = await (deps.probe ?? probeOllama)(deps.settings.get().ollamaBaseUrl, { fetch: deps.fetch });
			if (!probe.reachable) return reply({ ok: false, baseUrl: probe.baseUrl, error: probe.error }, 502);
			return reply({ ok: true, baseUrl: probe.baseUrl, models: probe.models });
		}
		return reply({ ok: false, error: "Not found" }, 404);
	} catch (err) {
		if (err instanceof SettingsHttpError) return reply({ ok: false, error: err.message }, err.status);
		return reply({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
	}
}

async function readJson(req: Request): Promise<unknown> {
	try {
		return await req.json();
	} catch {
		throw new SettingsHttpError("Invalid JSON body");
	}
}

function record(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? value as Record<string, unknown>
		: null;
}

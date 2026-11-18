/**
 * Viewer settings store — persisted flags that control host chrome (which
 * permanent tabs appear by default, etc.).
 *
 * Single JSON file at `~/.principal/principal-studio-settings.json`. Missing or
 * corrupt files fall back to defaults (Subsystems and Maintainer on).
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	DEFAULT_TAB_FLAGS,
	type PartialViewerSettings,
	type SecondOpinionProvider,
	type ViewerSettings,
} from "../shared/contract";
import { isStudioThemeName } from "../shared/studio-theme";

const STORE_PATH = join(homedir(), ".principal", "principal-studio-settings.json");

/** Floor for regular audit interval (minutes). */
export const REGULAR_AUDIT_INTERVAL_MIN_MINUTES = 5;
/** Default interval when the setting is missing or invalid. */
export const REGULAR_AUDIT_INTERVAL_DEFAULT_MINUTES = 5;

/** Default minimum Jev confidence (0-1) required to auto-accept a proposal. */
export const AUTO_ACCEPT_CONFIDENCE_DEFAULT = 0.85;

export function defaultViewerSettings(): ViewerSettings {
	return {
		selectedTheme: "slateNeon",
		themeOverrides: {},
		defaultTabs: { ...DEFAULT_TAB_FLAGS },
		showFailedRepoCityCards: false,
		autoAcceptSubsystemModelProposals: false,
		autoAcceptSubsystemModelConfidenceThreshold: AUTO_ACCEPT_CONFIDENCE_DEFAULT,
		subsystemMaintainerModel: null,
		regularAuditEnabled: false,
		regularAuditIntervalMinutes: REGULAR_AUDIT_INTERVAL_DEFAULT_MINUTES,
		autoApplyAuditFixes: true,
		typesafeApiKey: null,
		secondOpinionProvider: "typesafe",
		ollamaBaseUrl: null,
		ollamaJudgeModel: null,
		maintenanceRepoKey: null,
		lastActiveTabId: null,
	};
}

export function coerceSecondOpinionProvider(
	value: unknown,
	fallback: SecondOpinionProvider = "typesafe",
): SecondOpinionProvider {
	return value === "ollama" || value === "typesafe" ? value : fallback;
}

/**
 * Keep only the origin (scheme + host + port) of an Ollama URL, so the same
 * value can be used for both `/api/*` and the OpenCode `/v1` baseURL.
 * Anything that is not an http(s) URL becomes `null` (the default origin).
 */
export function coerceOllamaBaseUrl(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	try {
		const url = new URL(trimmed);
		if (url.protocol !== "http:" && url.protocol !== "https:") return null;
		return url.origin;
	} catch {
		return null;
	}
}

function coerceBool(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

/** Clamp a Jev confidence threshold to the 0-1 range; NaN falls to default. */
export function coerceConfidenceThreshold(value: unknown): number {
	const n =
		typeof value === "number"
			? value
			: typeof value === "string"
				? Number(value)
				: NaN;
	if (!Number.isFinite(n)) return AUTO_ACCEPT_CONFIDENCE_DEFAULT;
	return Math.min(1, Math.max(0, n));
}

function coerceModelRef(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function coerceRegularAuditIntervalMinutes(value: unknown): number {
	const n =
		typeof value === "number"
			? value
			: typeof value === "string"
				? Number(value)
				: NaN;
	if (!Number.isFinite(n)) return REGULAR_AUDIT_INTERVAL_DEFAULT_MINUTES;
	return Math.max(REGULAR_AUDIT_INTERVAL_MIN_MINUTES, Math.round(n));
}

function coerceThemeOverrides(value: unknown): Record<string, Record<string, unknown>> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
	const result: Record<string, Record<string, unknown>> = {};
	for (const [name, overrides] of Object.entries(value)) {
		if (isStudioThemeName(name) && typeof overrides === "object" && overrides !== null && !Array.isArray(overrides)) {
			result[name] = overrides as Record<string, unknown>;
		}
	}
	return result;
}

function normalize(raw: unknown): ViewerSettings {
	const defaults = defaultViewerSettings();
	if (typeof raw !== "object" || raw === null) return defaults;
	const obj = raw as Record<string, unknown>;
	const tabs =
		typeof obj["defaultTabs"] === "object" && obj["defaultTabs"] !== null
			? (obj["defaultTabs"] as Record<string, unknown>)
			: {};
	return {
		selectedTheme: isStudioThemeName(obj["selectedTheme"])
			? obj["selectedTheme"]
			: defaults.selectedTheme,
		themeOverrides: coerceThemeOverrides(obj["themeOverrides"]),
		defaultTabs: {
			sessions: coerceBool(tabs["sessions"], defaults.defaultTabs.sessions),
			maintenanceSessions: coerceBool(
				tabs["maintenanceSessions"],
				defaults.defaultTabs.maintenanceSessions,
			),
			tours: coerceBool(tabs["tours"], defaults.defaultTabs.tours),
			graphify: coerceBool(tabs["graphify"], defaults.defaultTabs.graphify),
			packageLayers: coerceBool(
				tabs["packageLayers"],
				defaults.defaultTabs.packageLayers,
			),
			subsystems: coerceBool(tabs["subsystems"], defaults.defaultTabs.subsystems),
			sharedSubsystems: coerceBool(tabs["sharedSubsystems"], defaults.defaultTabs.sharedSubsystems),
			constructs: coerceBool(tabs["constructs"], defaults.defaultTabs.constructs),
			maintenance: coerceBool(tabs["maintenance"], defaults.defaultTabs.maintenance),
			opencodeV2: coerceBool(tabs["opencodeV2"], defaults.defaultTabs.opencodeV2),
			mergedPullRequests: coerceBool(
				tabs["mergedPullRequests"],
				defaults.defaultTabs.mergedPullRequests,
			),
			recentCommits: coerceBool(
				tabs["recentCommits"],
				defaults.defaultTabs.recentCommits,
			),
		},
		showFailedRepoCityCards: coerceBool(
			obj["showFailedRepoCityCards"],
			defaults.showFailedRepoCityCards,
		),
		autoAcceptSubsystemModelProposals: coerceBool(
			obj["autoAcceptSubsystemModelProposals"],
			defaults.autoAcceptSubsystemModelProposals,
		),
		autoAcceptSubsystemModelConfidenceThreshold: coerceConfidenceThreshold(
			obj["autoAcceptSubsystemModelConfidenceThreshold"] ??
				defaults.autoAcceptSubsystemModelConfidenceThreshold,
		),
		subsystemMaintainerModel:
			"subsystemMaintainerModel" in obj
				? coerceModelRef(obj["subsystemMaintainerModel"])
				: defaults.subsystemMaintainerModel,
		regularAuditEnabled: coerceBool(
			obj["regularAuditEnabled"],
			defaults.regularAuditEnabled,
		),
		regularAuditIntervalMinutes: coerceRegularAuditIntervalMinutes(
			obj["regularAuditIntervalMinutes"] ??
				defaults.regularAuditIntervalMinutes,
		),
		autoApplyAuditFixes: coerceBool(
			obj["autoApplyAuditFixes"],
			defaults.autoApplyAuditFixes,
		),
		typesafeApiKey:
			"typesafeApiKey" in obj
				? coerceModelRef(obj["typesafeApiKey"])
				: defaults.typesafeApiKey,
		secondOpinionProvider: coerceSecondOpinionProvider(
			obj["secondOpinionProvider"],
			defaults.secondOpinionProvider,
		),
		ollamaBaseUrl: coerceOllamaBaseUrl(obj["ollamaBaseUrl"]),
		ollamaJudgeModel:
			"ollamaJudgeModel" in obj
				? coerceModelRef(obj["ollamaJudgeModel"])
				: defaults.ollamaJudgeModel,
		maintenanceRepoKey:
			"maintenanceRepoKey" in obj
				? coerceModelRef(obj["maintenanceRepoKey"])
				: defaults.maintenanceRepoKey,
		lastActiveTabId:
			"lastActiveTabId" in obj
				? coerceModelRef(obj["lastActiveTabId"])
				: defaults.lastActiveTabId,
	};
}

export function loadViewerSettings(): ViewerSettings {
	try {
		const raw = readFileSync(STORE_PATH, "utf8");
		return normalize(JSON.parse(raw));
	} catch {
		return defaultViewerSettings();
	}
}

export function saveViewerSettings(settings: ViewerSettings): ViewerSettings {
	const normalized = normalize(settings);
	try {
		mkdirSync(join(homedir(), ".principal"), { recursive: true });
		writeFileSync(
			STORE_PATH,
			`${JSON.stringify(normalized, null, 2)}\n`,
			{ encoding: "utf8", mode: 0o600 },
		);
	} catch (err) {
		console.error(
			`[principal-studio] failed to write settings: ${(err as Error).message}`,
		);
	}
	return normalized;
}

/** Deep-merge a partial patch onto the current settings and persist. */
export function patchViewerSettings(
	current: ViewerSettings,
	patch: PartialViewerSettings,
): ViewerSettings {
	const next: ViewerSettings = {
		selectedTheme: patch.selectedTheme !== undefined && isStudioThemeName(patch.selectedTheme)
			? patch.selectedTheme
			: current.selectedTheme,
		themeOverrides: patch.themeOverrides !== undefined
			? coerceThemeOverrides(patch.themeOverrides)
			: current.themeOverrides,
		defaultTabs: {
			...current.defaultTabs,
			...(patch.defaultTabs ?? {}),
		},
		showFailedRepoCityCards:
			patch.showFailedRepoCityCards ?? current.showFailedRepoCityCards,
		autoAcceptSubsystemModelProposals:
			patch.autoAcceptSubsystemModelProposals ??
			current.autoAcceptSubsystemModelProposals,
		autoAcceptSubsystemModelConfidenceThreshold:
			patch.autoAcceptSubsystemModelConfidenceThreshold !== undefined
				? coerceConfidenceThreshold(
						patch.autoAcceptSubsystemModelConfidenceThreshold,
					)
				: current.autoAcceptSubsystemModelConfidenceThreshold,
		subsystemMaintainerModel:
			patch.subsystemMaintainerModel !== undefined
				? patch.subsystemMaintainerModel
				: current.subsystemMaintainerModel,
		regularAuditEnabled:
			patch.regularAuditEnabled ?? current.regularAuditEnabled,
		regularAuditIntervalMinutes:
			patch.regularAuditIntervalMinutes !== undefined
				? coerceRegularAuditIntervalMinutes(patch.regularAuditIntervalMinutes)
				: current.regularAuditIntervalMinutes,
		autoApplyAuditFixes:
			patch.autoApplyAuditFixes ?? current.autoApplyAuditFixes,
		typesafeApiKey:
			patch.typesafeApiKey !== undefined
				? coerceModelRef(patch.typesafeApiKey)
				: current.typesafeApiKey,
		secondOpinionProvider:
			patch.secondOpinionProvider !== undefined
				? coerceSecondOpinionProvider(
						patch.secondOpinionProvider,
						current.secondOpinionProvider,
					)
				: current.secondOpinionProvider,
		ollamaBaseUrl:
			patch.ollamaBaseUrl !== undefined
				? coerceOllamaBaseUrl(patch.ollamaBaseUrl)
				: current.ollamaBaseUrl,
		ollamaJudgeModel:
			patch.ollamaJudgeModel !== undefined
				? coerceModelRef(patch.ollamaJudgeModel)
				: current.ollamaJudgeModel,
		maintenanceRepoKey:
			patch.maintenanceRepoKey !== undefined
				? coerceModelRef(patch.maintenanceRepoKey)
				: current.maintenanceRepoKey,
		lastActiveTabId:
			patch.lastActiveTabId !== undefined
				? coerceModelRef(patch.lastActiveTabId)
				: current.lastActiveTabId,
	};
	return saveViewerSettings(next);
}

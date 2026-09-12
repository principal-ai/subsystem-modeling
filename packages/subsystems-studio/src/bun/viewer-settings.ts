/**
 * Viewer settings store — persisted flags that control host chrome (which
 * permanent tabs appear by default, etc.).
 *
 * Single JSON file at `~/.principal/principal-studio-settings.json`. Missing or
 * corrupt files fall back to defaults (all default tabs on).
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
	DefaultTabFlags,
	PartialViewerSettings,
	ViewerSettings,
} from "../shared/contract";
import { migrateLegacyStoreFile } from "./legacy-store-migrate";

const STORE_PATH = join(homedir(), ".principal", "principal-studio-settings.json");

migrateLegacyStoreFile("trail-viewer-settings.json", STORE_PATH);

const DEFAULT_TAB_FLAGS: DefaultTabFlags = {
	sessions: true,
	maintenanceSessions: true,
	trails: true,
	graphify: true,
	subsystems: true,
	opencodeV2: true,
};

/** Floor for regular audit interval (minutes). */
export const REGULAR_AUDIT_INTERVAL_MIN_MINUTES = 5;
/** Default interval when the setting is missing or invalid. */
export const REGULAR_AUDIT_INTERVAL_DEFAULT_MINUTES = 5;

export function defaultViewerSettings(): ViewerSettings {
	return {
		defaultTabs: { ...DEFAULT_TAB_FLAGS },
		autoAcceptSubsystemModelProposals: false,
		subsystemMaintainerModel: null,
		regularAuditEnabled: true,
		regularAuditIntervalMinutes: REGULAR_AUDIT_INTERVAL_DEFAULT_MINUTES,
	};
}

function coerceBool(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
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

function normalize(raw: unknown): ViewerSettings {
	const defaults = defaultViewerSettings();
	if (typeof raw !== "object" || raw === null) return defaults;
	const obj = raw as Record<string, unknown>;
	const tabs =
		typeof obj["defaultTabs"] === "object" && obj["defaultTabs"] !== null
			? (obj["defaultTabs"] as Record<string, unknown>)
			: {};
	return {
		defaultTabs: {
			sessions: coerceBool(tabs["sessions"], defaults.defaultTabs.sessions),
			maintenanceSessions: coerceBool(
				tabs["maintenanceSessions"],
				defaults.defaultTabs.maintenanceSessions,
			),
			trails: coerceBool(tabs["trails"], defaults.defaultTabs.trails),
			graphify: coerceBool(tabs["graphify"], defaults.defaultTabs.graphify),
			subsystems: coerceBool(tabs["subsystems"], defaults.defaultTabs.subsystems),
			opencodeV2: coerceBool(tabs["opencodeV2"], defaults.defaultTabs.opencodeV2),
		},
		autoAcceptSubsystemModelProposals: coerceBool(
			obj["autoAcceptSubsystemModelProposals"],
			defaults.autoAcceptSubsystemModelProposals,
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
			"utf8",
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
		defaultTabs: {
			...current.defaultTabs,
			...(patch.defaultTabs ?? {}),
		},
		autoAcceptSubsystemModelProposals:
			patch.autoAcceptSubsystemModelProposals ??
			current.autoAcceptSubsystemModelProposals,
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
	};
	return saveViewerSettings(next);
}

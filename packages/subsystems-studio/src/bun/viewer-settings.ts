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
	trails: true,
	graphify: true,
	subsystems: true,
};

export function defaultViewerSettings(): ViewerSettings {
	return { defaultTabs: { ...DEFAULT_TAB_FLAGS } };
}

function coerceBool(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
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
			trails: coerceBool(tabs["trails"], defaults.defaultTabs.trails),
			graphify: coerceBool(tabs["graphify"], defaults.defaultTabs.graphify),
			subsystems: coerceBool(tabs["subsystems"], defaults.defaultTabs.subsystems),
		},
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
	};
	return saveViewerSettings(next);
}

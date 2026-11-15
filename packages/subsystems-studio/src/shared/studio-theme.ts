import {
	defaultEditorTheme,
	defaultMarkdownTheme,
	defaultTerminalTheme,
	enterpriseTheme,
	humanCentricTheme,
	iceTangerineDarkTheme,
	iceTangerineTheme,
	matrixMinimalTheme,
	matrixTheme,
	neuralPulseTheme,
	regalTheme,
	slateGoldTheme,
	slateNeonTheme,
	slateTheme,
	terminalTheme,
	type Theme,
} from "@principal-ade/industry-theme";

/** The theme set surfaced by Studio's theme bridge. */
export const STUDIO_THEMES = {
	slateNeon: { displayName: "Slate Neon", theme: slateNeonTheme },
	slate: { displayName: "Slate", theme: slateTheme },
	slateGold: { displayName: "Slate Gold", theme: slateGoldTheme },
	matrix: { displayName: "Matrix", theme: matrixTheme },
	matrixMinimal: { displayName: "Matrix Minimal", theme: matrixMinimalTheme },
	regal: { displayName: "Regal", theme: regalTheme },
	iceTangerine: { displayName: "Ice Tangerine", theme: iceTangerineTheme },
	iceTangerineDark: { displayName: "Ice Tangerine Dark", theme: iceTangerineDarkTheme },
	enterprise: { displayName: "Enterprise", theme: enterpriseTheme },
	neuralPulse: { displayName: "Neural Pulse", theme: neuralPulseTheme },
	humanCentric: { displayName: "Human Centric", theme: humanCentricTheme },
	terminal: { displayName: "Terminal", theme: terminalTheme },
	defaultMarkdown: { displayName: "Default Markdown", theme: defaultMarkdownTheme },
	defaultEditor: { displayName: "Default Editor", theme: defaultEditorTheme },
	defaultTerminal: { displayName: "Default Terminal", theme: defaultTerminalTheme },
} satisfies Record<string, { displayName: string; theme: Theme }>;

export type StudioThemeName = keyof typeof STUDIO_THEMES;
export type StudioThemeOverrides = Record<string, unknown>;

const BLOCKED_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export function isStudioThemeName(value: unknown): value is StudioThemeName {
	return typeof value === "string" && Object.hasOwn(STUDIO_THEMES, value);
}

function deepMerge<T>(base: T, override: unknown): T {
	if (!isRecord(base) || !isRecord(override)) {
		return (override === undefined ? base : override) as T;
	}
	const merged: Record<string, unknown> = { ...base };
	for (const [key, value] of Object.entries(override)) {
		if (BLOCKED_KEYS.has(key)) continue;
		merged[key] = isRecord(value) && isRecord(base[key])
			? deepMerge(base[key], value)
			: value;
	}
	return merged as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveStudioTheme(
	name: string,
	overrides?: StudioThemeOverrides,
): Theme {
	const entry = isStudioThemeName(name) ? STUDIO_THEMES[name] : STUDIO_THEMES.slateNeon;
	return deepMerge(entry.theme, overrides ?? {});
}

/** Supported scalar properties, generated from the baseline theme structure. */
export function studioThemePropertyPaths(): string[] {
	const paths: string[] = [];
	const visit = (value: unknown, prefix = "") => {
		if (!isRecord(value)) return;
		for (const [key, child] of Object.entries(value)) {
			const path = prefix ? `${prefix}.${key}` : key;
			if (typeof child === "string" || typeof child === "number") paths.push(path);
			else if (isRecord(child)) visit(child, path);
		}
	};
	visit(slateNeonTheme);
	return paths;
}

export function getStudioThemeProperty(theme: Theme, path: string): unknown {
	let value: unknown = theme;
	for (const segment of path.split(".")) {
		if (!isRecord(value) || !Object.hasOwn(value, segment)) return undefined;
		value = value[segment];
	}
	return value;
}

export function setStudioThemeProperty(
	overrides: StudioThemeOverrides,
	path: string,
	value: string | number,
): StudioThemeOverrides {
	const next = structuredClone(overrides);
	const parts = path.split(".");
	let current = next;
	for (const part of parts.slice(0, -1)) {
		if (!isRecord(current[part])) current[part] = {};
		current = current[part] as Record<string, unknown>;
	}
	current[parts[parts.length - 1]!] = value;
	return next;
}

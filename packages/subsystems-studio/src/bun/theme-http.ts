import type { ViewerSettings } from "../shared/contract";
import {
	getStudioThemeProperty,
	isStudioThemeName,
	resolveStudioTheme,
	setStudioThemeProperty,
	STUDIO_THEMES,
	studioThemePropertyPaths,
} from "../shared/studio-theme";
import type { SettingsHttpHandlers } from "./settings-http";
import { isLoopbackRequest } from "./settings-http";

interface ThemePropertySchema {
	path: string;
	type: "string" | "number";
	description: string;
	category: string;
	example: string | number;
}

const PROPERTY_PATHS = studioThemePropertyPaths();

function schemaFor(settings: ViewerSettings, themeName: string): ThemePropertySchema[] {
	const theme = resolveStudioTheme(themeName, settings.themeOverrides[themeName]);
	return PROPERTY_PATHS.flatMap((path) => {
		const value = getStudioThemeProperty(theme, path);
		if (typeof value !== "string" && typeof value !== "number") return [];
		const type: "string" | "number" = typeof value === "string" ? "string" : "number";
		return [{
			path,
			type,
			description: `${path} theme value`,
			category: path.split(".")[0] ?? "other",
			example: value,
		}];
	});
}

function response(data: unknown, status = 200): Response {
	return Response.json(data, { status });
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
	try {
		const body: unknown = await req.json();
		return body !== null && typeof body === "object" && !Array.isArray(body)
			? body as Record<string, unknown>
			: null;
	} catch {
		return null;
	}
}

function themeNameOrDefault(value: string | null, settings: ViewerSettings): string | null {
	if (value === null) return settings.selectedTheme;
	return isStudioThemeName(value) ? value : null;
}

/** Principal MCP Bridge-compatible theme routes plus Studio's theme selector. */
export async function handleThemeRequest(
	req: Request,
	settings: SettingsHttpHandlers,
): Promise<Response | null> {
	const url = new URL(req.url);
	if (!url.pathname.startsWith("/theme/")) return null;
	if (!isLoopbackRequest(req)) {
		return response({ success: false, error: "Cross-origin theme requests are not allowed" }, 403);
	}

	if (url.pathname === "/theme/schema" && req.method === "GET") {
		const current = settings.get();
		const themeName = themeNameOrDefault(url.searchParams.get("theme"), current);
		if (!themeName) {
			return response({
				success: false,
				error: `Theme '${url.searchParams.get("theme")}' not found`,
				availableThemes: Object.entries(STUDIO_THEMES).map(([name, entry]) => ({
					name,
					displayName: entry.displayName,
				})),
			}, 404);
		}
		return response({
			success: true,
			themeName,
			themeDescription: STUDIO_THEMES[themeName as keyof typeof STUDIO_THEMES].displayName,
			schema: schemaFor(current, themeName),
			currentValues: resolveStudioTheme(themeName, current.themeOverrides[themeName]),
			availableThemes: Object.entries(STUDIO_THEMES).map(([name, entry]) => ({
				name,
				displayName: entry.displayName,
			})),
		});
	}

	if (url.pathname === "/theme/select" && req.method === "POST") {
		const body = await readJson(req);
		if (!body || !isStudioThemeName(body["themeName"])) {
			return response({
				success: false,
				error: `themeName must be one of: ${Object.keys(STUDIO_THEMES).join(", ")}`,
			}, 400);
		}
		const updated = settings.patch({ selectedTheme: body["themeName"] });
		return response({ success: true, themeName: updated.selectedTheme });
	}

	if (url.pathname === "/theme/update" && req.method === "POST") {
		const body = await readJson(req);
		const propertyPath = body?.["propertyPath"];
		const value = body?.["value"];
		const targetName = body?.["themeName"] === undefined
			? settings.get().selectedTheme
			: body["themeName"];
		if (typeof propertyPath !== "string" || !propertyPath) {
			return response({ success: false, error: "propertyPath is required" }, 400);
		}
		if (value === undefined || value === null) {
			return response({ success: false, error: "value is required" }, 400);
		}
		if (!isStudioThemeName(targetName)) {
			return response({ success: false, error: `Theme '${String(targetName)}' not found` }, 404);
		}
		if (!PROPERTY_PATHS.includes(propertyPath)) {
			return response({
				success: false,
				error: `Invalid property path: "${propertyPath}". Use GET /theme/schema to see valid property paths.`,
			}, 400);
		}

		const current = settings.get();
		const baseValue = getStudioThemeProperty(
			resolveStudioTheme(targetName, current.themeOverrides[targetName]),
			propertyPath,
		);
		const validType = typeof baseValue === "string"
			? typeof value === "string" && value.length <= 500
			: typeof baseValue === "number" && typeof value === "number" && Number.isFinite(value);
		if (!validType) {
			return response({
				success: false,
				error: `Value must be a ${typeof baseValue}${typeof baseValue === "string" ? " (max 500 characters)" : " and finite"}`,
			}, 400);
		}

		const overrides = setStudioThemeProperty(
			current.themeOverrides[targetName] ?? {},
			propertyPath,
			value as string | number,
		);
		settings.patch({
			themeOverrides: { ...current.themeOverrides, [targetName]: overrides },
		});
		const result: {
			success: true;
			updatedProperty: string;
			themeName: string;
			activeTheme?: string;
			warning?: string;
		} = { success: true, updatedProperty: propertyPath, themeName: targetName };
		if (current.selectedTheme !== targetName) {
			result.activeTheme = current.selectedTheme;
			result.warning = `Updated theme "${targetName}" is not the currently active theme. Switch to "${targetName}" to see changes.`;
		}
		return response(result);
	}

	if (url.pathname === "/theme/schema" || url.pathname === "/theme/select" || url.pathname === "/theme/update") {
		return response({ success: false, error: "Method not allowed" }, 405);
	}
	return null;
}

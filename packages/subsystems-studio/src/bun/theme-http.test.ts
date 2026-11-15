import { describe, expect, test } from "bun:test";
import type { PartialViewerSettings, ViewerSettings } from "../shared/contract";
import { defaultViewerSettings } from "./viewer-settings";
import { handleThemeRequest } from "./theme-http";

function harness() {
	let current: ViewerSettings = defaultViewerSettings();
	const settings = {
		get: () => current,
		patch: (patch: PartialViewerSettings) => {
			current = {
				...current,
				...patch,
				defaultTabs: { ...current.defaultTabs, ...(patch.defaultTabs ?? {}) },
			};
			return current;
		},
	};
	return { settings, get current() { return current; } };
}

function request(path: string, method = "GET", body?: unknown, origin?: string): Request {
	return new Request(`http://127.0.0.1:3045${path}`, {
		method,
		headers: {
			...(body === undefined ? {} : { "content-type": "application/json" }),
			...(origin ? { origin } : {}),
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
}

async function response(
	h: ReturnType<typeof harness>,
	path: string,
	method = "GET",
	body?: unknown,
	origin?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
	const result = await handleThemeRequest(request(path, method, body, origin), h.settings);
	return { status: result!.status, body: await result!.json() as Record<string, unknown> };
}

describe("theme HTTP bridge", () => {
	test("lists available themes and the current theme schema", async () => {
		const h = harness();
		const result = await response(h, "/theme/schema");
		expect(result.status).toBe(200);
		expect(result.body["success"]).toBe(true);
		expect(result.body["themeName"]).toBe("slateNeon");
		expect(result.body["availableThemes"]).toContainEqual(
			expect.objectContaining({ name: "slateNeon", displayName: "Slate Neon" }),
		);
		expect(result.body["schema"]).toContainEqual(
			expect.objectContaining({ path: "colors.primary", type: "string" }),
		);
	});

	test("selects an available theme and updates an active theme property", async () => {
		const h = harness();
		const selected = await response(h, "/theme/select", "POST", { themeName: "matrix" });
		expect(selected.body["success"]).toBe(true);
		expect(h.current.selectedTheme).toBe("matrix");

		const updated = await response(h, "/theme/update", "POST", {
			propertyPath: "colors.primary",
			value: "#123456",
		});
		expect(updated.body["success"]).toBe(true);
		expect(h.current.themeOverrides["matrix"]).toMatchObject({
			colors: { primary: "#123456" },
		});
	});

	test("updates a named inactive theme and reports the active theme", async () => {
		const h = harness();
		const result = await response(h, "/theme/update", "POST", {
			themeName: "matrix",
			propertyPath: "colors.primary",
			value: "#123456",
		});
		expect(result.body["activeTheme"]).toBe("slateNeon");
		expect(result.body["warning"]).toContain("not the currently active theme");
	});

	test("rejects unknown themes, unsupported properties, wrong types, and foreign origins", async () => {
		const h = harness();
		expect((await response(h, "/theme/select", "POST", { themeName: "unknown" })).status).toBe(400);
		expect((await response(h, "/theme/update", "POST", {
			propertyPath: "constructor.prototype.polluted",
			value: "yes",
		})).status).toBe(400);
		expect((await response(h, "/theme/update", "POST", {
			propertyPath: "colors.primary",
			value: 12,
		})).status).toBe(400);
		expect((await response(h, "/theme/schema", "GET", undefined, "https://evil.example")).status).toBe(403);
	});
});

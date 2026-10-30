/**
 * Where Studio's agent-facing HTTP bridge listens.
 *
 * Release builds use 3045. The `electrobun dev` build uses 3046 so it can run
 * next to other local dev servers that also claim 3045 (principal-ade's dev
 * event server does). `PRINCIPAL_STUDIO_HTTP_PORT` overrides both.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const STUDIO_HTTP_PORT_RELEASE = 3045;
export const STUDIO_HTTP_PORT_DEV = 3046;

/**
 * True when this host is the `electrobun dev` build. Electrobun stamps the
 * build channel into the bundle's `Resources/version.json`, and the host runs
 * from `Contents/MacOS`, so that file sits one directory up. Release builds
 * ("canary"/"stable") and any read failure report false.
 */
export function isDevBuild(): boolean {
	try {
		const raw = readFileSync(join("..", "Resources", "version.json"), "utf8");
		return (JSON.parse(raw) as { channel?: string }).channel === "dev";
	} catch {
		return false;
	}
}

export function resolveStudioHttpPort(): number {
	const override = Number(process.env["PRINCIPAL_STUDIO_HTTP_PORT"]?.trim());
	if (Number.isInteger(override) && override > 0) return override;
	return isDevBuild() ? STUDIO_HTTP_PORT_DEV : STUDIO_HTTP_PORT_RELEASE;
}

export function studioHttpBase(): string {
	return `http://127.0.0.1:${resolveStudioHttpPort()}`;
}

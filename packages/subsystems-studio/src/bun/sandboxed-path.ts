/**
 * Sandbox a repo-root-relative path to an absolute path inside a checkout.
 *
 * Step/component files are repo-root-relative by contract. A leading `/` is
 * stripped so an absolute-looking path still resolves inside the checkout —
 * without it `resolve` would treat it as absolute and the containment check
 * below would reject it. Parent references (`..`) are rejected outright — even
 * ones that would resolve back inside the root — and the containment check stays
 * as backstop so nothing outside the checkout is ever served.
 */

import { resolve } from "node:path";

export function resolveSandboxed(repoRoot: string, rawPath: string): string {
	let cleaned = rawPath;
	if (cleaned.startsWith("/")) cleaned = cleaned.slice(1);
	if (cleaned.split("/").includes("..")) {
		throw new Error(`Path must not contain ..: ${rawPath}`);
	}
	const absolute = resolve(repoRoot, cleaned);
	if (!absolute.startsWith(repoRoot)) {
		throw new Error(`Path escapes repo root: ${rawPath}`);
	}
	return absolute;
}

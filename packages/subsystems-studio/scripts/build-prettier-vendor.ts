/**
 * Bundle Prettier + its TS/estree plugins into a classic script the mainview
 * loads *outside* the Cottontail bundle.
 *
 * Why: Cottontail mangles Prettier's already-minified plugin code (a renamed
 * parameter collides with an outer function used in a closure), so the
 * in-bundle `prettier.format` throws for every declaration. esbuild's output is
 * correct. Run before `electrobun dev`/`build` — wired into the package scripts.
 *
 * Output: `src/mainview/vendor/prettier.js`, exposed on
 * `globalThis.__SUBSYSTEM_PRETTIER__` (copied into the app via
 * `build.copy` in electrobun.config.ts).
 */

import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

await build({
	entryPoints: [resolve(root, "src/mainview/prettier-vendor.ts")],
	outfile: resolve(root, "src/mainview/vendor/prettier.js"),
	bundle: true,
	format: "iife",
	globalName: "__SUBSYSTEM_PRETTIER__",
	platform: "browser",
	target: "es2020",
	minify: true,
	logLevel: "info",
});

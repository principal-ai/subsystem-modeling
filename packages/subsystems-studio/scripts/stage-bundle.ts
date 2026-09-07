#!/usr/bin/env bun
/**
 * Stage the stable build into `bundles/<os>-<arch>/subsystems-studio.app/` so the
 * bin shim can find it under a stable name. Runs as `prepack` so `npm pack`
 * and `npm publish` both pick up a fresh bundle without manual copying.
 *
 * We build on the `stable` channel (no `-canary` / `-dev` suffix in Electrobun's
 * baked-in app name). After copying we still rewrite Info.plist to the human
 * product name so the menu bar / Dock show `DISPLAY_NAME` instead of the
 * kebab-case `app.name` from electrobun.config.ts.
 */

import { cpSync, existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");

const SRC_APP = join(pkgRoot, "build", "stable-macos-arm64", "Subsystems Studio.app");
const DEST_DIR = join(pkgRoot, "bundles", "macos-arm64");
// Keep the published folder name kebab-case so bin/subsystems-studio.cjs stays stable.
const DEST_APP = join(DEST_DIR, "subsystems-studio.app");

/** Product name shown in the macOS menu bar, Dock, and app switcher. */
const DISPLAY_NAME = "Subsystems Studio";

if (!existsSync(SRC_APP)) {
	console.error(`stage-bundle: missing stable build at ${SRC_APP}`);
	console.error('stage-bundle: run `bun run build:stable` first.');
	process.exit(1);
}

if (existsSync(DEST_APP)) {
	rmSync(DEST_APP, { recursive: true, force: true });
}

cpSync(SRC_APP, DEST_APP, { recursive: true });
console.log(`stage-bundle: ${SRC_APP} -> ${DEST_APP}`);

/**
 * Compile the session warm-up worker into the staged app. electrobun's bun
 * bundler only emits the single host entry (app/bun/index.js) and leaves
 * `new Worker(new URL("./session-warmup-worker.ts", …))` unresolved — so the
 * packaged host would look for a missing sibling. Building the worker here and
 * dropping it next to index.js makes the URL resolve at runtime. (Dev mode
 * needs none of this: bun runs the `.ts` source directly.)
 */
const workerSrc = join(pkgRoot, "src", "bun", "session-warmup-worker.ts");
const workerOut = join(
	DEST_APP,
	"Contents",
	"Resources",
	"app",
	"bun",
	"session-warmup-worker.js",
);
const workerBuild = spawnSync(
	"bun",
	[
		"build",
		workerSrc,
		"--target",
		"bun",
		"--outfile",
		workerOut,
	],
	{ encoding: "utf8" },
);
if (workerBuild.status !== 0) {
	console.error(
		`stage-bundle: failed to build warm-up worker: ${workerBuild.stderr?.trim()}`,
	);
	process.exit(1);
}
console.log(`stage-bundle: warm-up worker -> ${workerOut}`);

/**
 * Set a plist key, adding it if absent (PlistBuddy's `Set` fails on a missing
 * key, so fall back to `Add`). Quote values so spaces in DISPLAY_NAME survive.
 * macOS reads the app name from CFBundleName (app menu) and
 * CFBundleDisplayName (Finder/Dock), so we set both.
 */
function setPlistString(plist: string, key: string, value: string): void {
	const quoted = `"${value.replace(/"/g, '\\"')}"`;
	const set = spawnSync(
		"/usr/libexec/PlistBuddy",
		["-c", `Set :${key} ${quoted}`, plist],
		{ encoding: "utf8" },
	);
	if (set.status === 0) return;
	const add = spawnSync(
		"/usr/libexec/PlistBuddy",
		["-c", `Add :${key} string ${quoted}`, plist],
		{ encoding: "utf8" },
	);
	if (add.status !== 0) {
		console.error(
			`stage-bundle: failed to set ${key} in Info.plist: ${add.stderr?.trim()}`,
		);
		process.exit(1);
	}
}

const PLIST = join(DEST_APP, "Contents", "Info.plist");
setPlistString(PLIST, "CFBundleName", DISPLAY_NAME);
setPlistString(PLIST, "CFBundleDisplayName", DISPLAY_NAME);
console.log(`stage-bundle: set app display name -> "${DISPLAY_NAME}"`);

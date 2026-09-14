#!/usr/bin/env bun
/**
 * Smoke: ensurePackageLayers(purl) — HEAD + dirty-hash cache under
 * ~/.principal/package-layers (or --store-root for isolated runs).
 *
 * Usage:
 *   bun scripts/package-layers-ensure-smoke.ts <purl> [--repo-root PATH] [--force]
 *                                                     [--store-root PATH]
 */

import { resolve } from "node:path";
import { ensurePackageLayers, readEnsuredPackageLayers } from "../src/bun/package-layer-store";

function usage(): never {
	console.error(`Usage: bun scripts/package-layers-ensure-smoke.ts <purl> [options]

Options:
  --repo-root PATH   Local checkout (else Alexandria lookup)
  --store-root PATH  Cache root (default ~/.principal/package-layers)
  --force            Rebuild even on cache hit
  --help
`);
	process.exit(2);
}

function parseArgs(argv: string[]) {
	let purl: string | undefined;
	let repoRoot: string | undefined;
	let storeRoot: string | undefined;
	let force = false;

	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]!;
		if (a === "--help" || a === "-h") usage();
		if (a === "--force") {
			force = true;
			continue;
		}
		if (a === "--repo-root" && argv[i + 1]) {
			repoRoot = resolve(argv[++i]!);
			continue;
		}
		if (a === "--store-root" && argv[i + 1]) {
			storeRoot = resolve(argv[++i]!);
			continue;
		}
		if (a.startsWith("-")) {
			console.error(`unknown option: ${a}`);
			usage();
		}
		if (!purl) purl = a;
		else usage();
	}
	if (!purl) usage();
	return { purl, repoRoot, storeRoot, force };
}

const opts = parseArgs(process.argv.slice(2));

console.log(
	JSON.stringify(
		{
			event: "package-layers-ensure.start",
			purl: opts.purl,
			repoRoot: opts.repoRoot ?? "(alexandria)",
			storeRoot: opts.storeRoot ?? "~/.principal/package-layers",
			force: opts.force,
		},
		null,
		2,
	),
);

const result = await ensurePackageLayers({
	purl: opts.purl,
	repoRoot: opts.repoRoot,
	storeRoot: opts.storeRoot,
	force: opts.force,
});

if (!result.ok) {
	console.error(
		JSON.stringify({ event: "package-layers-ensure.fail", ...result }, null, 2),
	);
	process.exit(1);
}

const slice = readEnsuredPackageLayers(result.packagesJsonPath);

console.log(
	JSON.stringify(
		{
			event: "package-layers-ensure.ok",
			status: result.status,
			purl: result.purl,
			headSha: result.headSha,
			dirtyHash: result.dirtyHash,
			slotKey: result.slotKey,
			packagesJsonPath: result.packagesJsonPath,
			packageCount: result.packageCount,
			isMonorepo: result.isMonorepo,
			rootPackageName: slice.summary.rootPackageName,
			workspacePackages: slice.summary.workspacePackages,
			durationMs: Math.round(result.durationMs),
		},
		null,
		2,
	),
);

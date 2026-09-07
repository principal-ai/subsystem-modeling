#!/usr/bin/env bun
/**
 * Smoke: ensureGraphifyGraph(purl) — HEAD + dirty-hash cache under
 * ~/.principal/graphify-graphs (or --store-root for isolated runs).
 *
 * Usage:
 *   bun scripts/graphify-ensure-smoke.ts <purl> [--repo-root PATH] [--force] [--bin PATH]
 *                                            [--store-root PATH] [--same-file-refs] [--inline-params]
 */

import { resolve } from "node:path";
import { resolveGraphifyBin } from "../src/bun/graphify-runner";
import { ensureGraphifyGraph } from "../src/bun/graphify-store";

function usage(): never {
	console.error(`Usage: bun scripts/graphify-ensure-smoke.ts <purl> [options]

Options:
  --repo-root PATH   Local checkout (else Alexandria lookup)
  --store-root PATH  Cache root (default ~/.principal/graphify-graphs)
  --force            Rebuild even on cache hit
  --bin PATH         Explicit graphify binary
  --same-file-refs   Pass --same-file-refs to graphify extract
  --inline-params    Pass --inline-params (anonymous-object param markers)
  --help
`);
	process.exit(2);
}

function parseArgs(argv: string[]) {
	let purl: string | undefined;
	let repoRoot: string | undefined;
	let storeRoot: string | undefined;
	let bin: string | undefined;
	let force = false;
	let sameFileRefs = false;
	let inlineParams = false;

	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]!;
		if (a === "--help" || a === "-h") usage();
		if (a === "--force") {
			force = true;
			continue;
		}
		if (a === "--same-file-refs") {
			sameFileRefs = true;
			continue;
		}
		if (a === "--inline-params") {
			inlineParams = true;
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
		if (a === "--bin" && argv[i + 1]) {
			bin = argv[++i];
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
	return { purl, repoRoot, storeRoot, bin, force, sameFileRefs, inlineParams };
}

const opts = parseArgs(process.argv.slice(2));

console.log(
	JSON.stringify(
		{
			event: "graphify-ensure.start",
			purl: opts.purl,
			repoRoot: opts.repoRoot ?? "(alexandria)",
			storeRoot: opts.storeRoot ?? "~/.principal/graphify-graphs",
			bin: resolveGraphifyBin(opts.bin) ?? "(not found)",
			force: opts.force,
			sameFileRefs: opts.sameFileRefs,
			inlineParams: opts.inlineParams,
		},
		null,
		2,
	),
);

const extraArgs: string[] = [];
	if (opts.sameFileRefs) extraArgs.push("--same-file-refs");
	if (opts.inlineParams) extraArgs.push("--inline-params");

const result = await ensureGraphifyGraph({
	purl: opts.purl,
	repoRoot: opts.repoRoot,
	storeRoot: opts.storeRoot,
	bin: opts.bin,
	force: opts.force,
	extraArgs: extraArgs.length ? extraArgs : undefined,
});

if (!result.ok) {
	console.error(JSON.stringify({ event: "graphify-ensure.fail", ...result }, null, 2));
	process.exit(1);
}

console.log(
	JSON.stringify(
		{
			event: "graphify-ensure.ok",
			status: result.status,
			purl: result.purl,
			headSha: result.headSha,
			dirtyHash: result.dirtyHash,
			slotKey: result.slotKey,
			graphJsonPath: result.graphJsonPath,
			nodeCount: result.nodeCount,
			edgeCount: result.edgeCount,
			durationMs: Math.round(result.durationMs),
		},
		null,
		2,
	),
);

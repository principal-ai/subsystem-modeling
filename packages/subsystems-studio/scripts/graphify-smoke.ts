#!/usr/bin/env bun
/**
 * Smoke: trigger graphify extract programmatically and verify graph.json.
 *
 * Usage:
 *   bun scripts/graphify-smoke.ts <repoRoot> [--out DIR] [--keep] [--bin PATH]
 *
 * Resolves `graphify` from PATH, then `~/.local/bin/graphify` (uv/pipx).
 * Pass `--bin` only to point at a non-standard binary for local testing.
 *
 * Exit 0 on a parseable graph.json with nodes[]; non-zero otherwise.
 */

import { rmSync } from "node:fs";
import { resolve } from "node:path";
import {
	promoteGraphJson,
	resolveGraphifyBin,
	runGraphifyExtract,
} from "../src/bun/graphify-runner";

function usage(): never {
	console.error(`Usage: bun scripts/graphify-smoke.ts <repoRoot> [options]

Options:
  --out DIR     Parent for graphify-out/ (default: temp dir)
  --keep        Keep temp outDir on success (default: delete temp)
  --bin PATH    Explicit graphify binary (else PATH, then ~/.local/bin/graphify)
  --promote TO  Copy graph.json to TO after a successful extract
  --help        Show this help

Install (if missing):
  uv tool install graphifyy
`);
	process.exit(2);
}

function parseArgs(argv: string[]) {
	let repoRoot: string | undefined;
	let outDir: string | undefined;
	let bin: string | undefined;
	let promoteTo: string | undefined;
	let keep = false;

	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]!;
		if (a === "--help" || a === "-h") usage();
		if (a === "--keep") {
			keep = true;
			continue;
		}
		if (a === "--out" && argv[i + 1]) {
			outDir = argv[++i];
			continue;
		}
		if (a.startsWith("--out=")) {
			outDir = a.slice("--out=".length);
			continue;
		}
		if (a === "--bin" && argv[i + 1]) {
			bin = argv[++i];
			continue;
		}
		if (a.startsWith("--bin=")) {
			bin = a.slice("--bin=".length);
			continue;
		}
		if (a === "--promote" && argv[i + 1]) {
			promoteTo = argv[++i];
			continue;
		}
		if (a.startsWith("--promote=")) {
			promoteTo = a.slice("--promote=".length);
			continue;
		}
		if (a.startsWith("-")) {
			console.error(`unknown option: ${a}`);
			usage();
		}
		if (!repoRoot) repoRoot = a;
		else {
			console.error(`unexpected arg: ${a}`);
			usage();
		}
	}

	if (!repoRoot) usage();
	return {
		repoRoot: resolve(repoRoot),
		outDir: outDir ? resolve(outDir) : undefined,
		bin,
		promoteTo: promoteTo ? resolve(promoteTo) : undefined,
		keep,
	};
}

const opts = parseArgs(process.argv.slice(2));

console.log(
	JSON.stringify(
		{
			event: "graphify-smoke.start",
			repoRoot: opts.repoRoot,
			outDir: opts.outDir ?? "(temp)",
			bin: resolveGraphifyBin(opts.bin) ?? opts.bin ?? "(not found)",
		},
		null,
		2,
	),
);

const result = await runGraphifyExtract({
	repoRoot: opts.repoRoot,
	outDir: opts.outDir,
	bin: opts.bin,
	codeOnly: true,
	cleanupTempOnFailure: true,
});

if (!result.ok) {
	console.error(
		JSON.stringify(
			{
				event: "graphify-smoke.fail",
				error: result.error,
				exitCode: result.exitCode,
				durationMs: Math.round(result.durationMs),
				stderrTail: result.stderr?.trim().split("\n").slice(-20).join("\n"),
			},
			null,
			2,
		),
	);
	process.exit(1);
}

let promoted: string | undefined;
if (opts.promoteTo) {
	promoted = promoteGraphJson(result.outDir, opts.promoteTo);
}

const dropTemp = result.usedTempOut && !opts.keep;
if (dropTemp) {
	try {
		rmSync(result.outDir, { recursive: true, force: true });
	} catch {
		/* ignore */
	}
}

console.log(
	JSON.stringify(
		{
			event: "graphify-smoke.ok",
			repoRoot: result.repoRoot,
			graphJsonPath: promoted ?? result.graphJsonPath,
			promoted: promoted ?? null,
			nodeCount: result.nodeCount,
			edgeCount: result.edgeCount,
			builtAtCommit: result.builtAtCommit ?? null,
			durationMs: Math.round(result.durationMs),
			outDir: dropTemp ? null : result.outDir,
		},
		null,
		2,
	),
);

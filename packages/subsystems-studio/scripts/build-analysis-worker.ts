#!/usr/bin/env bun
/**
 * Bundle the analysis worker as a standalone file. Electrobun builds a single
 * `bun` entry, so the worker is built here and staged into `app/bun/` via the
 * `copy` map in electrobun.config.ts. It reads the tree-sitter assets from that
 * same directory, exactly like the host bundle.
 */
import { rm } from "node:fs/promises";
import { join } from "node:path";

const packageRoot = join(import.meta.dir, "..");
const outdir = join(packageRoot, "artifacts", "analysis-worker");
await rm(outdir, { recursive: true, force: true });

const result = await Bun.build({
	entrypoints: [join(packageRoot, "src/bun/construct-timeline-worker.ts")],
	outdir,
	target: "bun",
	sourcemap: "none",
});
if (!result.success) {
	for (const log of result.logs) console.error(log);
	process.exit(1);
}
console.log(`analysis worker -> ${join(outdir, "construct-timeline-worker.js")}`);

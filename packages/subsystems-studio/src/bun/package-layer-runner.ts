/**
 * Discover package layers for a local checkout via codebase-composition.
 *
 * Builds a minimal FileTree (path list only) and runs
 * PackageLayerModule.discoverPackages with an on-disk file reader.
 */

import { promises as fs, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	PackageLayerModule,
	createPackageSummary,
	type FileTree,
	type PackagesSliceData,
} from "@principal-ai/codebase-composition";

/** Minimal FileTree shape PackageLayerModule reads (`allFiles[].path`). */
export interface PackageDiscoveryFileTree {
	allFiles: Array<{ path: string }>;
}

export interface RunPackageLayerDiscoverOptions {
	/** Absolute path to the repo root to scan. */
	repoRoot: string;
	/**
	 * Optional pre-built file list (relative paths). When omitted, walks the
	 * tree skipping `.git`, `node_modules`, and other dot-directories.
	 */
	files?: Array<{ path: string }>;
}

export interface RunPackageLayerDiscoverResult {
	ok: true;
	repoRoot: string;
	data: PackagesSliceData;
	packageCount: number;
	durationMs: number;
}

export interface RunPackageLayerDiscoverFailure {
	ok: false;
	error: string;
	durationMs: number;
}

export type PackageLayerDiscoverOutcome =
	| RunPackageLayerDiscoverResult
	| RunPackageLayerDiscoverFailure;

const SKIP_DIR_NAMES = new Set([
	".git",
	"node_modules",
	"dist",
	"build",
	".next",
	".turbo",
	"coverage",
	"__pycache__",
	"target",
	"vendor",
]);

/**
 * Walk a repo for relative file paths (same skip rules as Studio getFileTree).
 */
export async function walkRepoFiles(
	root: string,
): Promise<Array<{ path: string }>> {
	const out: Array<{ path: string }> = [];
	async function walk(dir: string, rel: string): Promise<void> {
		let entries;
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (SKIP_DIR_NAMES.has(entry.name)) continue;
			if (entry.name.startsWith(".")) continue;
			const full = join(dir, entry.name);
			const relPath = rel ? `${rel}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				await walk(full, relPath);
			} else if (entry.isFile()) {
				out.push({ path: relPath });
			}
		}
	}
	await walk(root, "");
	return out;
}

export function buildPackageDiscoveryFileTree(
	files: Array<{ path: string }>,
): PackageDiscoveryFileTree {
	return { allFiles: files.map((f) => ({ path: f.path })) };
}

/**
 * Discover packages under `repoRoot` and return a PackagesSliceData payload.
 */
export async function runPackageLayerDiscover(
	opts: RunPackageLayerDiscoverOptions,
): Promise<PackageLayerDiscoverOutcome> {
	const started = performance.now();
	const repoRoot = opts.repoRoot.trim();
	if (!repoRoot) {
		return {
			ok: false,
			error: "repoRoot is required",
			durationMs: performance.now() - started,
		};
	}

	try {
		const files = opts.files ?? (await walkRepoFiles(repoRoot));
		const fileTree = buildPackageDiscoveryFileTree(files);
		const module = new PackageLayerModule();
		const packages = await module.discoverPackages(
			fileTree as unknown as FileTree,
			async (relPath) => {
				const abs = join(repoRoot, relPath);
				return fs.readFile(abs, "utf8");
			},
		);
		const summary = createPackageSummary(packages);
		const data: PackagesSliceData = { packages, summary };
		return {
			ok: true,
			repoRoot,
			data,
			packageCount: packages.length,
			durationMs: performance.now() - started,
		};
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
			durationMs: performance.now() - started,
		};
	}
}

/** Load a cached packages.json artifact. */
export function loadPackagesSlice(path: string): PackagesSliceData {
	const raw = JSON.parse(readFileSync(path, "utf8")) as PackagesSliceData;
	if (!raw || !Array.isArray(raw.packages) || !raw.summary) {
		throw new Error(`invalid packages slice at ${path}`);
	}
	return raw;
}

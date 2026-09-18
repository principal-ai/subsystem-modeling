/**
 * PURL + HEAD (+ dirty fingerprint) cache for codebase-composition package layers.
 *
 * Layout:
 *   ~/.principal/package-layers/
 *     _index.json
 *     <sanitized-purl-key>/
 *       <headSha>/                    # clean working tree
 *         packages.json
 *         meta.json
 *       <headSha>+<dirtyHash>/        # dirty working tree
 *         packages.json
 *         meta.json
 *
 * Cache key mirrors graphify: purlRepoKey @ headSha[+dirtyHash].
 * Reuses git / dirty / purl helpers from graphify-store.
 */

import { existsSync, readFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { PackagesSliceData } from "@principal-ai/codebase-composition";
import { loadAlexandriaRepos } from "./alexandria";
import {
	cacheSlotKey,
	dirtyFingerprint,
	gitHeadSha,
	resolveRepoRootForPurl,
	sanitizePurlDirName,
} from "./graphify-store";
import {
	loadPackagesSlice,
	runPackageLayerDiscover,
} from "./package-layer-runner";
import { purlRepoKey } from "./subsystem-model-store";
import type { PackageLayerRepoEntry } from "../shared/contract";

const ROOT = join(homedir(), ".principal", "package-layers");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PackageLayerMeta {
	purl: string;
	/** Repo-key form (fragment stripped). */
	purlKey: string;
	headSha: string;
	/** Null when the working tree matched HEAD at build time. */
	dirtyHash: string | null;
	/** Directory name under the purl folder (`headSha` or `headSha+dirtyHash`). */
	slotKey: string;
	repoRoot: string;
	builtAt: string;
	packageCount: number;
	isMonorepo: boolean;
	rootPackageName?: string;
}

export interface PackageLayerIndexEntry {
	purl: string;
	purlKey: string;
	/** Filesystem directory name under ROOT. */
	dirName: string;
	headSha: string;
	dirtyHash: string | null;
	slotKey: string;
	repoRoot: string;
	builtAt: string;
	packageCount: number;
	isMonorepo: boolean;
	rootPackageName?: string;
	/** Absolute path to packages.json. */
	packagesJsonPath: string;
}

interface IndexFile {
	version: number;
	entries: PackageLayerIndexEntry[];
}

export type EnsurePackageLayersStatus = "hit" | "built" | "building";

export interface EnsurePackageLayersOk {
	ok: true;
	status: EnsurePackageLayersStatus;
	purl: string;
	purlKey: string;
	headSha: string;
	dirtyHash: string | null;
	slotKey: string;
	repoRoot: string;
	packagesJsonPath: string;
	meta: PackageLayerMeta;
	packageCount: number;
	isMonorepo: boolean;
	durationMs: number;
}

export interface EnsurePackageLayersFail {
	ok: false;
	error: string;
	purl?: string;
	durationMs: number;
}

export type EnsurePackageLayersResult =
	| EnsurePackageLayersOk
	| EnsurePackageLayersFail;

export interface EnsurePackageLayersOptions {
	/** Package URL identifying the repo (`pkg:github/owner/name` or with #fragment). */
	purl: string;
	/** Skip Alexandria and use this local root. */
	repoRoot?: string;
	/** Rebuild even when a cache slot exists. */
	force?: boolean;
	/** Override store root (tests). */
	storeRoot?: string;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

export function packageLayerStoreRoot(override?: string): string {
	return override ?? ROOT;
}

export function packageLayerCacheSlotDir(
	purlKey: string,
	headSha: string,
	dirtyHash: string | null = null,
	storeRoot?: string,
): string {
	return join(
		packageLayerStoreRoot(storeRoot),
		sanitizePurlDirName(purlKey),
		cacheSlotKey(headSha, dirtyHash),
	);
}

export function cachedPackagesJsonPath(
	purlKey: string,
	headSha: string,
	dirtyHash: string | null = null,
	storeRoot?: string,
): string {
	return join(
		packageLayerCacheSlotDir(purlKey, headSha, dirtyHash, storeRoot),
		"packages.json",
	);
}

export function cachedPackageLayerMetaPath(
	purlKey: string,
	headSha: string,
	dirtyHash: string | null = null,
	storeRoot?: string,
): string {
	return join(
		packageLayerCacheSlotDir(purlKey, headSha, dirtyHash, storeRoot),
		"meta.json",
	);
}

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

async function readIndex(storeRoot: string): Promise<IndexFile> {
	try {
		const raw = await fs.readFile(join(storeRoot, "_index.json"), "utf8");
		const data = JSON.parse(raw) as IndexFile;
		if (!data || !Array.isArray(data.entries)) return { version: 1, entries: [] };
		return { version: data.version ?? 1, entries: data.entries };
	} catch {
		return { version: 1, entries: [] };
	}
}

async function writeIndex(storeRoot: string, index: IndexFile): Promise<void> {
	await fs.mkdir(storeRoot, { recursive: true });
	const tmp = join(storeRoot, `._index.${process.pid}.tmp`);
	await fs.writeFile(tmp, JSON.stringify(index, null, 2), "utf8");
	await fs.rename(tmp, join(storeRoot, "_index.json"));
}

function indexEntryKey(
	entry: Pick<PackageLayerIndexEntry, "dirName" | "slotKey">,
): string {
	return `${entry.dirName}@${entry.slotKey}`;
}

async function upsertIndexEntry(
	storeRoot: string,
	entry: PackageLayerIndexEntry,
): Promise<void> {
	const index = await readIndex(storeRoot);
	const key = indexEntryKey(entry);
	index.entries = index.entries.filter((e) => indexEntryKey(e) !== key);
	index.entries.unshift(entry);
	await writeIndex(storeRoot, index);
}

/** Drop sibling dirty slots for the same HEAD; keep the clean slot and `keepSlotKey`. */
async function pruneOldDirtySlots(
	storeRoot: string,
	purlKey: string,
	headSha: string,
	keepSlotKey: string,
): Promise<void> {
	const purlDir = join(storeRoot, sanitizePurlDirName(purlKey));
	let names: string[];
	try {
		names = await fs.readdir(purlDir);
	} catch {
		return;
	}
	const prefix = `${headSha}+`;
	const index = await readIndex(storeRoot);
	const dirName = sanitizePurlDirName(purlKey);
	let indexChanged = false;
	for (const name of names) {
		if (!name.startsWith(prefix) || name === keepSlotKey) continue;
		try {
			await fs.rm(join(purlDir, name), { recursive: true, force: true });
		} catch {
			/* ignore */
		}
		const before = index.entries.length;
		index.entries = index.entries.filter(
			(e) => !(e.dirName === dirName && e.slotKey === name),
		);
		if (index.entries.length !== before) indexChanged = true;
	}
	if (indexChanged) await writeIndex(storeRoot, index);
}

// ---------------------------------------------------------------------------
// In-flight locks (one discover per purl@slot)
// ---------------------------------------------------------------------------

const inflight = new Map<string, Promise<EnsurePackageLayersResult>>();

function inflightKey(
	storeRoot: string,
	purlKey: string,
	slotKey: string,
): string {
	return `${storeRoot}::${sanitizePurlDirName(purlKey)}@${slotKey}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function listPackageLayers(
	storeRoot?: string,
): Promise<PackageLayerIndexEntry[]> {
	const root = packageLayerStoreRoot(storeRoot);
	const index = await readIndex(root);
	return index.entries;
}

function packageRepoEntryScore(entry: PackageLayerRepoEntry): number {
	let score = 0;
	if (entry.status === "ready") score += 100;
	else if (entry.status === "building") score += 75;
	else if (entry.cached) score += 10;
	if (existsSync(entry.path)) score += 5;
	score -= Math.min(entry.path.length, 500) / 1000;
	return score;
}

/**
 * Alexandria GitHub repos crossed with the package-layer cache for the current
 * working tree. Only `pkg:github/…` identities; one row per purl (best checkout
 * wins when Alexandria has duplicates).
 */
export async function listPackageLayerRepos(
	storeRoot?: string,
	buildingPurls?: ReadonlySet<string>,
): Promise<PackageLayerRepoEntry[]> {
	const root = packageLayerStoreRoot(storeRoot);
	const index = await readIndex(root);
	const cacheByPurl = new Map<string, PackageLayerIndexEntry[]>();
	for (const entry of index.entries) {
		const list = cacheByPurl.get(entry.purlKey) ?? [];
		list.push(entry);
		cacheByPurl.set(entry.purlKey, list);
	}

	const bestByPurl = new Map<string, PackageLayerRepoEntry>();

	for (const [, info] of loadAlexandriaRepos()) {
		const owner = info.owner?.trim();
		const name = info.repo?.trim();
		if (!owner || !name) continue;
		if (!existsSync(info.root)) continue;

		const purlKey = purlRepoKey(`pkg:github/${owner}/${name}`);
		if (!purlKey) continue;

		const headSha = gitHeadSha(info.root);
		if (!headSha) continue;

		const dirtyHash = dirtyFingerprint(info.root);
		const slotKey = cacheSlotKey(headSha, dirtyHash);

		const want = purlKey.toLowerCase();
		const candidates =
			cacheByPurl.get(purlKey) ??
			[...cacheByPurl.entries()].find(([k]) => k.toLowerCase() === want)?.[1] ??
			[];

		const currentPath = cachedPackagesJsonPath(purlKey, headSha, dirtyHash, root);
		const currentMetaPath = cachedPackageLayerMetaPath(
			purlKey,
			headSha,
			dirtyHash,
			root,
		);
		let cached: PackageLayerRepoEntry["cached"] = null;
		if (existsSync(currentPath) && existsSync(currentMetaPath)) {
			try {
				const meta = JSON.parse(
					await fs.readFile(currentMetaPath, "utf8"),
				) as PackageLayerMeta;
				cached = {
					slotKey,
					packageCount: meta.packageCount,
					isMonorepo: meta.isMonorepo,
					rootPackageName: meta.rootPackageName,
					builtAt: meta.builtAt,
					packagesJsonPath: currentPath,
					matchesCurrent: true,
				};
			} catch {
				/* treat as missing */
			}
		} else if (candidates.length > 0) {
			const latest = candidates[0]!;
			cached = {
				slotKey: latest.slotKey,
				packageCount: latest.packageCount,
				isMonorepo: latest.isMonorepo,
				rootPackageName: latest.rootPackageName,
				builtAt: latest.builtAt,
				packagesJsonPath: latest.packagesJsonPath,
				matchesCurrent: false,
			};
		}

		const entry: PackageLayerRepoEntry = {
			path: info.root,
			owner,
			name,
			purl: purlKey,
			headSha,
			dirtyHash,
			slotKey,
			status: buildingPurls?.has(purlKey)
				? "building"
				: cached?.matchesCurrent
					? "ready"
					: "missing",
			cached,
		};

		const prev = bestByPurl.get(want);
		if (!prev || packageRepoEntryScore(entry) > packageRepoEntryScore(prev)) {
			bestByPurl.set(want, entry);
		}
	}

	return [...bestByPurl.values()].sort((a, b) => {
		const an = `${a.owner}/${a.name}`.toLowerCase();
		const bn = `${b.owner}/${b.name}`.toLowerCase();
		return an.localeCompare(bn);
	});
}

export type CurrentPackageLayerSlot = {
	purlKey: string;
	repoRoot: string;
	headSha: string;
	dirtyHash: string | null;
	slotKey: string;
	/** Exact-slot artifact when present; null means current checkout has no cache yet. */
	cached: { path: string; meta: PackageLayerMeta } | null;
};

/**
 * Live checkout identity + exact HEAD(+dirty) cache slot for a purl.
 * Returns null when there is no resolvable local git root / HEAD.
 */
export function resolveCurrentPackageLayerSlot(
	purl: string,
	opts?: { repoRoot?: string; storeRoot?: string },
): CurrentPackageLayerSlot | null {
	const key = purlRepoKey(purl);
	if (!key) return null;
	const root = packageLayerStoreRoot(opts?.storeRoot);
	const repoRoot = opts?.repoRoot?.trim() || resolveRepoRootForPurl(key);
	if (!repoRoot || !existsSync(repoRoot)) return null;
	const headSha = gitHeadSha(repoRoot);
	if (!headSha) return null;
	const dirtyHash = dirtyFingerprint(repoRoot);
	const slotKey = cacheSlotKey(headSha, dirtyHash);
	const path = cachedPackagesJsonPath(key, headSha, dirtyHash, root);
	const metaPath = cachedPackageLayerMetaPath(key, headSha, dirtyHash, root);
	let cached: CurrentPackageLayerSlot["cached"] = null;
	if (existsSync(path) && existsSync(metaPath)) {
		try {
			const meta = JSON.parse(readFileSync(metaPath, "utf8")) as PackageLayerMeta;
			cached = { path, meta };
		} catch {
			/* treat as missing */
		}
	}
	return { purlKey: key, repoRoot, headSha, dirtyHash, slotKey, cached };
}

/**
 * Resolve the exact HEAD(+dirty) cached packages slice for a purl, or null.
 */
export async function getCachedPackageLayers(
	purl: string,
	opts?: {
		headSha?: string;
		dirtyHash?: string | null;
		repoRoot?: string;
		storeRoot?: string;
	},
): Promise<{ path: string; meta: PackageLayerMeta; data?: PackagesSliceData } | null> {
	const key = purlRepoKey(purl);
	if (!key) return null;
	const root = packageLayerStoreRoot(opts?.storeRoot);
	const repoRoot = opts?.repoRoot ?? resolveRepoRootForPurl(purl);

	let headSha = opts?.headSha;
	if (!headSha && repoRoot) {
		headSha = gitHeadSha(repoRoot) ?? undefined;
	}
	if (!headSha) return null;

	let dirtyHash: string | null;
	if (opts && "dirtyHash" in opts) {
		dirtyHash = opts.dirtyHash ?? null;
	} else if (repoRoot) {
		dirtyHash = dirtyFingerprint(repoRoot);
	} else {
		dirtyHash = null;
	}

	const path = cachedPackagesJsonPath(key, headSha, dirtyHash, root);
	const metaPath = cachedPackageLayerMetaPath(key, headSha, dirtyHash, root);
	if (!existsSync(path) || !existsSync(metaPath)) return null;
	try {
		const meta = JSON.parse(
			await fs.readFile(metaPath, "utf8"),
		) as PackageLayerMeta;
		return { path, meta };
	} catch {
		return null;
	}
}

/** Load the cached packages document for a successful ensure / get result. */
export function readEnsuredPackageLayers(path: string): PackagesSliceData {
	return loadPackagesSlice(path);
}

/**
 * Ensure package layers exist for this purl at the current HEAD
 * (and dirty fingerprint when the working tree differs from HEAD).
 * Cache hit returns immediately; miss runs discoverPackages and writes the slot.
 */
export async function ensurePackageLayers(
	opts: EnsurePackageLayersOptions,
): Promise<EnsurePackageLayersResult> {
	const started = performance.now();
	const purl = opts.purl.trim();
	const key = purlRepoKey(purl);
	if (!key) {
		return {
			ok: false,
			error: "invalid or empty purl",
			durationMs: performance.now() - started,
		};
	}

	const storeRoot = packageLayerStoreRoot(opts.storeRoot);
	const repoRoot = opts.repoRoot?.trim() || resolveRepoRootForPurl(purl);
	if (!repoRoot) {
		return {
			ok: false,
			error: `no local checkout for ${key} — register the repo in Alexandria or pass repoRoot`,
			purl: key,
			durationMs: performance.now() - started,
		};
	}
	if (!existsSync(repoRoot)) {
		return {
			ok: false,
			error: `repo root not found: ${repoRoot}`,
			purl: key,
			durationMs: performance.now() - started,
		};
	}

	const headSha = gitHeadSha(repoRoot);
	if (!headSha) {
		return {
			ok: false,
			error: `could not read git HEAD in ${repoRoot}`,
			purl: key,
			durationMs: performance.now() - started,
		};
	}

	const dirtyHash = dirtyFingerprint(repoRoot);
	const slotKey = cacheSlotKey(headSha, dirtyHash);

	const lockKey = inflightKey(storeRoot, key, slotKey);
	const existing = inflight.get(lockKey);
	if (existing) {
		return existing;
	}

	const work = doEnsure({
		purl: key,
		purlKey: key,
		repoRoot,
		headSha,
		dirtyHash,
		slotKey,
		storeRoot,
		force: opts.force,
		started,
	});
	inflight.set(lockKey, work);
	try {
		return await work;
	} finally {
		inflight.delete(lockKey);
	}
}

async function doEnsure(ctx: {
	purl: string;
	purlKey: string;
	repoRoot: string;
	headSha: string;
	dirtyHash: string | null;
	slotKey: string;
	storeRoot: string;
	force?: boolean;
	started: number;
}): Promise<EnsurePackageLayersResult> {
	const packagesPath = cachedPackagesJsonPath(
		ctx.purlKey,
		ctx.headSha,
		ctx.dirtyHash,
		ctx.storeRoot,
	);
	const metaPath = cachedPackageLayerMetaPath(
		ctx.purlKey,
		ctx.headSha,
		ctx.dirtyHash,
		ctx.storeRoot,
	);

	if (!ctx.force && existsSync(packagesPath) && existsSync(metaPath)) {
		try {
			const meta = JSON.parse(
				await fs.readFile(metaPath, "utf8"),
			) as PackageLayerMeta;
			loadPackagesSlice(packagesPath);
			return {
				ok: true,
				status: "hit",
				purl: ctx.purl,
				purlKey: ctx.purlKey,
				headSha: ctx.headSha,
				dirtyHash: ctx.dirtyHash,
				slotKey: ctx.slotKey,
				repoRoot: ctx.repoRoot,
				packagesJsonPath: packagesPath,
				meta,
				packageCount: meta.packageCount,
				isMonorepo: meta.isMonorepo,
				durationMs: performance.now() - ctx.started,
			};
		} catch {
			// fall through and rebuild
		}
	}

	const discover = await runPackageLayerDiscover({ repoRoot: ctx.repoRoot });
	if (!discover.ok) {
		return {
			ok: false,
			error: discover.error,
			purl: ctx.purl,
			durationMs: performance.now() - ctx.started,
		};
	}

	try {
		await fs.mkdir(
			packageLayerCacheSlotDir(
				ctx.purlKey,
				ctx.headSha,
				ctx.dirtyHash,
				ctx.storeRoot,
			),
			{ recursive: true },
		);
		await fs.writeFile(
			packagesPath,
			JSON.stringify(discover.data, null, 2),
			"utf8",
		);

		const meta: PackageLayerMeta = {
			purl: ctx.purl,
			purlKey: ctx.purlKey,
			headSha: ctx.headSha,
			dirtyHash: ctx.dirtyHash,
			slotKey: ctx.slotKey,
			repoRoot: ctx.repoRoot,
			builtAt: new Date().toISOString(),
			packageCount: discover.packageCount,
			isMonorepo: discover.data.summary.isMonorepo,
			rootPackageName: discover.data.summary.rootPackageName,
		};
		await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");

		const dirName = sanitizePurlDirName(ctx.purlKey);
		await upsertIndexEntry(ctx.storeRoot, {
			purl: ctx.purl,
			purlKey: ctx.purlKey,
			dirName,
			headSha: ctx.headSha,
			dirtyHash: ctx.dirtyHash,
			slotKey: ctx.slotKey,
			repoRoot: ctx.repoRoot,
			builtAt: meta.builtAt,
			packageCount: meta.packageCount,
			isMonorepo: meta.isMonorepo,
			rootPackageName: meta.rootPackageName,
			packagesJsonPath: packagesPath,
		});

		if (ctx.dirtyHash) {
			await pruneOldDirtySlots(
				ctx.storeRoot,
				ctx.purlKey,
				ctx.headSha,
				ctx.slotKey,
			);
		}

		return {
			ok: true,
			status: "built",
			purl: ctx.purl,
			purlKey: ctx.purlKey,
			headSha: ctx.headSha,
			dirtyHash: ctx.dirtyHash,
			slotKey: ctx.slotKey,
			repoRoot: ctx.repoRoot,
			packagesJsonPath: packagesPath,
			meta,
			packageCount: meta.packageCount,
			isMonorepo: meta.isMonorepo,
			durationMs: performance.now() - ctx.started,
		};
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
			purl: ctx.purl,
			durationMs: performance.now() - ctx.started,
		};
	}
}

/**
 * Ensure each distinct component purl has package layers for the **current**
 * HEAD (+ dirty fingerprint). Soft-fails per purl.
 */
export async function ensureCurrentPackageCachesForModel(
	graph: {
		components: Array<{
			purl?: string;
			proposed?: boolean;
			construct?: string;
		}>;
	},
	opts?: { storeRoot?: string },
): Promise<{
	ensured: string[];
	failed: Array<{ purl: string; error: string }>;
}> {
	const byPurl = new Map<string, { purl: string; repoRoot?: string }>();
	for (const c of graph.components) {
		if (
			c.proposed ||
			c.construct === "external" ||
			c.construct === "custom_entity"
		) {
			continue;
		}
		const key = purlRepoKey(c.purl);
		if (!key || key === "external" || byPurl.has(key)) continue;
		const repoRoot = resolveRepoRootForPurl(key) ?? undefined;
		byPurl.set(key, { purl: key, repoRoot });
	}

	const ensured: string[] = [];
	const failed: Array<{ purl: string; error: string }> = [];

	for (const t of byPurl.values()) {
		if (!t.repoRoot) {
			failed.push({
				purl: t.purl,
				error: `no local repoRoot for ${t.purl}`,
			});
			continue;
		}
		const result = await ensurePackageLayers({
			purl: t.purl,
			repoRoot: t.repoRoot,
			storeRoot: opts?.storeRoot,
		});
		if (result.ok) ensured.push(t.purl);
		else {
			failed.push({
				purl: t.purl,
				error: result.error,
			});
		}
	}

	return { ensured, failed };
}

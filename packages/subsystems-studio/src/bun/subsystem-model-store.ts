/**
 * Persistent storage for subsystem models.
 *
 * Layout: `~/.principal/subsystem-models/<id>.json` + `_index.json`
 * mirrors the trail/topic conventions. Each file is a
 * `StoredSubsystemModel` record; the index is a lightweight cache for
 * listing without full-file parsing.
 *
 * One-time migrate: if `~/.principal/subsystem-graphs/` still has files and
 * the new dir is empty/missing, contents are moved on first ensureDir().
 */

import { promises as fs, watch, type FSWatcher } from "node:fs";
import { homedir } from "node:os";
import { join, basename } from "node:path";
import { deriveGraphEdges } from "@principal-ai/subsystems-core";
import { resolveRepoRootFromAlexandria } from "./alexandria";
import type {
	SubsystemComponent,
	SubsystemComponentEdge,
	SubsystemEdgeMechanism,
	SubsystemModelDocument,
	SubsystemRelationType,
	SubsystemWalkthrough,
	SubsystemWalkthroughMechanism,
	SubsystemWalkthroughStep,
	StudioMessages,
} from "../shared/contract";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type {
	SubsystemComponent,
	SubsystemComponentEdge,
	SubsystemModelDocument,
	SubsystemWalkthrough,
	SubsystemWalkthroughStep,
};

const ROOT = join(homedir(), ".principal", "subsystem-models");
const LEGACY_ROOT = join(homedir(), ".principal", "subsystem-graphs");
const INDEX_PATH = join(ROOT, "_index.json");

let legacyMigrateAttempted = false;

/** Payload pushed to the renderer when a stored graph changes. */
export type SubsystemModelChange = StudioMessages["subsystemModelChanged"];

type SubsystemModelChangeListener = (change: SubsystemModelChange) => void;

let changeListener: SubsystemModelChangeListener | null = null;

/** Host registers once to bridge store/watch events onto Electrobun RPC. */
export function setSubsystemModelChangeListener(
	listener: SubsystemModelChangeListener | null,
): void {
	changeListener = listener;
}

/** Ignore fs.watch echoes of our own writes for this long. */
const SELF_WRITE_SUPPRESS_MS = 800;
const recentSelfWrites = new Map<string, number>();

function noteSelfWrite(graphId: string): void {
	recentSelfWrites.set(graphId, Date.now());
}

function wasRecentSelfWrite(graphId: string): boolean {
	const at = recentSelfWrites.get(graphId);
	if (at == null) return false;
	if (Date.now() - at < SELF_WRITE_SUPPRESS_MS) return true;
	recentSelfWrites.delete(graphId);
	return false;
}

function emitSubsystemModelChange(change: SubsystemModelChange): void {
	try {
		changeListener?.(change);
	} catch (err) {
		console.warn(
			`[subsystem-model-store] change listener failed: ${(err as Error).message}`,
		);
	}
}

/** Map a watch filename to a graph id, or null for index / junk. */
export function graphIdFromWatchFilename(name: string | null | undefined): string | null {
	if (!name || !name.endsWith(".json")) return null;
	if (name === "_index.json") return null;
	return name.slice(0, -".json".length);
}

let dirWatcher: FSWatcher | null = null;
let watchDebounce: ReturnType<typeof setTimeout> | null = null;
const pendingWatchIds = new Set<string>();

/**
 * Watch `~/.principal/subsystem-models` for external creates/edits/deletes
 * (agents or humans bypassing the HTTP/RPC write path). Returns a stop fn.
 * Idempotent — calling again while running is a no-op that still returns stop.
 */
export async function startSubsystemModelDirWatcher(): Promise<() => void> {
	if (dirWatcher) {
		return stopSubsystemModelDirWatcher;
	}
	await ensureDir();
	try {
		dirWatcher = watch(ROOT, { persistent: false }, (_event, filename) => {
			const id = graphIdFromWatchFilename(
				typeof filename === "string" ? filename : undefined,
			);
			if (!id) return;
			if (wasRecentSelfWrite(id)) return;
			pendingWatchIds.add(id);
			if (watchDebounce) clearTimeout(watchDebounce);
			watchDebounce = setTimeout(() => {
				const ids = [...pendingWatchIds];
				pendingWatchIds.clear();
				watchDebounce = null;
				for (const graphId of ids) {
					emitSubsystemModelChange({ graphId, reason: "external" });
				}
			}, 120);
		});
		dirWatcher.on("error", (err) => {
			console.warn(
				`[subsystem-model-store] dir watch error: ${(err as Error).message}`,
			);
		});
	} catch (err) {
		console.warn(
			`[subsystem-model-store] could not watch ${ROOT}: ${(err as Error).message}`,
		);
		dirWatcher = null;
	}
	return stopSubsystemModelDirWatcher;
}

export function stopSubsystemModelDirWatcher(): void {
	if (watchDebounce) {
		clearTimeout(watchDebounce);
		watchDebounce = null;
	}
	pendingWatchIds.clear();
	if (dirWatcher) {
		dirWatcher.close();
		dirWatcher = null;
	}
}

/** On-disk record for a subsystem graph. */
export interface StoredSubsystemModel extends SubsystemModelDocument {
	id: string;
	title: string;
	description?: string;
	/** Ordered execution stories over the graph's edges (one per flow). Mirrors
	 *  the wire `StoredSubsystemModel` in ../shared/contract; duplicated here
	 *  until the react package (this type's `SubsystemModelDocument` origin)
	 *  carries `walkthroughs`. */
	walkthroughs?: SubsystemWalkthrough[];
	createdAt: string;
	updatedAt: string;
	/**
	 * When a viewer last opened this graph (stamped by
	 * `touchSubsystemModelOpened`). Host-local listing state — not part of the
	 * portable document. Absent for graphs never opened on this machine.
	 */
	lastOpenedAt?: string;
	/**
	 * Host-only GitHub gist link for this record. Not part of the portable
	 * document — stamped after a successful Share as gist so re-share PATCHes
	 * the same gist instead of creating another.
	 */
	gist?: { id: string; fileName?: string };
	/**
	 * Result of the last file-existence verification pass (run on create and
	 * on component/root updates). Repos without a known local root are
	 * `unresolved`, not missing — absence of a machine is not an error.
	 */
	verification?: SubsystemModelVerification;
}

/**
 * Result of verifying each component against its repo's local root (run on
 * create and on component/root updates). File existence is the base check.
 * Symbol presence is **not** checked here — that belongs to graphify audit
 * (exact anchor). Repos without a known local root are `unresolved`, not
 * missing — absence of a machine is not an error.
 */
export interface SubsystemModelVerification {
	checkedAt: string;
	/** Components whose file was found on disk. */
	verifiedCount: number;
	/** Components with a known local root but no such file. */
	missingCount: number;
	/** Components whose purl is not registered in Alexandria — skipped. */
	unresolvedCount: number;
	/** The misses, for surfacing in UI/API responses. */
	missing: Array<{ componentId: string; file: string }>;
	/**
	 * @deprecated Always 0. Symbol checks moved to graphify audit (exact anchor).
	 */
	symbolsVerified: number;
	/**
	 * @deprecated Always empty. Symbol checks moved to graphify audit.
	 */
	symbolsMissing: Array<{ componentId: string; symbol: string; file: string }>;
	/** Components carrying tool-extracted (`verified`) declarations. */
	declarationsVerified: number;
	/** Components carrying hand-authored declarations. */
	declarationsAuthored: number;
	/**
	 * Walkthrough step sites that fully resolved (file + line resolve against a
	 * local root). Steps whose edge endpoints have no local root are skipped,
	 * not failed — absence of a machine is not an error.
	 */
	walkthroughsChecked: number;
	/**
	 * Walkthrough steps that could not be taken as claimed: missing file, line
	 * out of range, or a blank site line. (Text affinity — "does the line
	 * mention the hop?" — is heuristic and intentionally not checked here.)
	 */
	walkthroughsFailed: Array<{
		walkthroughId: string;
		step: number;
		from: string;
		to: string;
		mechanism: string;
		file: string;
		line: number;
		reason: string;
	}>;
}

/** Lightweight index entry for listing. */
export interface SubsystemModelIndexEntry {
	id: string;
	title: string;
	description?: string;
	componentCount: number;
	edgeCount: number;
	createdAt: string;
	updatedAt: string;
	/** Mirrors the record's `lastOpenedAt` — listing sort without full reads. */
	lastOpenedAt?: string;
	fileName: string;
	/** Host-only gist link mirrored from the record for list/share UI. */
	gist?: { id: string; fileName?: string };
}

interface IndexFile {
	version: number;
	entries: SubsystemModelIndexEntry[];
}

// ---------------------------------------------------------------------------
// Edge-mechanism validation
// ---------------------------------------------------------------------------

/**
 * Allowed edge labels — mirrors `SubsystemEdgeMechanism` from
 * `@principal-ai/subsystems-react` (`packages/subsystems-react/src/subsystem/model.ts`,
 * which also drives the per-mechanism color/style maps the renderer uses).
 *
 * The union is compile-time only and this host module deliberately doesn't
 * bundle the React package (or core) at runtime, so wire-facing validation
 * carries its own runtime copy. The copy is kept in sync at compile time:
 * `satisfies` rejects labels the published union doesn't know, and
 * `SUBSYSTEM_EDGE_MECHANISMS_COVER_PUBLISHED_UNION` below fails typecheck when
 * a published member goes missing here. The store test additionally pins the
 * exact list as a runtime check.
 */
export const SUBSYSTEM_RELATION_TYPES = [
	"imports",
	"extends",
	"inherits",
	"implements",
	"mixes_in",
	"method",
	"references",
] as const satisfies readonly SubsystemRelationType[];

export const SUBSYSTEM_WALKTHROUGH_MECHANISMS = [
	"calls",
	"uses",
	"feeds",
	"produces",
	"writes",
	"reads",
	"watches",
	"registers-into",
] as const satisfies readonly SubsystemWalkthroughMechanism[];

export const SUBSYSTEM_EDGE_MECHANISMS = [
	...SUBSYSTEM_RELATION_TYPES,
	...SUBSYSTEM_WALKTHROUGH_MECHANISMS,
] as const satisfies readonly SubsystemEdgeMechanism[];

export type EdgeMechanism = (typeof SUBSYSTEM_EDGE_MECHANISMS)[number];

type SubsystemEdgeMechanismDrift = Exclude<SubsystemEdgeMechanism, EdgeMechanism>;

export const SUBSYSTEM_EDGE_MECHANISMS_COVER_PUBLISHED_UNION: SubsystemEdgeMechanismDrift extends never
	? true
	: false = true;

// ---------------------------------------------------------------------------
// Component-kind validation
// ---------------------------------------------------------------------------

/**
 * Authored component constructs — the published `SubsystemComponentConstruct` union
 * minus `module`. A module is its own subsystem: it gets its own graph and is
 * referenced, not inlined as a flat node that carries no information. Authors
 * must anchor to the concrete export (`symbol` + `file`) instead; semantic
 * roles ("entry", "service") are a separate field.
 */
export const SUBSYSTEM_COMPONENT_CONSTRUCTS = [
	"class",
	"function",
	"method",
	"interface",
	"type_alias",
	"enum",
	"store",
	"external",
	"custom_entity",
] as const;

export type ComponentConstruct = (typeof SUBSYSTEM_COMPONENT_CONSTRUCTS)[number];

// ---------------------------------------------------------------------------
// Detail-provenance validation
// ---------------------------------------------------------------------------

/**
 * Allowed provenance values for a component's structured `declaration`.
 * `verified` is reserved for tool-extracted data (graphify AST, signature
 * extraction); anything an authoring agent wrote by hand must be `authored`
 * — which is also the default when `declaration` is present without provenance.
 */
export const SUBSYSTEM_DECLARATION_PROVENANCES = ["verified", "authored"] as const;

export type DeclarationProvenance = (typeof SUBSYSTEM_DECLARATION_PROVENANCES)[number];

/**
 * Fill safe defaults so stored declarations always satisfy the published
 * renderer's expectations:
 * - `declaration` without provenance becomes `authored`; orphan claims are dropped.
 * - Per-kind arrays are backfilled as empty so the panel can read `.length`.
 *
 * Mutates the passed array — callers own the payload (fresh-parsed request
 * bodies or records about to be persisted).
 */
export function normalizeDeclarationProvenance(components: unknown): void {
	if (!Array.isArray(components)) return;
	for (const component of components) {
		const c = component as Record<string, unknown> | null;
		if (!c || typeof c !== "object") continue;

		const declaration = c["declaration"] as Record<string, unknown> | undefined;
		if (!declaration || typeof declaration !== "object") {
			delete c["declarationProvenance"];
			continue;
		}
		const p = c["declarationProvenance"];
		if (p !== "verified" && p !== "authored") c["declarationProvenance"] = "authored";
		const kind = declaration["kind"];
		const arrays: Record<string, string[]> = {
			function: ["parameters", "callers", "callees"],
			method: ["parameters"],
			class: ["methods", "properties", "extends", "implements", "instantiations", "references"],
			type: ["properties", "usedBy", "implementors"],
			custom_entity: ["attributes"],
			store: ["properties"],
		};
		for (const key of arrays[String(kind)] ?? []) {
			if (!Array.isArray(declaration[key])) declaration[key] = [];
		}
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalize a purl to its repo key (fragment stripped) — mirrors the react package. */
export function purlRepoKey(purl: string | undefined): string | undefined {
	if (!purl) return undefined;
	const base = purl.split("#")[0]?.trim();
	return base || undefined;
}

/**
 * Resolve a component's local root from Alexandria by its purl.
 *
 * The model does not store local paths — repo identity travels on each
 * component's `purl`, and Alexandria (`~/.alexandria/projects.json`) is the
 * system of record mapping it to a checkout. Returns undefined when the repo
 * is not registered (or has no GitHub remote).
 */
export function resolveRepoRootForComponent(
	purl: string | undefined,
): string | undefined {
	const key = purlRepoKey(purl);
	if (!key) return undefined;
	const parts = key.split("/"); // ["pkg:github", owner, name]
	const name = parts.pop();
	const owner = parts.pop();
	if (!owner || !name) return undefined;
	return resolveRepoRootFromAlexandria(owner, name) ?? undefined;
}

/**
 * @deprecated Prefer graphify exact-anchor checks. Kept only for older tests /
 * call sites; do not use for audit.
 */
export function fileDeclaresSymbol(content: string, symbol: string): boolean {
	const name = symbol.split(".").pop()?.trim() ?? "";
	if (!name) return false;
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const decl = new RegExp(
		`\\b(?:function|class|const|let|var|interface|type|enum)\\s+${escaped}\\b`,
	);
	return decl.test(content);
}

/**
 * Check every component's `file` against its repo's local root. When the graph
 * carries `walkthroughs`, each step's site is also resolved. Symbol presence is
 * intentionally not checked here (graphify audit owns that). Purely
 * informational — never blocks create/update.
 */
export async function verifyModelFiles(
	doc: SubsystemModelDocument & {
		walkthroughs?: SubsystemWalkthrough[];
	},
): Promise<SubsystemModelVerification> {
	const missing: Array<{ componentId: string; file: string }> = [];
	const symbolsMissing: Array<{ componentId: string; symbol: string; file: string }> = [];
	let verifiedCount = 0;
	let unresolvedCount = 0;
	let symbolsVerified = 0;
	let declarationsVerified = 0;
	let declarationsAuthored = 0;
	for (const c of doc.components) {
		// Declaration-provenance counts are payload-level stats — independent of
		// whether this machine has the repo checked out.
		const raw = c as unknown as Record<string, unknown>;
		if (raw["declaration"]) {
			const provenance = raw["declarationProvenance"];
			if (provenance === "verified") declarationsVerified++;
			else declarationsAuthored++;
		}
		if (c.proposed) continue;
		if (!c.file) continue;
		const root = resolveRepoRootForComponent(c.purl);
		if (!root) {
			unresolvedCount++;
			continue;
		}
		const abs = join(root, c.file);
		try {
			await fs.access(abs);
			verifiedCount++;
		} catch {
			missing.push({ componentId: c.id, file: c.file });
			continue;
		}
		// Symbol presence is verified via graphify (audit), not a text regex here.
	}
	// Walkthrough step sites — alias-backed, so resolution reuses the same
	// repo-root logic as components.
	let walkthroughsChecked = 0;
	const walkthroughsFailed: SubsystemModelVerification["walkthroughsFailed"] = [];
	if (Array.isArray(doc.walkthroughs)) {
		const componentById = new Map<string, SubsystemComponent>();
		for (const c of doc.components) componentById.set(c.id, c);
		for (const tl of doc.walkthroughs) {
			if (!Array.isArray(tl.steps)) continue;
			for (let i = 0; i < tl.steps.length; i++) {
				const step = tl.steps[i];
				const fail = (reason: string) =>
					walkthroughsFailed.push({
						walkthroughId: tl.id,
						step: i,
						from: step.from,
						to: step.to,
						mechanism: step.mechanism,
						file: step.file,
						line: step.line,
						reason,
					});
				const from = componentById.get(step.from);
				const to = componentById.get(step.to);
				const root =
					resolveRepoRootForComponent(from?.purl) ??
					resolveRepoRootForComponent(to?.purl);
				if (!root) continue;
				const abs = join(root, step.file);
				try {
					const lines = (await fs.readFile(abs, "utf8")).split("\n");
					if (step.line < 1 || step.line > lines.length) {
						fail(`line ${step.line} out of range (${step.file} has ${lines.length} lines)`);
						continue;
					}
					const lineText = lines[step.line - 1] ?? "";
					if (!lineText.trim()) {
						fail(`line ${step.line} in ${step.file} is blank`);
						continue;
					}
					walkthroughsChecked++;
				} catch {
					fail(`file ${JSON.stringify(step.file)} not found under ${root}`);
				}
			}
		}
	}
	return {
		checkedAt: new Date().toISOString(),
		verifiedCount,
		missingCount: missing.length,
		unresolvedCount,
		missing,
		symbolsVerified,
		symbolsMissing,
		declarationsVerified,
		declarationsAuthored,
		walkthroughsChecked,
		walkthroughsFailed,
	};
}

function graphId(): string {
	const ts = Date.now();
	const rand = Math.random().toString(36).slice(2, 11);
	return `sg-${ts}-${rand}`;
}

function graphPath(id: string): string {
	return join(ROOT, `${id}.json`);
}

/** Absolute on-disk path for a stored subsystem graph JSON file. */
export function subsystemModelFilePath(id: string): string {
	return graphPath(id);
}

/**
 * Move legacy `subsystem-graphs` → `subsystem-models` once.
 * Runs when the new dir is missing/empty and the old dir has model JSON files.
 * `roots` is for tests; production uses the default ~/.principal paths.
 */
export async function migrateLegacySubsystemGraphsDir(roots?: {
	legacyRoot?: string;
	root?: string;
}): Promise<boolean> {
	const legacyRoot = roots?.legacyRoot ?? LEGACY_ROOT;
	const root = roots?.root ?? ROOT;
	const skipOnceGuard = roots != null;

	if (!skipOnceGuard) {
		if (legacyMigrateAttempted) return false;
		legacyMigrateAttempted = true;
	}

	let legacyEntries: Awaited<ReturnType<typeof fs.readdir>>;
	try {
		legacyEntries = await fs.readdir(legacyRoot, { withFileTypes: true });
	} catch {
		return false;
	}

	const legacyFiles = legacyEntries.filter(
		(e) => e.isFile() && e.name.endsWith(".json"),
	);
	if (legacyFiles.length === 0) {
		try {
			await fs.rmdir(legacyRoot);
		} catch {
			/* not empty or busy — leave it */
		}
		return false;
	}

	let newHasModels = false;
	try {
		const existing = await fs.readdir(root, { withFileTypes: true });
		newHasModels = existing.some(
			(e) => e.isFile() && e.name.endsWith(".json") && e.name !== "_index.json",
		);
	} catch {
		/* new dir missing */
	}

	if (newHasModels) {
		console.warn(
			`[subsystem-model-store] both ${legacyRoot} and ${root} have model files; leaving legacy dir in place`,
		);
		return false;
	}

	await fs.mkdir(root, { recursive: true });
	let moved = 0;
	for (const entry of legacyFiles) {
		const from = join(legacyRoot, entry.name);
		const to = join(root, entry.name);
		try {
			await fs.rename(from, to);
			moved++;
		} catch (err) {
			// Cross-device fallback
			try {
				await fs.copyFile(from, to);
				await fs.unlink(from);
				moved++;
			} catch (err2) {
				console.warn(
					`[subsystem-model-store] failed to migrate ${basename(from)}: ${(err2 as Error).message ?? err}`,
				);
			}
		}
	}

	try {
		const leftover = await fs.readdir(legacyRoot);
		if (leftover.length === 0) await fs.rmdir(legacyRoot);
	} catch {
		/* ignore */
	}

	if (moved > 0) {
		console.log(
			`[subsystem-model-store] migrated ${moved} file(s) from subsystem-graphs → subsystem-models`,
		);
		return true;
	}
	return false;
}

async function ensureDir(): Promise<void> {
	await migrateLegacySubsystemGraphsDir();
	await fs.mkdir(ROOT, { recursive: true });
}

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

async function readIndex(): Promise<SubsystemModelIndexEntry[]> {
	try {
		const raw = await fs.readFile(INDEX_PATH, "utf8");
		const idx = JSON.parse(raw) as IndexFile;
		if (idx.version === 1) return idx.entries;
	} catch {
		// missing / corrupt → rebuild
	}
	return rebuildIndex();
}

/** Index entry derived from a stored record. Single source for all writers. */
function indexEntryFor(record: StoredSubsystemModel): SubsystemModelIndexEntry {
	return {
		id: record.id,
		title: record.title,
		description: record.description,
		componentCount: record.components.length,
		edgeCount: deriveGraphEdges(record).length,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
		lastOpenedAt: record.lastOpenedAt,
		fileName: `${record.id}.json`,
		gist: record.gist,
	};
}

async function rebuildIndex(): Promise<SubsystemModelIndexEntry[]> {
	await ensureDir();
	const entries: SubsystemModelIndexEntry[] = [];
	let files;
	try {
		files = await fs.readdir(ROOT, { withFileTypes: true });
	} catch {
		return entries;
	}
	for (const f of files) {
		if (!f.isFile() || !f.name.endsWith(".json") || f.name === "_index.json") continue;
		try {
			const raw = await fs.readFile(join(ROOT, f.name), "utf8");
			const graph = JSON.parse(raw) as StoredSubsystemModel;
			entries.push(indexEntryFor(graph));
		} catch {
			// skip corrupt files
		}
	}
	entries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
	await writeIndex(entries);
	return entries;
}

async function writeIndex(entries: SubsystemModelIndexEntry[]): Promise<void> {
	await ensureDir();
	const idx: IndexFile = { version: 1, entries };
	await fs.writeFile(INDEX_PATH, JSON.stringify(idx, null, 2), "utf8");
}

async function upsertIndexEntry(entry: SubsystemModelIndexEntry): Promise<void> {
	const entries = await readIndex();
	const idx = entries.findIndex((e) => e.id === entry.id);
	if (idx >= 0) entries[idx] = entry;
	else entries.push(entry);
	await writeIndex(entries);
}

async function removeIndexEntry(id: string): Promise<void> {
	const entries = await readIndex();
	const filtered = entries.filter((e) => e.id !== id);
	if (filtered.length !== entries.length) await writeIndex(filtered);
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/** List all stored subsystem graphs. */
export async function listSubsystemModels(): Promise<SubsystemModelIndexEntry[]> {
	return readIndex();
}

/** Get a single subsystem graph by id. */
export async function getSubsystemModel(id: string): Promise<StoredSubsystemModel | null> {
	try {
		const raw = await fs.readFile(graphPath(id), "utf8");
		const record = JSON.parse(raw) as StoredSubsystemModel;
		// Normalize provenance defaults + backfill renderer-required arrays on read.
		normalizeDeclarationProvenance(record.components);
		return record;
	} catch {
		return null;
	}
}

/** Create a new subsystem graph. Returns the stored record with generated id + timestamps. */
export async function createSubsystemModel(
	doc: SubsystemModelDocument & {
		title: string;
		description?: string;
		walkthroughs?: SubsystemWalkthrough[];
	},
): Promise<StoredSubsystemModel> {
	await ensureDir();
	normalizeDeclarationProvenance(doc.components);
	const now = new Date().toISOString();
	const record: StoredSubsystemModel = {
		...doc,
		id: graphId(),
		createdAt: now,
		updatedAt: now,
	};
	record.verification = await verifyModelFiles(record);
	noteSelfWrite(record.id);
	await fs.writeFile(graphPath(record.id), JSON.stringify(record, null, 2), "utf8");
	await upsertIndexEntry(indexEntryFor(record));
	emitSubsystemModelChange({ graphId: record.id, reason: "created" });
	return record;
}

/** Update an existing subsystem graph. Returns the updated record, or null if not found. */
export async function updateSubsystemModel(
	id: string,
	patch: Partial<
		Pick<
			StoredSubsystemModel,
			| "title"
			| "description"
			| "components"
			| "relations"
			| "walkthroughs"
			| "gist"
		>
	>,
): Promise<StoredSubsystemModel | null> {
	const existing = await getSubsystemModel(id);
	if (!existing) return null;
	if (patch.components !== undefined) normalizeDeclarationProvenance(patch.components);
	const updated: StoredSubsystemModel = {
		...existing,
		...patch,
		updatedAt: new Date().toISOString(),
	};
	updated.verification = await verifyModelFiles(updated);
	noteSelfWrite(id);
	await fs.writeFile(graphPath(id), JSON.stringify(updated, null, 2), "utf8");
	await upsertIndexEntry(indexEntryFor(updated));
	emitSubsystemModelChange({ graphId: id, reason: "updated" });
	return updated;
}

/** Skip rewriting the record when an open stamp is this fresh (focus clicks). */
const OPEN_RESTAMP_SUPPRESS_MS = 30_000;

/**
 * True when an open should restamp `lastOpenedAt`: never opened, an
 * unparseable stamp, or the last stamp older than the suppress window.
 * Re-focusing an already-open tab shouldn't churn the record file on every
 * click.
 */
export function shouldRestampOpened(
	lastOpenedAt: string | undefined,
	nowMs: number,
): boolean {
	if (!lastOpenedAt) return true;
	const last = Date.parse(lastOpenedAt);
	if (!Number.isFinite(last)) return true;
	return nowMs - last >= OPEN_RESTAMP_SUPPRESS_MS;
}

/**
 * Stamp `lastOpenedAt` on a stored graph's record and index entry. Does not
 * bump `updatedAt` (that means "edited") and skips verification (no content
 * changed); the write is suppressed from the dir watcher via `noteSelfWrite`.
 * No-ops for unknown ids and inside the restamp suppress window. Called from
 * `openSubsystemModelTab` — the single choke point for opens (renderer RPC
 * and the agent HTTP route).
 */
export async function touchSubsystemModelOpened(id: string): Promise<void> {
	const existing = await getSubsystemModel(id);
	if (!existing) return;
	if (!shouldRestampOpened(existing.lastOpenedAt, Date.now())) return;
	const updated: StoredSubsystemModel = {
		...existing,
		lastOpenedAt: new Date().toISOString(),
	};
	noteSelfWrite(id);
	await fs.writeFile(graphPath(id), JSON.stringify(updated, null, 2), "utf8");
	await upsertIndexEntry(indexEntryFor(updated));
}

/** Delete a subsystem graph. Returns true if deleted. */
export async function deleteSubsystemModel(id: string): Promise<boolean> {
	try {
		noteSelfWrite(id);
		await fs.unlink(graphPath(id));
		await removeIndexEntry(id);
		emitSubsystemModelChange({ graphId: id, reason: "deleted" });
		return true;
	} catch {
		return false;
	}
}

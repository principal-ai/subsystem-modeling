/**
 * Persistent storage for subsystem models.
 *
 * Layout: `~/.principal/subsystem-models/<id>.json` + `_index.json`
 * mirrors the topic store conventions. Each file is a
 * `StoredSubsystemModel` record; the index is a lightweight cache for
 * listing without full-file parsing.
 */

import { promises as fs, watch, type FSWatcher } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { deriveGraphEdges } from "@principal-ai/subsystems-core";
import { resolveRepoRootFromAlexandria } from "./alexandria";
import { capturePurlCommits } from "./purl-commits";
import type {
	PurlCommit,
	SubsystemComponent,
	SubsystemComponentEdge,
	SubsystemEdgeMechanism,
	SubsystemModelDocument,
	SubsystemTrail,
	SubsystemTrailMechanism,
	SubsystemTrailStep,
	StudioMessages,
} from "../shared/contract";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type {
	SubsystemComponent,
	SubsystemComponentEdge,
	SubsystemModelDocument,
	SubsystemTrail,
	SubsystemTrailStep,
};

/**
 * Root home for the store. `PRINCIPAL_SUBSYSTEM_MODELS_HOME` overrides
 * `homedir()` for tests (mirrors PRINCIPAL_ALEXANDRIA_HOME). Resolved lazily so
 * an override set after module load still applies.
 */
function storeHome(): string {
	const override = process.env["PRINCIPAL_SUBSYSTEM_MODELS_HOME"]?.trim();
	return override ? override : homedir();
}

function modelsRoot(): string {
	return join(storeHome(), ".principal", "subsystem-models");
}

function indexFilePath(): string {
	return join(modelsRoot(), "_index.json");
}

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
		dirWatcher = watch(modelsRoot(), { persistent: false }, (_event, filename) => {
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
			`[subsystem-model-store] could not watch ${modelsRoot()}: ${(err as Error).message}`,
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

/**
 * The portable model body this host stores. Mirrors the published
 * `SubsystemModelDocument` minus authored `relations`, which are no longer part
 * of a subsystem model. Declared locally so the host stays internally
 * consistent until the published react/core types catch up.
 */
export type SubsystemDocumentBody = Omit<SubsystemModelDocument, "relations">;

/** On-disk record for a subsystem graph. */
export interface StoredSubsystemModel extends SubsystemDocumentBody {
	id: string;
	title: string;
	description?: string;
	/** Ordered execution stories over the graph's edges (one per flow). Mirrors
	 *  the wire `StoredSubsystemModel` in ../shared/contract; duplicated here
	 *  until the react package (this type's `SubsystemModelDocument` origin)
	 *  carries `trails`. */
	trails?: SubsystemTrail[];
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
	 * Host-binding provenance: the commit each referenced purl's repo was at
	 * when the model was created. Immutable. Keyed by `purlRepoKey`. Absent on
	 * records authored before this field existed.
	 */
	createdAtCommits?: Record<string, PurlCommit>;
	/**
	 * Host-binding provenance: the commit each referenced purl's repo was at
	 * when the audit last passed `fully_verified` against a clean referenced
	 * state. Absent until an audit earns it.
	 */
	verifiedAtCommits?: Record<string, PurlCommit>;
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
	missing: Array<{ componentAlias: string; file: string }>;
	/**
	 * @deprecated Always 0. Symbol checks moved to graphify audit (exact anchor).
	 */
	symbolsVerified: number;
	/**
	 * @deprecated Always empty. Symbol checks moved to graphify audit.
	 */
	symbolsMissing: Array<{ componentAlias: string; symbol: string; file: string }>;
	/** Components carrying tool-extracted (`verified`) declarations. */
	declarationsVerified: number;
	/** Components carrying hand-authored declarations. */
	declarationsAuthored: number;
	/**
	 * Trail step sites that fully resolved (file + line resolve against a
	 * local root). Steps whose edge endpoints have no local root are skipped,
	 * not failed — absence of a machine is not an error.
	 */
	trailsChecked: number;
	/**
	 * Trail steps that could not be taken as claimed: missing file, line
	 * out of range, or a blank site line. (Text affinity — "does the line
	 * mention the step?" — is heuristic and intentionally not checked here.)
	 */
	trailsFailed: Array<{
		trailId: string;
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
export const SUBSYSTEM_TRAIL_MECHANISMS = [
	"calls",
	"uses",
	"feeds",
	"produces",
	"writes",
	"reads",
	"watches",
	"registers-into",
] as const satisfies readonly SubsystemTrailMechanism[];

export const SUBSYSTEM_EDGE_MECHANISMS = [
	...SUBSYSTEM_TRAIL_MECHANISMS,
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
 * extraction); anything an authoring agent wrote by hand must be `authored`.
 * A `declaration` with no provenance is valid — both fields are optional on a
 * component — so absence means "unstated", not "authored".
 */
export const SUBSYSTEM_DECLARATION_PROVENANCES = ["verified", "authored"] as const;

export type DeclarationProvenance = (typeof SUBSYSTEM_DECLARATION_PROVENANCES)[number];

/**
 * Fold the undeclared store-declaration fields that early models authored onto
 * the fields the schema declares.
 *
 * A 23-store audit of the local models found four store declarations that the
 * published schema rejects (`additionalProperties: false`): three DB-table
 * stores wrote `members` for their columns, one directory store wrote
 * free-form `attributes`. `members` is the same shape as `properties`
 * (`{ name, type? }`) — a table column is a named member — so it folds across
 * losslessly. `attributes` is `{ key, value }` prose with no schema home, and
 * the same facts are already in the component's `purpose`; it is dropped with a
 * warning rather than silently reshaped into a property whose "type" would be a
 * value.
 */
function foldLegacyStoreDeclarationFields(
	componentAlias: string,
	declaration: Record<string, unknown>,
): void {
	if (declaration["kind"] !== "store") return;
	if (Array.isArray(declaration["members"]) && !Array.isArray(declaration["properties"])) {
		declaration["properties"] = declaration["members"];
		console.warn(
			`[principal-studio] ${componentAlias}: store declaration "members" → "properties" (undeclared field)`,
		);
	}
	delete declaration["members"];
	if (declaration["attributes"] !== undefined) {
		delete declaration["attributes"];
		console.warn(
			`[principal-studio] ${componentAlias}: dropped store declaration "attributes" (undeclared field; the same facts belong in the component's purpose)`,
		);
	}
}

/**
 * Fold undeclared store-declaration fields from early models onto the fields the
 * schema declares.
 *
 * This is the only thing it does now, and it is deliberately narrow. It used to
 * also backfill per-kind declaration arrays to `[]` and coerce
 * `declarationProvenance`; both are gone.
 *
 * The array backfill existed because the schema required
 * `functionDeclaration.parameters/callers/callees`, seven arrays on
 * `classDeclaration`, and so on. Those call-graph buckets
 * (`callers`/`callees`, class `references` + `instantiations`, type `usedBy` +
 * `implementors`) are now removed from the document entirely: nothing populated
 * them, and a referenced-symbol click resolves against the host's graphify
 * cache at inspection time rather than reading stored edges. So an honest
 * declaration no longer has to pad itself to satisfy the schema, and the
 * backfill had nothing left to do.
 *
 * Provenance is no longer coerced either. `declaration` and
 * `declarationProvenance` are both optional on a component, so a declaration
 * with no provenance is valid; the old `!== "verified" && !== "authored"` →
 * `"authored"` fallback quietly relabelled a typo as hand-written, and would
 * have absorbed any future third value instead of letting the schema reject it.
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
		if (!declaration || typeof declaration !== "object") continue;
		foldLegacyStoreDeclarationFields(
			typeof c["alias"] === "string" ? c["alias"] : "(unnamed)",
			declaration,
		);
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
 * True when a purl identifies a code repo checkout we can resolve locally.
 *
 * Only `pkg:github/…` qualifies. Pseudo-purls describing internal surfaces
 * (`external:file:~/.principal/subsystem-models`, `external:proposed`,
 * `external:…`) are stable identities, not repos — resolving or graphifying
 * them would invent a checkout (see the stale
 * `graphify-graphs/external-file-*` cache).
 */
export function isRepoPurl(purl: string | undefined): boolean {
	const key = purlRepoKey(purl);
	if (!key) return false;
	return /^pkg:github\//i.test(key);
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
	if (!key || !isRepoPurl(key)) return undefined;
	const parts = key.split("/"); // ["pkg:github", owner, name]
	const name = parts.pop();
	const owner = parts.pop();
	if (!owner || !name) return undefined;
	return resolveRepoRootFromAlexandria(owner, name) ?? undefined;
}

/**
 * Backfill file-anchored `purl`s on trail steps written before step
 * purls were required. Derives `repoKey(endpointPurl)#step.file` from the
 * step's from ?? to component — the same attribution verification and the
 * file panel already used. Mutates the passed record in place and returns
 * true when any step was filled.
 */
export function backfillStepPurls(doc: {
	components?: ReadonlyArray<{ alias: string; purl?: string }>;
	trails?: Array<{
		steps?: Array<{ file?: string; purl?: string; from?: string; to?: string }>;
	}>;
}): boolean {
	const byAlias = new Map(
		(doc.components ?? []).map((c) => [c.alias, c]),
	);
	let filled = false;
	for (const w of doc.trails ?? []) {
		for (const s of w.steps ?? []) {
			if (s.purl || !s.file) continue;
			const key = purlRepoKey(
				byAlias.get(s.from ?? "")?.purl ?? byAlias.get(s.to ?? "")?.purl,
			);
			if (!key) continue;
			s.purl = `${key}#${s.file}`;
			filled = true;
		}
	}
	return filled;
}

/**
 * Check every component's `file` against its repo's local root. When the graph
 * carries `trails`, each step's site is also resolved. Symbol presence is
 * intentionally not checked here (graphify audit owns that). Purely
 * informational — never blocks create/update.
 */
export async function verifyModelFiles(
	doc: SubsystemDocumentBody & {
		trails?: SubsystemTrail[];
	},
): Promise<SubsystemModelVerification> {
	const missing: Array<{ componentAlias: string; file: string }> = [];
	const symbolsMissing: Array<{ componentAlias: string; symbol: string; file: string }> = [];
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
			missing.push({ componentAlias: c.alias, file: c.file });
			continue;
		}
		// Symbol presence is verified via graphify (audit), not a text regex here.
	}
	// Trail step sites — alias-backed, so resolution reuses the same
	// repo-root logic as components.
	let trailsChecked = 0;
	const trailsFailed: SubsystemModelVerification["trailsFailed"] = [];
	if (Array.isArray(doc.trails)) {
		const componentByAlias = new Map<string, SubsystemComponent>();
		for (const c of doc.components) componentByAlias.set(c.alias, c);
		for (const tl of doc.trails) {
			if (!Array.isArray(tl.steps)) continue;
			for (let i = 0; i < tl.steps.length; i++) {
				const step = tl.steps[i];
				const fail = (reason: string) =>
					trailsFailed.push({
						trailId: tl.id,
						step: i,
						from: step.from,
						to: step.to,
						mechanism: step.mechanism,
						file: step.file,
						line: step.line,
						reason,
					});
			const from = componentByAlias.get(step.from);
			const to = componentByAlias.get(step.to);
			// Preferred: the step names its own site purl. Fall back to the
			// endpoint components' purls for graphs written before step
			// purls were required.
			const root =
				resolveRepoRootForComponent(step.purl) ??
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
					trailsChecked++;
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
		trailsChecked,
		trailsFailed,
	};
}

function graphId(): string {
	const ts = Date.now();
	const rand = Math.random().toString(36).slice(2, 11);
	return `sg-${ts}-${rand}`;
}

function graphPath(id: string): string {
	return join(modelsRoot(), `${id}.json`);
}

/** Absolute on-disk path for a stored subsystem graph JSON file. */
export function subsystemModelFilePath(id: string): string {
	return graphPath(id);
}

async function ensureDir(): Promise<void> {
	await fs.mkdir(modelsRoot(), { recursive: true });
}

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

async function readIndex(): Promise<SubsystemModelIndexEntry[]> {
	try {
		const raw = await fs.readFile(indexFilePath(), "utf8");
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
		files = await fs.readdir(modelsRoot(), { withFileTypes: true });
	} catch {
		return entries;
	}
	for (const f of files) {
		if (!f.isFile() || !f.name.endsWith(".json") || f.name === "_index.json") continue;
		try {
			const raw = await fs.readFile(join(modelsRoot(), f.name), "utf8");
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
	await fs.writeFile(indexFilePath(), JSON.stringify(idx, null, 2), "utf8");
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
		backfillStepPurls(record);
		return record;
	} catch {
		return null;
	}
}

/** Create a new subsystem graph. Returns the stored record with generated id + timestamps. */
export async function createSubsystemModel(
	doc: SubsystemDocumentBody & {
		title: string;
		description?: string;
		trails?: SubsystemTrail[];
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
	// What the model was authored against — captured once, never rewritten.
	record.createdAtCommits = await capturePurlCommits(record.components);
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
			| "trails"
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

/**
 * Record the commit each purl's repo is at now as the model's verified
 * provenance. Called only by the audit path, and only when the audit returned
 * `fully_verified` against a clean referenced state.
 *
 * Replaces `verifiedAtCommits` wholesale (latest-only): the map reflects the
 * purls verified in this pass, so a purl that is currently unresolved is not
 * silently carried over from a previous run. Does not bump `updatedAt` — this
 * is provenance, not an edit, and bumping it would invalidate the audit
 * fingerprint that was just saved.
 */
export async function stampVerifiedCommits(
	id: string,
	commits: Record<string, PurlCommit>,
): Promise<StoredSubsystemModel | null> {
	const existing = await getSubsystemModel(id);
	if (!existing) return null;
	const updated: StoredSubsystemModel = {
		...existing,
		verifiedAtCommits: commits,
	};
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

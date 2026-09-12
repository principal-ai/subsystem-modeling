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
	/** Where this graph came from (agent session, manual creation, etc.). */
	source?: string;
	/** Repository this graph is about. */
	repo?: { owner: string; name: string };
	/**
	 * Local filesystem root component `file` paths resolve against. Opt-in:
	 * only set it for graphs whose components reference a repo on this
	 * machine. File reads are sandboxed to this root.
	 *
	 * Single-repo graphs: the default root for every component.
	 */
	repoRoot?: string;
	/**
	 * Per-repo local roots for multi-repo graphs, keyed by purl repo key
	 * (`pkg:github/owner/name`, fragment stripped). A component's `file`
	 * resolves against `repoRoots[purlRepo] ?? repoRoot`.
	 */
	repoRoots?: Record<string, string>;
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
	/** Components whose purl has no entry in `repoRoots`/`repoRoot` — skipped. */
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
	 * Walkthrough step sites that fully resolved (edge exists, file + line
	 * resolve against a local root, and the line text has affinity with the
	 * edge). Steps whose edge endpoints have no local root are skipped, not
	 * failed — absence of a machine is not an error.
	 */
	walkthroughsChecked: number;
	/**
	 * Walkthrough steps that could not be taken as claimed: unknown hop,
	 * missing file, line out of range, or a site line with no affinity to the
	 * edge (a step can't point at a random line and claim it is the seam).
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
	source?: string;
	repo?: { owner: string; name: string };
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
	"contains",
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

export function findRelationTypeProblems(relations: unknown): string[] {
	if (!Array.isArray(relations)) return ["relations must be an array"];
	const problems: string[] = [];
	for (const rel of relations) {
		const r = rel as Partial<{ id: string; from: string; to: string; relationType: string }> | null;
		if (typeof r?.id !== "string" || !r.id.trim()) {
			problems.push(`relation ${JSON.stringify(r?.id ?? "<no id>")}: id is required`);
		}
		if (typeof r?.from !== "string" || !r.from.trim()) {
			problems.push(`relation ${JSON.stringify(r?.id ?? "<no id>")}: from is required`);
		}
		if (typeof r?.to !== "string" || !r.to.trim()) {
			problems.push(`relation ${JSON.stringify(r?.id ?? "<no id>")}: to is required`);
		}
		if (
			typeof r?.relationType !== "string" ||
			!(SUBSYSTEM_RELATION_TYPES as readonly string[]).includes(r.relationType)
		) {
			problems.push(
				`relation ${JSON.stringify(r?.id ?? "<no id>")}: unknown relationType ${JSON.stringify(r?.relationType)} — allowed: ${SUBSYSTEM_RELATION_TYPES.join(", ")}`,
			);
		}
	}
	return problems;
}

/**
 * Human-readable problems with a graph's walkthroughs (empty = valid).
 * A walkthrough is an ordered runtime story: each hop names from/to/mechanism
 * plus a file:line site (display edges are derived). Reject unknown mechanisms
 * or sites that can't be a code location before persist.
 */
export function findWalkthroughProblems(walkthroughs: unknown): string[] {
	if (walkthroughs === undefined) return [];
	if (!Array.isArray(walkthroughs)) return ["walkthroughs must be an array"];
	const problems: string[] = [];
	for (const wt of walkthroughs) {
		const w = wt as Partial<SubsystemWalkthrough> | null;
		const label = JSON.stringify(w?.id ?? "<no id>");
		if (typeof w?.id !== "string" || !w.id.trim()) {
			problems.push(`walkthrough ${label}: id is required`);
			continue;
		}
		if (typeof w?.title !== "string" || !w.title.trim()) {
			problems.push(`walkthrough ${label}: title is required`);
		}
		if (!Array.isArray(w.steps)) {
			problems.push(`walkthrough ${label}: steps array is required`);
			continue;
		}
		w.steps.forEach((step, i) => {
			const s = step as Partial<SubsystemWalkthroughStep> | null;
			if (typeof s?.from !== "string" || !s.from.trim()) {
				problems.push(`walkthrough ${label}: step ${i} from is required`);
			}
			if (typeof s?.to !== "string" || !s.to.trim()) {
				problems.push(`walkthrough ${label}: step ${i} to is required`);
			}
			if (
				typeof s?.mechanism !== "string" ||
				!(SUBSYSTEM_WALKTHROUGH_MECHANISMS as readonly string[]).includes(s.mechanism)
			) {
				problems.push(
					`walkthrough ${label}: step ${i} unknown mechanism ${JSON.stringify(s?.mechanism)} — allowed: ${SUBSYSTEM_WALKTHROUGH_MECHANISMS.join(", ")}`,
				);
			}
			if (typeof s?.file !== "string" || !s.file.trim()) {
				problems.push(`walkthrough ${label}: step ${i} file is required`);
			} else if (typeof s?.line !== "number" || !Number.isInteger(s.line) || s.line < 1) {
				problems.push(
					`walkthrough ${label}: step ${i} line must be a positive 1-based integer (file ${JSON.stringify(s?.file)})`,
				);
			}
		});
	}
	return problems;
}

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

/** Human-readable problems with component kinds (empty = valid). */
export function findComponentConstructProblems(components: unknown): string[] {
	if (!Array.isArray(components)) return [];
	const problems: string[] = [];
	for (const component of components) {
		const c = component as Partial<SubsystemComponent> | null;
		if (
			typeof c?.construct === "string" &&
			(SUBSYSTEM_COMPONENT_CONSTRUCTS as readonly string[]).includes(c.construct)
		) {
			continue;
		}
		problems.push(
			`component ${JSON.stringify(c?.id ?? "<no id>")}: invalid construct ${JSON.stringify(c?.construct)} — allowed: ${SUBSYSTEM_COMPONENT_CONSTRUCTS.join(", ")}. A module is its own subsystem: anchor to a concrete export (symbol + file), or publish it as a separate graph and reference it.`,
		);
	}
	return problems;
}

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
 * Human-readable problems with explicit declaration-provenance claims (empty =
 * valid).
 */
export function findDeclarationProvenanceProblems(components: unknown): string[] {
	if (!Array.isArray(components)) return [];
	const problems: string[] = [];
	for (const component of components) {
		const c = component as Record<string, unknown> | null;
		if (!c || typeof c !== "object") continue;
		if (!c["declaration"]) continue;
		const p = c["declarationProvenance"];
		if (p === undefined) continue;
		if (
			typeof p === "string" &&
			(SUBSYSTEM_DECLARATION_PROVENANCES as readonly string[]).includes(p)
		) {
			continue;
		}
		problems.push(
			`component ${JSON.stringify(String(c["id"] ?? "<no id>"))}: invalid declarationProvenance ${JSON.stringify(p)} — allowed: ${SUBSYSTEM_DECLARATION_PROVENANCES.join(", ")}. Hand-authored declarations must be "authored"; "verified" is reserved for tool-extracted data.`,
		);
	}
	return problems;
}

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
			module: ["imports", "exports", "symbols"],
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
 * Pick the local root for a component's file.
 *
 * Multi-repo graphs (`repoRoots` present) require an explicit per-repo entry —
 * falling back to a default root would read one repo's files from another's
 * tree. Only single-repo graphs (no `repoRoots`) apply `repoRoot` to everyone.
 */
export function resolveRepoRootForComponent(
	graph: Pick<StoredSubsystemModel, "repoRoot" | "repoRoots">,
	purl: string | undefined,
): string | undefined {
	if (graph.repoRoots) {
		const key = purlRepoKey(purl);
		return key ? graph.repoRoots[key] : undefined;
	}
	return graph.repoRoot;
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
 * Candidate affinity tokens for a walkthrough step's site line: identifier
 * words (>= 4 chars) drawn from the edge's endpoint symbols/names and every
 * entry in the edge's `refs`. A site line that mentions none of these is not
 * plausibly the seam the edge claims — "readFile" from a ref, "openDrawing"
 * from a symbol, "DRAWING_EVENTS" from an event ref, etc.
 */
export function walkthroughStepTokens(
	edge: SubsystemComponentEdge,
	from: SubsystemComponent | undefined,
	to: SubsystemComponent | undefined,
): string[] {
	const tokens = new Set<string>();
	const add = (s: string | undefined) => {
		if (!s) return;
		for (const word of s.split(/[^A-Za-z_]+/)) {
			if (word.length >= 4) tokens.add(word.toLowerCase());
		}
	};
	for (const c of [from, to]) {
		if (!c) continue;
		add(c.symbol);
		add(c.name);
	}
	for (const ref of edge.refs ?? []) add(ref);
	return [...tokens];
}

/**
 * True when the site line text mentions any affinity token for the edge —
 * the derived check that backs "a step can't point at a random line and claim
 * it is the seam." Lenient by design: a match on one endpoint or one ref
 * token counts.
 */
export function walkthroughStepHasAffinity(
	lineText: string,
	edge: SubsystemComponentEdge,
	from: SubsystemComponent | undefined,
	to: SubsystemComponent | undefined,
): boolean {
	const hay = lineText.toLowerCase();
	return walkthroughStepTokens(edge, from, to).some((t) => hay.includes(t));
}

/**
 * Check every component's `file` against its repo's local root. When the graph
 * carries `walkthroughs`, each step's site is also resolved. Symbol presence is
 * intentionally not checked here (graphify audit owns that). Purely
 * informational — never blocks create/update.
 */
export async function verifyModelFiles(
	doc: SubsystemModelDocument & {
		repoRoot?: string;
		repoRoots?: Record<string, string>;
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
		const root = resolveRepoRootForComponent(doc, c.purl);
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
					resolveRepoRootForComponent(doc, from?.purl) ??
					resolveRepoRootForComponent(doc, to?.purl);
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
					const hopEdge: SubsystemComponentEdge = {
						id: `${step.from}--${step.mechanism}-->${step.to}`,
						from: step.from,
						to: step.to,
						mechanism: step.mechanism,
					};
					if (!walkthroughStepHasAffinity(lineText, hopEdge, from, to)) {
						fail(
							`site line ${step.file}:${step.line} has no affinity with hop ${JSON.stringify(hopEdge.id)} (expected one of: ${walkthroughStepTokens(hopEdge, from, to).join(" | ")})`,
						);
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
		source: record.source,
		repo: record.repo,
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
		source?: string;
		repo?: { owner: string; name: string };
		repoRoot?: string;
		repoRoots?: Record<string, string>;
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
			| "source"
			| "repo"
			| "repoRoot"
			| "repoRoots"
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

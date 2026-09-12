/**
 * The cross-process RPC contract for Principal Studio.
 *
 * Single source of truth for the electrobun RPC schema and every payload type
 * that crosses the bun-host / webview boundary. Both `src/bun/index.ts` (host,
 * wrapped in `RPCSchema<…>` from electrobun/bun) and `src/mainview/…`
 * (renderer, passed to `Electroview.defineRPC`) import from here instead of
 * re-declaring the same interfaces — everything here is a compile-time type, so
 * the two processes share it with zero runtime coupling.
 *
 * Only the wire-facing types live here. Host-internal state (tab lifecycle,
 * caches) and renderer-only state machines (`TabState`) stay on their side.
 */

import type { AgentSessionEvent } from "@principal-ai/agent-monitoring";
import type {
	SubsystemComponent,
	SubsystemComponentEdge,
	SubsystemDeclarationRef,
	SubsystemEdgeMechanism,
	SubsystemModelDocument,
	SubsystemRelation,
	SubsystemRelationType,
	SubsystemWalkthrough,
	SubsystemWalkthroughMechanism,
	SubsystemWalkthroughStep,
} from "@principal-ai/subsystems-react";

/** Canonical subsystem-model types, re-shared with both processes. */
export type {
	SubsystemComponent,
	SubsystemComponentEdge,
	SubsystemModelDocument,
	SubsystemEdgeMechanism,
	SubsystemRelation,
	SubsystemRelationType,
	SubsystemWalkthrough,
	SubsystemWalkthroughMechanism,
	SubsystemWalkthroughStep,
};

export type ViewerMode = "local" | "remote";
export type PayloadKind = "trail" | "tour";

/**
 * Which permanent tabs appear in the strip by default. Toggled from the
 * header Settings modal; persisted host-side under
 * `~/.principal/principal-studio-settings.json`. All default to true.
 */
export interface DefaultTabFlags {
	/** Agent Sessions overview tab. */
	sessions: boolean;
	/** Historical Maintain sessions overview tab. */
	maintenanceSessions: boolean;
	/** Trails library tab. */
	trails: boolean;
	/** Graphify repos tab. */
	graphify: boolean;
	/** Subsystems list tab. */
	subsystems: boolean;
	/** OpenCode V2 debug / runtime tab. */
	opencodeV2: boolean;
}

export interface ViewerSettings {
	defaultTabs: DefaultTabFlags;
	/**
	 * When true, agent-proposed subsystem model corrections are applied
	 * immediately. Default false — user confirms each proposal first.
	 */
	autoAcceptSubsystemModelProposals: boolean;
	/**
	 * OpenCode model for Maintain agents (`provider/id`).
	 * `null` = auto-pick a free-tier model from `opencode models`.
	 */
	subsystemMaintainerModel: string | null;
	/**
	 * When true, the host periodically dry-runs audit across all stored
	 * subsystem models while Studio is open. Default true.
	 */
	regularAuditEnabled: boolean;
	/**
	 * Minutes between regular audit passes. Clamped on load (min 5).
	 * Default 5.
	 */
	regularAuditIntervalMinutes: number;
}

/** Live status of the host regular-audit scheduler (for countdown UI). */
export interface RegularAuditStatus {
	enabled: boolean;
	intervalMinutes: number;
	/** True while a pass is auditing models. */
	running: boolean;
	/**
	 * ISO timestamp of the next scheduled pass when enabled and idle.
	 * `null` when disabled or currently running.
	 */
	nextAuditAt: string | null;
}

/** Partial update accepted by `setSettings` — nested objects are merged. */
export interface PartialViewerSettings {
	defaultTabs?: Partial<DefaultTabFlags>;
	autoAcceptSubsystemModelProposals?: boolean;
	/** Pass `null` to clear a manual pick and return to auto free-tier. */
	subsystemMaintainerModel?: string | null;
	regularAuditEnabled?: boolean;
	regularAuditIntervalMinutes?: number;
}

export interface RepoInfo {
	root: string;
	fileCount: number;
	owner: string | null;
	name: string | null;
	editing: boolean;
}

export interface SessionSummary {
	id: string;
	title: string;
	slug: string;
	createdAt: string;
	lastEventAt?: string;
	durationMs: number;
	eventCount: number;
	isFinished: boolean;
	repoRoot?: string;
	repos?: RepoInfo[];
	agent?: string;
	/**
	 * OpenCode durable identity when known: `session_v2` → v2, `session` → v1.
	 * Used to badge V2 Maintain / Agent Sessions in the drawer.
	 */
	opencodeKind?: "v1" | "v2";
	/** Distinct model ids the session used, in first-use order. */
	models?: string[];
}

export interface SessionGroup {
	parent: SessionSummary;
	children: SessionSummary[];
}

export interface SessionEventRow {
	seq: number;
	type: string;
	raw: unknown;
	normalized: Record<string, unknown>;
	accumulated: AgentSessionEvent | null;
}

// ---------------------------------------------------------------------------
// Concept analyses — the shared shape for "a session analyzed into concept
// cards". The renderer's curated registry (`src/mainview/concepts.ts`) aliases
// these types so hand-curated cards and agent-extracted cards are the same
// shape on the wire and on the feed.
// ---------------------------------------------------------------------------

export type ConceptChangeType =
	| "execution" // timing: when X happens relative to Y (reveal, defer, refresh)
	| "derive" // single source of truth / canonical identity
	| "integration" // how an embedded component integrates with its host
	| "ui"; // building a UI surface / view

/** One concept card, either hand-curated or extracted by an agent. */
export interface ConceptCardData {
	id: string;
	title: string;
	changeType: ConceptChangeType;
	/** Optional phase — lets us sort/filter as the set grows. */
	status?: "draft" | "refining" | "stable";
	/** Sessions that surfaced or refined this concept (grouped here). */
	sessionIds: string[];
	/** Repositories the concept's sessions worked in (owner/name pairs). */
	repos: Array<{ owner: string; name: string }>;
	/** One-to-two sentence description for the card's left pane. */
	description: string;
	/** Short bullet points that state the key idea. */
	points: string[];
	/** Mermaid source for the right (diagram) side of the card. */
	mermaid: string;
	/** Optional rich markdown prose (paragraphs, lists, tables, blockquotes)
	 *  for slide presentation. When absent, renderers derive a slide from
	 *  `description` + `points`. */
	markdown?: string;
	/** Purl file-refs (`pkg:<type>/<owner>/<name>#<repo-root-relative-path>`)
	 *  the concept is about — click-to-open sources. Resolved by the host via
	 *  `openFile`. Optional; extracted cards may carry 1–3 of these. */
	files?: string[];
	/** Arc-analysis shape: `arc` = a main thread of the session, `detour` = a
	 *  self-contained deviation (problem → fix → back). Absent on curated
	 *  cross-session cards. */
	arcKind?: "arc" | "detour";
	/** 1-based beat indices this arc/detour spans (the session's beats, as
	 *  numbered by the host beat analyzer). Present on arc-extracted cards. */
	keyBeats?: number[];
}

/**
 * Subsystem snapshots — the durable, verifiable record of a concept being
 * worked on or analyzed (see the "Subsystem artifact: facets" topic). A session
 * may touch several subsystems, so an analysis can carry multiple snapshots.
 *
 * Facets: entry points (the verifiable currency), integration edges (the
 * composable currency), files (membership), tests (how it's tested, separate
 * from how it exists), and the per-capture sequence + component graphs.
 */

export type SubsystemEntryPointKind =
	| "class"
	| "function"
	| "interface"
	| "type"
	| "const"
	| "method";

/** A verifiable symbol the subsystem exposes. `signature` is the verbatim
 *  source line, captured so a verifier can re-check the artifact against the
 *  codebase without session context. */
export interface SubsystemEntryPoint {
	symbol: string;
	kind: SubsystemEntryPointKind;
	/** Purl file-ref (`pkg:<type>/<owner>/<name>#<path>`) where it lives. */
	file: string;
	line?: number;
	signature?: string;
}

export interface SubsystemFileRef {
	/** Purl file-ref. */
	purl: string;
	role: "core" | "supporting";
	/** One-line purpose so graphs/tables read without knowing every file. */
	purpose?: string;
}

export type SubsystemIntegrationMechanism =
	| "imports"
	| "calls"
	| "extends"
	| "registers-into";

export interface SubsystemIntegration {
	/** Target component/subsystem/purl the edge points at. */
	to: string;
	mechanism: SubsystemIntegrationMechanism;
	/** Concrete file/symbol refs backing the edge (the seam). */
	refs: string[];
}

export interface SubsystemTestSuite {
	/** Purl of the test file. */
	file: string;
	/** Entry-point symbols this suite exercises. */
	exercises: string[];
	/** What the suite pins, in words. */
	verifies?: string;
}

export interface SubsystemSnapshot {
	id: string;
	/** Stable name of the concept being worked on. */
	name: string;
	description?: string;
	repo?: { owner: string; name: string };
	files: SubsystemFileRef[];
	entryPoints: SubsystemEntryPoint[];
	integrations: SubsystemIntegration[];
	/** Purl file-refs of fixtures the subsystem is built against. */
	fixtures: string[];
	testSuites: SubsystemTestSuite[];
	/** Component graph (kind-tagged components) — the stable substrate. */
	graphMermaid?: string;
	/** Sessions that refined this snapshot (appended on recurrence). */
	sessionIds: string[];
}

/** On-disk record for a persisted subsystem graph. */
export interface StoredSubsystemModel {
	id: string;
	title: string;
	description?: string;
	components: SubsystemComponent[];
	relations: SubsystemRelation[];
	/** Ordered runtime walkthroughs (one per flow). */
	walkthroughs?: SubsystemWalkthrough[];
	createdAt: string;
	updatedAt: string;
	/** Host-local: when a viewer last opened this graph (machine-specific). */
	lastOpenedAt?: string;
	source?: string;
	repo?: { owner: string; name: string };
	/** Local root component `file` paths resolve against (sandboxed reads). */
	repoRoot?: string;
	/**
	 * Per-repo local roots for multi-repo graphs, keyed by purl repo key
	 * (`pkg:github/owner/name`, fragment stripped).
	 */
	repoRoots?: Record<string, string>;
	/**
	 * Host-only GitHub gist link. Not portable — used so Share as gist can
	 * PATCH an existing gist instead of minting a duplicate.
	 */
	gist?: { id: string; fileName?: string };
}

/**
 * Whether a subsystem's component purls have a graphify graph for the
 * **current** HEAD(+dirty) checkout — same bar as Alexandria "Up to date".
 */
export type SubsystemGraphifyAggregateStatus =
	| "possible"
	| "partial"
	| "not_ready"
	| "running"
	| "unavailable";

export type SubsystemGraphifyPurlStatus =
	| "ready"
	| "missing"
	| "building"
	| "unavailable";

export interface SubsystemGraphifyPurlReadiness {
	purl: string;
	status: SubsystemGraphifyPurlStatus;
	repoRoot?: string;
}

export interface SubsystemGraphifyReadiness {
	status: SubsystemGraphifyAggregateStatus;
	purls: SubsystemGraphifyPurlReadiness[];
}

/** Lightweight listing row for the Subsystems tab (no components/edges). */
export interface SubsystemModelSummary {
	id: string;
	title: string;
	description?: string;
	componentCount: number;
	edgeCount: number;
	createdAt: string;
	updatedAt: string;
	/** Host-local: when a viewer last opened this graph (never opened = absent). */
	lastOpenedAt?: string;
	source?: string;
	repo?: { owner: string; name: string };
	/** Absolute path to the persisted JSON (`~/.principal/subsystem-models/<id>.json`). */
	path: string;
	/** Host-only gist link when this model has been shared. */
	gist?: { id: string; fileName?: string };
	/** Graphify cache readiness for this graph's component purls. */
	graphify?: SubsystemGraphifyReadiness;
	/**
	 * Last persisted dry-run audit for this model (host-only).
	 * `stale` means inputs changed since `checkedAt` — re-audit recommended.
	 */
	lastAudit?: {
		checkedAt: string;
		needsUpdate: boolean;
		issueCount: number;
		/** fully_verified | partially_verified (gaps only) | issues (verification failed). */
		verdict: "fully_verified" | "partially_verified" | "issues";
		stale: boolean;
	};
	/** Pending agent correction proposals awaiting confirm. */
	pendingProposalCount?: number;
}

/** Result of verifying one subsystem component (declaration-panel Verify). */
export interface SubsystemComponentVerificationResult {
	ok: boolean;
	error?: string;
	/** Stable code for agents (`construct_mismatch` | `construct_unconfirmed` | `signature_mismatch`). */
	code?: "construct_mismatch" | "construct_unconfirmed" | "construct_unknown" | "signature_mismatch" | string;
	componentId?: string;
	/** Filesystem check against the local checkout. */
	file?: {
		exists: boolean;
		symbolDeclared?: boolean | null;
		repoRoot?: string;
	};
	/**
	 * When the claimed file is missing but Graphify has exactly one definition
	 * for the claimed symbol at another path that exists on disk.
	 */
	fileSuggest?: {
		file: string;
		nodeId?: string;
		label?: string;
	};
	/**
	 * When the claimed file is missing and Graphify has the symbol in multiple
	 * files — agent judgment required (no deterministic fix).
	 */
	fileCandidates?: Array<{
		file: string;
		nodeId?: string;
		label?: string;
	}>;
	/** Graphify cache status for the component's purl. */
	cache?: {
		status: "ready" | "missing" | "unavailable";
		purl: string;
		repoRoot?: string;
	};
	/** Anchor into graph.json when cache is ready. */
	anchor?: {
		resolution: "exact" | "file-only" | "ambiguous" | "missing";
		nodeId?: string;
		label?: string;
		source_file?: string;
		source_location?: string;
		candidates?: Array<{
			nodeId: string;
			label: string;
			source_file?: string;
			source_location?: string;
		}>;
	};
	/**
	 * Construct check after an exact anchor (skipped for `external` / non-exact).
	 * Hard-fail (`ok: false`) only on known inferred ≠ claimed.
	 * `match: null` means inferred was `unknown` — unconfirmed, for agent follow-up.
	 */
	construct?: {
		claimed: string;
		inferred: "class" | "function" | "method" | "type" | "module" | "unknown";
		/** true = match, false = known mismatch, null = unconfirmed (inferred unknown). */
		match: boolean | null;
		evidence?: string[];
	};
	/**
	 * Signature / params check for function|method after kind ok.
	 * Compares named type bags from authored declaration vs graphify
	 * `parameter_type` / `return_type` edges. Skipped when graphify has no
	 * signature edges (common for many TS functions today).
	 */
	signature?: {
		match: boolean;
		skipped: boolean;
		reason?: string;
		/** Granular skip classification (no_claimed_types | generic_arg_only | partially_generic_arg | unresolved_claimed_types). */
		skipCode?: string;
		claimed: { parameterTypes: string[]; returnTypes: string[] };
		inferred: {
			parameterTypes: string[];
			returnTypes: string[];
			/** Graphify `inline_parameter` marker count (anonymous eager args). */
			inlineParameters?: number;
		};
	};
	/** Declaration start-line anchor + freshness (exact anchor + readable file). */
	declaration?: {
		freshness: "valid" | "stale" | "missing" | "unanchored" | "unchecked";
		ref?: SubsystemDeclarationRef;
		liveLineHash?: string;
	};
}

/** One finding from a dry-run deterministic subsystem-model audit. */
export type SubsystemModelAuditFindingKind =
	| "missing_file"
	| "missing_symbol"
	| "walkthrough"
	| "stale_declaration"
	| "construct_mismatch"
	| "construct_unconfirmed"
	| "signature_mismatch"
	| "signature_unconfirmed"
	| "anchor"
	| "unresolved";

export type SubsystemModelAuditSeverity = "error" | "warn" | "info";

/**
 * Deterministic fix the user can apply from the audit UI (no agent).
 */
export type SubsystemModelAuditFix =
	| {
			id: "adopt_graphify_signature";
			label: string;
			parameterTypes: string[];
			returnTypes: string[];
	  }
	| {
			id: "adopt_graphify_file";
			label: string;
			/** New file path from Graphify’s definition node. */
			file: string;
			previousFile?: string;
	  }
	| {
			id: "adopt_graphify_declaration_ref";
			label: string;
			/** Re-pin from Graphify `source_location` + current line hash. */
			declarationRef: SubsystemDeclarationRef;
			previousStartLine?: number;
	  };

export interface SubsystemModelAuditFinding {
	kind: SubsystemModelAuditFindingKind;
	severity: SubsystemModelAuditSeverity;
	componentId?: string;
	componentName?: string;
	walkthroughId?: string;
	step?: number;
	message: string;
	/** Present when a one-click deterministic fix is available. */
	fix?: SubsystemModelAuditFix;
}

/** Per-component checklist of what the deterministic audit actually inspected. */
export interface SubsystemModelAuditCheck {
	componentId: string;
	componentName?: string;
	construct?: string;
	symbol?: string;
	file?: string;
	/** null = not applicable / unresolved root. */
	fileExists: boolean | null;
	/** null = no symbol claimed or file unresolved. */
	symbolDeclared: boolean | null;
	declarationFreshness?:
		| "valid"
		| "stale"
		| "missing"
		| "unanchored"
		| "unchecked"
		| "n/a";
	constructMatch?: boolean | null;
	/** Claimed construct from the model (when construct was checked). */
	constructClaimed?: string;
	/** Construct inferred from graphify structure (when construct was checked). */
	constructInferred?: string;
	/** Evidence strings from construct inference (when available). */
	constructEvidence?: string[];
	signature?: "match" | "mismatch" | "skipped" | "n/a";
	anchor?: "exact" | "file-only" | "ambiguous" | "missing" | "n/a";
	/**
	 * Whether graphify confirmed this component:
	 * `confirmed` = exact anchor in cache; `weak` = cache ready but not exact;
	 * `unavailable` = no usable cache; `skipped` = external / no source check.
	 */
	graphify: "confirmed" | "weak" | "unavailable" | "skipped";
	verdict: "ok" | "issue" | "skipped";
	note?: string;
}

/** Aggregated dry-run audit report (also persisted under ~/.principal/subsystem-model-audits). */
export interface SubsystemModelAuditReport {
	graphId: string;
	title: string;
	checkedAt: string;
	needsUpdate: boolean;
	summary: {
		components: number;
		filesVerified: number;
		symbolsVerified: number;
		declarationsValid: number;
		constructsMatched: number;
		signaturesMatched: number;
		anchorsExact: number;
		/** Components with an exact graphify anchor (graphify-confirmed). */
		graphifyConfirmed: number;
		externalsSkipped: number;
		missingFiles: number;
		missingSymbols: number;
		walkthroughFailures: number;
		staleDeclarations: number;
		constructMismatches: number;
		signatureMismatches: number;
		weakAnchors: number;
		unresolved: number;
		ok: number;
	};
	/** What was inspected, one row per component — shown even when clean. */
	checks: SubsystemModelAuditCheck[];
	findings: SubsystemModelAuditFinding[];
}

/** One field-level correction an agent proposes for user confirmation. */
export type SubsystemModelProposalChange =
	| {
			target: "component";
			componentId: string;
			field: "file" | "symbol" | "construct" | "name" | "purl";
			/** `null` clears an optional field (e.g. symbol). */
			value: string | null;
	  }
	| {
			target: "component";
			componentId: string;
			field: "declarationRef";
			value: SubsystemDeclarationRef | null;
	  }
	| {
			target: "walkthrough-step";
			walkthroughId: string;
			stepIndex: number;
			field: "file" | "line" | "symbol" | "from" | "to" | "mechanism" | "annotation";
			value: string | number | null;
	  }
	| {
			/**
			 * Confirm a sparse fact about a codebase symbol when graphify left it
			 * thin (e.g. construct unclassified). Accept writes the augmentation
			 * store — it does not change the model JSON.
			 */
			target: "augmentation";
			componentId: string;
			field: "construct";
			value: string;
			/** Defaults from the component when omitted. */
			file?: string;
			symbol?: string;
			purl?: string;
	  }
	| {
			/**
			 * Confirm named param/return types when Graphify has no signature edges.
			 * Accept writes the augmentation store.
			 */
			target: "augmentation";
			componentId: string;
			field: "signature";
			value: { parameterTypes: string[]; returnTypes: string[] };
			file?: string;
			symbol?: string;
			purl?: string;
	  };

export type SubsystemModelProposalStatus = "pending" | "accepted" | "rejected";

/** Before/after row captured at propose time for the confirm UI. */
export interface SubsystemModelProposalPreviewRow {
	label: string;
	before: unknown;
	after: unknown;
}

/**
 * Agent-authored correction awaiting (or after) human confirmation.
 * Persisted under ~/.principal/subsystem-model-proposals/<graphId>.json
 */
export interface SubsystemModelProposal {
	id: string;
	graphId: string;
	status: SubsystemModelProposalStatus;
	createdAt: string;
	resolvedAt?: string;
	/** Why the agent wants this change. */
	rationale: string;
	/** Optional link back to a deterministic audit finding. */
	finding?: {
		kind?: string;
		severity?: string;
		componentId?: string;
		componentName?: string;
		walkthroughId?: string;
		step?: number;
		message?: string;
	};
	changes: SubsystemModelProposalChange[];
	preview: SubsystemModelProposalPreviewRow[];
	/** Free-form author tag (e.g. agent name). */
	author?: string;
}

/** Cached graphify knowledge-graph slot under ~/.principal/graphify-graphs. */
export interface GraphifyGraphSummary {
	purl: string;
	purlKey: string;
	headSha: string;
	dirtyHash: string | null;
	slotKey: string;
	repoRoot: string;
	builtAt: string;
	nodeCount: number;
	edgeCount: number;
	graphJsonPath: string;
}

export interface GraphifyCliStatus {
	installed: boolean;
	bin: string | null;
	conventionalBin: string;
	installCommand: string;
	installedVersion: string | null;
	latestVersion: string | null;
	updateAvailable: boolean | null;
	/** Host is running install/update/uninstall in the background. */
	cliBusy?: "install" | "update" | "uninstall" | null;
}

/** OpenCode V2 (`opencode2`) CLI status for the debug / Maintain runtime tab. */
export interface OpencodeV2Status {
	installed: boolean;
	bin: string | null;
	conventionalBin: string;
	installCommand: string;
	installedVersion: string | null;
	latestVersion: string | null;
	updateAvailable: boolean | null;
	/** Host is running install/update in the background. */
	cliBusy?: "install" | "update" | null;
}

/** One SSE event captured during an OpenCode V2 debug probe. */
export interface OpencodeV2ProbeEvent {
	at: number;
	type: string;
	sessionId?: string;
	summary: string;
}

/** Live state for the OpenCode V2 debug probe session + event feed. */
export interface OpencodeV2ProbeState {
	status: "idle" | "starting" | "running" | "done" | "error";
	sessionId: string | null;
	events: OpencodeV2ProbeEvent[];
	error: string | null;
}

/** Installed Subsystems Studio vs latest on npm (for the header Update button). */
export interface StudioVersionStatus {
	installedVersion: string | null;
	latestVersion: string | null;
	updateAvailable: boolean | null;
	/** `npm` = published install; `source` = repo checkout (in-app update disabled). */
	channel: "npm" | "source" | "unknown";
	busy?: boolean;
}

/** Alexandria repo crossed with graphify cache status for the Graphify tab. */
export interface GraphifyRepoEntry {
	path: string;
	owner: string;
	name: string;
	purl: string;
	headSha: string;
	dirtyHash: string | null;
	slotKey: string;
	/** ready = cache matches HEAD(+dirty); building = ensure in flight; missing = needs a run. */
	status: "ready" | "missing" | "building";
	cached: {
		slotKey: string;
		nodeCount: number;
		edgeCount: number;
		builtAt: string;
		graphJsonPath: string;
		matchesCurrent: boolean;
	} | null;
}

/** A concept card deliberately saved out of an analysis. Carries the full card
 *  (a copy — safe from later re-extraction) plus provenance. What the Concepts
 *  tab renders. */
export interface SavedConcept extends ConceptCardData {
	/** Stable store key — `saved-<analysisId>-<cardId>`. */
	savedConceptId: string;
	/** Where the card came from. `analysis` today; reserved for future curated
	 *  imports. */
	source: "curated" | "analysis";
	/** The analysis this card was saved out of, when `source === "analysis"`. */
	sourceAnalysisId?: string;
	/** The session that analysis covers, when `source === "analysis"`. */
	sourceSessionId?: string;
	savedAt: string;
}

export type AnalysisStatus = "pending" | "done" | "error";

/** The extractor prompt surfaces: what the agent is asked, verbatim. Served as
 *  the payload of a `kind: "prompt"` tab. */
export interface ExtractionPromptInfo {
	/** opencode agent name the run invokes. */
	agent: string;
	/** Model passed via `-m` on the run. */
	model: string;
	/** The agent's system prompt, read from its config file on disk. */
	systemPrompt: string;
	/** The task message template — `<session title>` is the interpolation point. */
	taskTemplate: string;
	/** Absolute path of the agent file the system prompt was read from. */
	agentPath: string;
}

/** Full record for one analyzed session, stored host-side on disk. */
export interface ConceptAnalysis {
	id: string;
	sessionId: string;
	sessionTitle?: string;
	sessionSlug?: string;
	agent?: string;
	createdAt: string;
	status: AnalysisStatus;
	/** Model that produced the extraction (the opencode run's model). */
	model?: string;
	/** Present when `status === "error"`. */
	error?: string;
	/** Concept cards teased out of the session. Empty until `status === "done"`. */
	concepts: ConceptCardData[];
	/** Subsystem snapshots teased out of the session — one per subsystem the
	 *  session worked on or analyzed. Empty until `status === "done"`. */
	subsystems?: SubsystemSnapshot[];
}

/** Row in the analyses index — enough to surface state + count without the cards. */
export interface AnalysisSummary {
	id: string;
	sessionId: string;
	sessionTitle?: string;
	status: AnalysisStatus;
	createdAt: string;
	conceptCount: number;
}

export interface TabSummary {
	id: string;
	kind: "library" | "trail" | "agent-sessions" | "maintenance-sessions" | "analysis" | "session-events" | "prompt" | "subsystem-model" | "subsystems" | "graphify" | "opencode-v2" | "maintain-events";
	title: string;
	mode?: ViewerMode;
	payloadKind?: PayloadKind;
	/** For `subsystem-model` tabs — absolute path to the persisted JSON. */
	path?: string;
}

export interface TabFullState {
	ok: boolean;
	error?: string;
	id: string;
	kind: "library" | "trail" | "agent-sessions" | "maintenance-sessions" | "analysis" | "session-events" | "prompt" | "subsystem-model" | "subsystems" | "graphify" | "opencode-v2" | "maintain-events";
	title: string;
	mode?: ViewerMode;
	payloadKind?: PayloadKind;
	repoRoot?: string;
	trailFilePath?: string;
	sessionId?: string;
	/** For `session-events` / `maintain-events` — agent label when known. */
	agent?: string;
	/** For `analysis` tabs — the analysis id the tab renders. */
	analysisId?: string;
	/** For `subsystem-model` tabs — the graph id the tab renders. */
	graphId?: string;
	payload?: unknown;
	/** Repo identity resolved host-side (git origin / explicit remote).
	 *  `owner === "local"` means no GitHub origin was found; any other owner is a
	 *  GitHub identity the header can link to. Mirrors the library rows. */
	owner?: string;
	repo?: string;
}

export interface LibraryEntry {
	/** "trail" or a File City introduction "tour". Drives the row badge and how
	 *  the row opens (tours are always local-mode). */
	kind: "trail" | "tour";
	trailFile: string;
	id: string;
	title: string;
	anchor: string; // "<ns>/<name>" or "by-id"
	owner?: string;
	repo?: string;
	/**
	 * For local-purl trails (`pkg:generic/local/<slug>`) whose decoded slug
	 * resolves to an existing directory on disk. When set, clicking the entry
	 * opens the trail in `local` mode anchored here, so slice resolution reads
	 * from the working tree instead of trying to fetch from GitHub.
	 */
	localRepoRoot?: string;
	/**
	 * True when the trail file carries a `share.id` — i.e. it has been published
	 * to web-ade. Drives the Draft/Published badge in the library list. Read-only
	 * derivation of the existing share field; no new on-disk state.
	 */
	published: boolean;
	mtimeMs: number;
}

/** Local `git config user.name` / `user.email`. */
export interface GitConfigIdentity {
	name?: string;
	email?: string;
}

/** Identity of the person using the viewer, resolved host-side from
 *  gh CLI → TRAIL_GH_TOKEN → git config. */
export interface UserIdentity {
	login?: string;
	name?: string;
	avatarUrl?: string;
	htmlUrl?: string;
	source: "gh" | "token" | "git" | "none";
	/** Local git config, always read even when signed in to GitHub. */
	git?: GitConfigIdentity;
}

/** Status of the opencode v2 server, probed host-side the same way opencode's
 *  own daemon does it: read the registration (`server.json` in the opencode
 *  state dir) for the URL, read the `password` file for Basic auth, then GET
 *  `/api/health`. `running: false` also covers "no registration on disk" (the
 *  server was never started / has exited). */
export interface OpencodeServerStatus {
	running: boolean;
	/** The server's URL when running, e.g. `http://127.0.0.1:4096`. */
	url?: string;
	/** opencode version from the registration file, when running. */
	version?: string;
}

/** One session in the header's server-session list — active now, or active
 *  within the recent window. `lastEvent` is the most recent event the host's
 *  `/api/event` subscription has seen for the session (type + wall-clock time);
 *  it keeps moving while the session works, even between list polls. */
export interface ServerSessionRow {
	sessionId: string;
	/** Session title from the server's list response. */
	title?: string;
	/** Live state from `/api/session/status` or `session.status` events.
	 *  Absent means idle (the server's status map deletes idle entries). */
	status?: "busy" | "retry" | "idle";
	/** The provider error on a `retry` status, when reported. */
	retryMessage?: string;
	/** Epoch ms of the session's last update (from the list response or an
	 *  observed event). */
	updatedAt?: number;
	lastEvent?: { type: string; at: number };
}

/** The renderer → host request surface. Keyed by RPC name. Defined as a `type`
 *  (not `interface`) so it satisfies electrobun's index-signature schema
 *  constraint (`{ [key: string]: { params; response } }`) on both sides. */
export type StudioRequests = {
	listTabs: {
		params: Record<string, never>;
		response: {
			tabs: TabSummary[];
			/** Which tab the host suggests showing: the boot start tab, a trail
			 *  seeded by LOAD_TRAIL, or the last tab the renderer reported via
			 *  setActiveTab. The renderer owns the active tab; it applies this
			 *  only as its initial/resume value (until the user clicks). */
			suggestedActiveTabId: string;
		};
	};
	getTab: {
		params: { id: string };
		response: TabFullState;
	};
	setActiveTab: {
		params: { id: string };
		response: { ok: boolean; error?: string };
	};
	closeTab: {
		params: { id: string };
		response: { ok: boolean; error?: string };
	};
	readFile: {
		params: { tabId: string; path: string; repo?: string };
		response: { ok: boolean; content?: string; error?: string };
	};
	getFileTree: {
		params: { tabId: string; path?: string };
		response: { files: Array<{ path: string; size: number }> };
	};
	listTrails: {
		params: Record<string, never>;
		response: { entries: LibraryEntry[] };
	};
	listSessions: {
		/** How many days back to list (opencode applies it as the SQL cutoff;
		 *  cline/pi/grok return their full lists and the renderer window-filters).
		 *  Defaults to 7 when omitted. */
		params: { days?: number };
		response: {
			groups: SessionGroup[];
			standalone: SessionSummary[];
			/** True when opencode has at least one session older than the requested
			 *  window — the signal for the renderer's "Load more" affordance. */
			hasMore?: boolean;
		};
	};
	/** Historical Maintain sessions only (from opencode.db). Not live SSE. */
	listMaintainSessions: {
		params: { days?: number; limit?: number };
		response: {
			sessions: SessionSummary[];
			hasMore?: boolean;
		};
	};
	getSessionEvents: {
		params: {
			sessionId: string;
			/** Include the full raw event payloads. Off by default because raw
			 *  payloads reach hundreds of MB per session; the session-events tab
			 *  (the raw → normalized → accumulated feed) requests them. */
			includeRaw?: boolean;
			/** Page window over the built event set (by seq). The session-events
			 *  tab pages so each RPC message stays bounded instead of shipping
			 *  the whole session's raw payloads at once. */
			offset?: number;
			limit?: number;
			/** Serve the processed timeline from the on-disk session cache.
			 *  Defaults to true. Live refreshes (the 30s poll of working
			 *  sessions) pass false so a growing session is always re-processed
			 *  from raw rather than served stale. */
			useCache?: boolean;
		};
		response: {
			ok: boolean;
			error?: string;
			events?: SessionEventRow[];
			/** Total rows in the built set, for pagination. */
			total?: number;
			/** True when more rows exist beyond this page. */
			hasMore?: boolean;
			repoRoot?: string;
			repos?: RepoInfo[];
			session?: { slug: string; title: string; agent?: string };
		};
	};
	getAgentSessionsOverview: {
		/** How many days back the overview covers (defaults to 7). */
		params: {
			days?: number;
			/** `maintain` = historical Maintain runs only. Default `agents`. */
			scope?: "agents" | "maintain";
		};
		response: {
			ok: boolean;
			error?: string;
			groups: SessionGroup[];
			standalone: SessionSummary[];
			/** True when opencode has at least one session older than the
			 *  requested window — the signal for the renderer's "Load more"
			 *  affordance. */
			hasMore?: boolean;
			/** Every processed session in the window, with its full (trimmed)
			 *  event timeline, so the renderer can assemble the Agent Sessions
			 *  view from a single call instead of N getSessionEvents
			 *  round-trips. Served from the host's resident store / disk cache. */
			processed: Array<{
				id: string;
				agent: string;
				session: { slug: string; title: string; agent?: string };
				repoRoot?: string;
				repos: RepoInfo[];
				events: SessionEventRow[];
			}>;
		};
	};
	openSessionEventsTab: {
		params: { sessionId: string; title?: string; agent?: string };
		response: { ok: boolean; error?: string; tabId?: string };
	};
	openAnalysisTab: {
		params: { analysisId: string };
		response: { ok: boolean; error?: string; tabId?: string };
	};
	listAnalyses: {
		params: Record<string, never>;
		response: { analyses: AnalysisSummary[] };
	};
	/** Full analysis records (concept/arc cards included) — the renderer maps
	 *  each session's cards onto `AgentSessionView.arcs` so the panel can expand
	 *  arcs inline instead of only opening an analysis tab. */
	listAnalysesFull: {
		params: Record<string, never>;
		response: { analyses: ConceptAnalysis[] };
	};
	listSavedConcepts: {
		params: Record<string, never>;
		response: { concepts: SavedConcept[] };
	};
	saveConcept: {
		params: { analysisId: string; conceptId: string };
		response: {
			ok: boolean;
			error?: string;
			/** The saved record — an existing one when the card was already
			 *  saved (the action is idempotent). */
			savedConcept?: SavedConcept;
		};
	};
	unsaveConcept: {
		params: { savedConceptId: string };
		response: { ok: boolean; error?: string };
	};
	deleteAnalysis: {
		params: { analysisId: string };
		response: { ok: boolean; error?: string };
	};
	getSubsystemModel: {
		params: { graphId: string };
		response: { ok: boolean; error?: string; graph?: StoredSubsystemModel };
	};
	listSubsystemModels: {
		params: Record<string, never>;
		response: { graphs: SubsystemModelSummary[] };
	};
	openSubsystemModel: {
		params: { graphId: string };
		response: { ok: boolean; error?: string; tabId?: string };
	};
	deleteSubsystemModel: {
		params: { graphId: string };
		response: { ok: boolean; error?: string };
	};
	/**
	 * Publish the portable document for a stored model as a public GitHub
	 * gist. Creates on first share; PATCHes the linked gist when `gist` is
	 * already stamped on the record. Requires a local GitHub token
	 * (`gh auth token`, git credential helper, or `TRAIL_GH_TOKEN`).
	 */
	shareSubsystemModelAsGist: {
		params: { graphId: string };
		response: {
			ok: boolean;
			error?: string;
			gistId?: string;
			gistUrl?: string;
			viewUrl?: string;
			fileName?: string;
			created?: boolean;
		};
	};
	/**
	 * Verify one subsystem component against filesystem + graphify cache
	 * (anchor resolve). Does not run extract — cache must already be ready.
	 */
	verifySubsystemComponent: {
		params: { graphId: string; componentId: string };
		response: SubsystemComponentVerificationResult;
	};
	/**
	 * Dry-run deterministic audit of a whole subsystem model (files, symbols,
	 * declarations, graphify anchors). Does not mutate the stored graph.
	 * Persists the report under ~/.principal/subsystem-model-audits for reuse.
	 * Walkthrough affinity is not included — reserved for a later agent pass.
	 */
	auditSubsystemModel: {
		params: { graphId: string };
		response: {
			ok: boolean;
			error?: string;
			report?: SubsystemModelAuditReport;
			/** Fingerprint saved with the report (for stale detection). */
			fingerprint?: string;
		};
	};
	/**
	 * Apply a deterministic audit fix (e.g. adopt graphify signature bags when
	 * the model has no named types). Re-audits and returns the fresh report.
	 */
	applySubsystemModelAuditFix: {
		params: {
			graphId: string;
			fixId:
				| "adopt_graphify_signature"
				| "adopt_graphify_file"
				| "adopt_graphify_declaration_ref";
			/** One component, or omit to apply every adoptable instance of this fix. */
			componentId?: string;
		};
		response: {
			ok: boolean;
			error?: string;
			applied?: number;
			report?: SubsystemModelAuditReport;
			fingerprint?: string;
		};
	};
	/**
	 * Load the last persisted audit report for a model.
	 * `stale: true` when model/graphify inputs changed since the report was saved.
	 */
	getSubsystemModelAudit: {
		params: { graphId: string };
		response: {
			ok: boolean;
			error?: string;
			report?: SubsystemModelAuditReport;
			stale?: boolean;
			fingerprint?: string;
			checkedAt?: string;
		};
	};
	/** Pending (and optionally resolved) agent correction proposals for a model. */
	listSubsystemModelProposals: {
		params: { graphId: string; includeResolved?: boolean };
		response: {
			ok: boolean;
			error?: string;
			proposals?: SubsystemModelProposal[];
			pendingCount?: number;
		};
	};
	/**
	 * Record an agent correction proposal. Does not mutate the model unless
	 * `autoAcceptSubsystemModelProposals` is enabled in viewer settings.
	 */
	proposeSubsystemModelCorrection: {
		params: {
			graphId: string;
			rationale: string;
			changes: SubsystemModelProposalChange[];
			finding?: SubsystemModelProposal["finding"];
			author?: string;
		};
		response: {
			ok: boolean;
			error?: string;
			proposal?: SubsystemModelProposal;
			/** True when settings auto-accepted and the model was updated. */
			autoAccepted?: boolean;
		};
	};
	acceptSubsystemModelProposal: {
		params: { graphId: string; proposalId: string };
		response: {
			ok: boolean;
			error?: string;
			proposal?: SubsystemModelProposal;
		};
	};
	rejectSubsystemModelProposal: {
		params: { graphId: string; proposalId: string };
		response: {
			ok: boolean;
			error?: string;
			proposal?: SubsystemModelProposal;
		};
	};
	/**
	 * Start a background Maintain OpenCode run for this model.
	 * Host re-audits and routes: issues → issue-fixer, partially_verified →
	 * gap-filler, fully_verified → no-op. Progress via
	 * `subsystemModelMaintainChanged`. Does not auto-accept proposals.
	 */
	maintainSubsystemModel: {
		params: {
			graphId: string;
			/** OpenCode `provider/id`. Omit to use settings / auto free-tier. */
			model?: string;
			/** Persist `model` (or clear when null) as subsystemMaintainerModel. */
			remember?: boolean;
		};
		response: {
			ok: boolean;
			started?: boolean;
			error?: string;
			/** True when a run is already in flight for this graph. */
			alreadyRunning?: boolean;
		};
	};
	/**
	 * Free / configured OpenCode models for the subsystem maintainer.
	 * Today Studio auto-picks a free model; `configured` is reserved for a
	 * future explicit picker (`subsystemMaintainerModel` setting).
	 */
	getSubsystemMaintainerModels: {
		params: { refresh?: boolean };
		response: {
			ok: boolean;
			error?: string;
			/** Model that will be used on the next Maintain run. */
			resolved?: string;
			source?: "settings" | "env" | "auto" | "fallback";
			/** Persisted override, or null when auto. */
			configured?: string | null;
			freeModels?: Array<{
				ref: string;
				id: string;
				providerID: string;
				name?: string;
			}>;
		};
	};
	getGraphifyStatus: {
		params: { detailed?: boolean };
		response: GraphifyCliStatus;
	};
	getOpencodeV2Status: {
		params: { detailed?: boolean };
		response: OpencodeV2Status;
	};
	/**
	 * Install `@opencode-ai/cli@beta` globally when `opencode2` is missing.
	 * Returns immediately with `started` while work continues; listen for
	 * `opencodeV2Changed`.
	 */
	installOpencodeV2: {
		params: Record<string, never>;
		response: {
			ok: boolean;
			error?: string;
			started?: boolean;
			status?: OpencodeV2Status;
		};
	};
	/** Re-run npm install -g @opencode-ai/cli@beta when already installed. */
	updateOpencodeV2: {
		params: Record<string, never>;
		response: {
			ok: boolean;
			error?: string;
			started?: boolean;
			status?: OpencodeV2Status;
		};
	};
	/** Snapshot of the OpenCode V2 debug probe (session + event feed). */
	getOpencodeV2ProbeState: {
		params: Record<string, never>;
		response: OpencodeV2ProbeState;
	};
	/**
	 * Ensure the V2 service, open `/api/event`, create a short session, and
	 * prompt it. Events stream via `opencodeV2ProbeChanged`.
	 */
	startOpencodeV2Probe: {
		params: { message?: string; directory?: string };
		response: {
			ok: boolean;
			error?: string;
			started?: boolean;
			sessionId?: string;
		};
	};
	stopOpencodeV2Probe: {
		params: Record<string, never>;
		response: { ok: boolean };
	};
	/** Snapshot of a live OpenCode V2 session event feed (Maintain tab). */
	getOpencodeLiveFeed: {
		params: { sessionId: string };
		response: {
			ok: boolean;
			sessionId?: string;
			status?: "starting" | "running" | "done" | "error";
			events?: OpencodeV2ProbeEvent[];
			error?: string | null;
			title?: string;
			agent?: string;
			graphId?: string;
		};
	};
	/**
	 * Current Studio package version vs npm latest. When `detailed` is true the
	 * host also hits the registry (may return cached local status first while a
	 * background refresh is in flight — see `studioVersionChanged`).
	 */
	getStudioVersionStatus: {
		params: { detailed?: boolean };
		response: StudioVersionStatus;
	};
	/**
	 * Quit and relaunch via `npx @principal-ai/subsystems-studio@latest`.
	 * `started: true` means this process is about to exit.
	 */
	updateStudio: {
		params: Record<string, never>;
		response: {
			ok: boolean;
			error?: string;
			started?: boolean;
			status?: StudioVersionStatus;
		};
	};
	listGraphifyGraphs: {
		params: Record<string, never>;
		response: { graphs: GraphifyGraphSummary[] };
	};
	listGraphifyRepos: {
		params: Record<string, never>;
		response: { repos: GraphifyRepoEntry[]; graphify: GraphifyCliStatus };
	};
	/**
	 * Ensure a graphify graph for a repo. Cache hits may return immediately;
	 * extracts run in the background and return `status: "building"`. Completion
	 * is pushed via `graphifyChanged` (host RPC is capped at a few seconds).
	 */
	ensureGraphifyGraph: {
		params: {
			purl: string;
			repoRoot?: string;
			force?: boolean;
		};
		response: {
			ok: boolean;
			error?: string;
			code?: string;
			installCommand?: string;
			status?: "hit" | "built" | "building";
			purl?: string;
			headSha?: string;
			dirtyHash?: string | null;
			slotKey?: string;
			repoRoot?: string;
			graphJsonPath?: string;
			nodeCount?: number;
			edgeCount?: number;
			durationMs?: number;
		};
	};
	/**
	 * Install / update / uninstall start in the background when they would
	 * exceed the RPC window. `started: true` means listen for `graphifyChanged`.
	 */
	installGraphify: {
		params: Record<string, never>;
		response: {
			ok: boolean;
			error?: string;
			bin?: string;
			started?: boolean;
			status?: GraphifyCliStatus;
		};
	};
	updateGraphify: {
		params: Record<string, never>;
		response: {
			ok: boolean;
			error?: string;
			bin?: string;
			started?: boolean;
			status?: GraphifyCliStatus;
		};
	};
	uninstallGraphify: {
		params: Record<string, never>;
		response: {
			ok: boolean;
			error?: string;
			bin?: string;
			started?: boolean;
			status?: GraphifyCliStatus;
		};
	};
	openPromptTab: {
		params: Record<string, never>;
		response: { ok: boolean; error?: string; tabId?: string };
	};
	analyzeSession: {
		params: {
			sessionId: string;
			title?: string;
			agent?: string;
			/** Re-run an existing analysis: the record is reset to `pending` and
			 *  extraction restarts in place (same analysis id, so open tabs stay
			 *  wired to it). Defaults to false — without it an existing record
			 *  (even one in `error`) just re-opens its tab. */
			force?: boolean;
		};
		response: {
			ok: boolean;
			error?: string;
			/** The analysis id — an existing analysis for this session when one
			 *  already exists (the action is idempotent). */
			analysisId?: string;
			/** Tab id the analysis opened in, when a tab was created/activated. */
			tabId?: string;
		};
	};
	openTrailFromCache: {
		params: { trailFile: string; mode?: ViewerMode; repoRoot?: string };
		response: { ok: boolean; error?: string; tabId?: string };
	};
	createTrailNote: {
		params: { tabId: string; draft: unknown };
		response: { ok: boolean; error?: string; note?: unknown };
	};
	updateTrailNote: {
		params: { tabId: string; noteId: string; body: string };
		response: { ok: boolean; error?: string; note?: unknown };
	};
	deleteTrailNote: {
		params: { tabId: string; noteId: string };
		response: { ok: boolean; error?: string };
	};
	openExternal: {
		params: { url: string };
		response: { ok: boolean };
	};
	openFile: {
		params: { purl: string };
		response: { ok: boolean; error?: string };
	};
	shareTrail: {
		params: { tabId: string };
		response: {
			ok: boolean;
			error?: string;
			shareId?: string;
			shareUrl?: string;
		};
	};
	getUserIdentity: {
		params: Record<string, never>;
		response: UserIdentity;
	};
	/** Read the persisted viewer settings (default-tab visibility flags, etc.). */
	getSettings: {
		params: Record<string, never>;
		response: ViewerSettings;
	};
	/** Merge-patch viewer settings, persist, and re-sync permanent tabs. */
	setSettings: {
		params: { settings: PartialViewerSettings };
		response: { ok: boolean; settings: ViewerSettings; error?: string };
	};
	/** Live regular-audit scheduler status (countdown / running). */
	getRegularAuditStatus: {
		params: Record<string, never>;
		response: RegularAuditStatus;
	};
	getOpencodeServerStatus: {
		params: Record<string, never>;
		response: OpencodeServerStatus;
	};
	getServerSessions: {
		params: Record<string, never>;
		response: {
			ok: boolean;
			/** False when no opencode server registration is on disk. */
			running: boolean;
			error?: string;
			sessions: ServerSessionRow[];
		};
	};
	/** Start/stop the host's live `/api/event` subscription. While active, the
	 *  host broadcasts `serverEventsChanged` with each session's latest event
	 *  so the header's session list stays live without polling. */
	setServerEventWatch: {
		params: { active: boolean };
		response: { ok: boolean };
	};
}

/** Host → renderer notifications. Keyed by message name. */
export type StudioMessages = {
	/** Fired when the tab list changes (LOAD_TRAIL, close, host-initiated
	 *  opens). The renderer refreshes its registry from listTabs. `focusTabId`
	 *  is present when the host wants a specific tab on screen (a tab it just
	 *  created, or an external activation) — the renderer applies it to its own
	 *  active-tab state; when absent the renderer keeps its current selection. */
	tabsChanged: {
		focusTabId?: string;
	};
	/** The warm-up worker re-processed these sessions (a live-refresh request)
	 *  and their disk cache is now fresh. The renderer should re-fetch them. */
	sessionsUpdated: {
		sessionIds: string[];
	};
	/** Live "last event" updates for the sessions the host is watching via its
	 *  single `/api/event` subscription. Each row carries at least `sessionId`
	 *  plus `lastEvent` (and `status` when the last event was a status change).
	 *  The renderer merges these by `sessionId` into its list snapshot. */
	serverEventsChanged: {
		sessions: ServerSessionRow[];
	};
	/**
	 * Graphify background work finished or CLI status refreshed (PyPI check,
	 * install/update/uninstall, ensure extract). Renderer should refresh the
	 * Graphify tab / CLI modal from this instead of awaiting long RPCs.
	 */
	graphifyChanged: {
		kind: "cli" | "ensure" | "repos";
		status?: GraphifyCliStatus;
		/** Set when a background CLI action or ensure failed. */
		error?: string;
		purl?: string;
		ensure?: {
			ok: boolean;
			error?: string;
			code?: string;
			status?: "hit" | "built" | "building";
			nodeCount?: number;
			edgeCount?: number;
			durationMs?: number;
		};
	};
	/**
	 * A subsystem graph was created/updated/deleted via the store API, or its
	 * on-disk file changed under ~/.principal/subsystem-models (external edit).
	 * List tab should re-fetch; an open graph tab should reload when `graphId`
	 * matches.
	 */
	subsystemModelChanged: {
		graphId: string;
		reason: "created" | "updated" | "deleted" | "external";
	};
	/** Agent proposals created / accepted / rejected for a model. */
	subsystemModelProposalsChanged: {
		graphId: string;
		pendingCount: number;
	};
	/** Maintain agent run started / finished (issue-fixer or gap-filler). */
	subsystemModelMaintainChanged: {
		graphId: string;
		status: "running" | "done" | "error";
		error?: string;
		pendingCount?: number;
		summary?: string;
		/** OpenCode model used for the run. */
		model?: string;
		/** issue-fixer | gap-filler when an agent ran (or was selected). */
		agent?: "issue-fixer" | "gap-filler";
		/** True when audit was fully verified and no agent ran. */
		skipped?: boolean;
	};
	/** Host regular-audit scheduler status changed (enable/interval/tick/running). */
	regularAuditChanged: RegularAuditStatus;
	/** npm latest check finished (or failed). Header Update button should refresh. */
	studioVersionChanged: {
		status: StudioVersionStatus;
		error?: string;
	};
	/**
	 * OpenCode V2 CLI status refreshed (npm beta check, install/update finished).
	 * OpenCode V2 debug tab should refresh from this.
	 */
	opencodeV2Changed: {
		status: OpencodeV2Status;
		error?: string;
	};
	/** Live probe session + SSE event feed for the OpenCode V2 debug tab. */
	opencodeV2ProbeChanged: {
		state: OpencodeV2ProbeState;
	};
	/**
	 * Live OpenCode V2 SSE feed for a Maintain (or other agent) session tab.
	 * Keyed by sessionId; renderer merges into the open maintain-events tab.
	 */
	opencodeLiveFeedChanged: {
		sessionId: string;
		status: "starting" | "running" | "done" | "error";
		events: OpencodeV2ProbeEvent[];
		error?: string | null;
		title?: string;
		agent?: string;
		graphId?: string;
	};
}

/** The bun side of the RPC, wrapper-agnostic — host wraps it in
 *  `RPCSchema<…>`, the renderer passes it straight to `defineRPC<…>`. */
export interface StudioSchema {
	requests: StudioRequests;
	messages: StudioMessages;
}

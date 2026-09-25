/**
 * Subsystem model Maintain — OpenCode agents that review a deterministic
 * audit and submit correction proposals via Studio HTTP (human confirms).
 *
 * Routes by severity then lane (construct → static topology → package/module →
 * runtime topology):
 * - construct issues → construct-fixer
 * - broken relation endpoints → static-topology-fixer
 * - package/module issues → package-module-fixer
 * - construct unconfirmed → construct-verifier
 * - package/module unconfirmed → package-module-verifier
 * - process unconfirmed → runtime-topology-verifier
 * - relation unconfirmed → static-topology-verifier
 * - fully verified → no-op
 *
 * RPC returns immediately; the
 * OpenCode V2 session continues in the background (live SSE tab), then a push
 * notifies the UI.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { SubsystemModelAuditReport } from "../shared/contract";
import {
	classifyAuditReport,
	loadSubsystemModelAudit,
	type SubsystemModelAuditVerdict,
} from "./audit-report-store";
import { auditSubsystemModel } from "./verify-subsystem-component";
import {
	getSubsystemModel,
	resolveRepoRootForComponent,
	type StoredSubsystemModel,
} from "./subsystem-model-store";
import {
	pendingProposalCount,
	pendingProposalCountForRun,
} from "./proposal-store";
import {
	runMaintainSequence,
	type MaintainSequenceOutcome,
	type MaintainStageOutcome,
} from "./maintain-sequence";
import { resolveSubsystemMaintainerModel, modelProviderOf, FALLBACK_MAINTAINER_MODEL } from "./opencode-models";
import {
	firstActivityTimeoutMsFor,
	isModelUnusable,
	rememberModelUnusable,
} from "./maintainer-probe";
import { loadViewerSettings, patchViewerSettings } from "./viewer-settings";
import { runOpencodeV2AgentSession } from "./opencode-v2-live";
import {
	noteSubsystemModelRunFinish,
	noteSubsystemModelRunStart,
} from "./subsystem-model-runs";

export const CONSTRUCT_VERIFIER_AGENT = "construct-verifier";
export const STATIC_TOPOLOGY_VERIFIER_AGENT = "static-topology-verifier";
export const PACKAGE_MODULE_VERIFIER_AGENT = "package-module-verifier";
export const RUNTIME_TOPOLOGY_VERIFIER_AGENT = "runtime-topology-verifier";
export const CONSTRUCT_FIXER_AGENT = "construct-fixer";
export const STATIC_TOPOLOGY_FIXER_AGENT = "static-topology-fixer";
export const PACKAGE_MODULE_FIXER_AGENT = "package-module-fixer";

export type MaintainAgentId =
	| typeof CONSTRUCT_VERIFIER_AGENT
	| typeof STATIC_TOPOLOGY_VERIFIER_AGENT
	| typeof PACKAGE_MODULE_VERIFIER_AGENT
	| typeof RUNTIME_TOPOLOGY_VERIFIER_AGENT
	| typeof CONSTRUCT_FIXER_AGENT
	| typeof STATIC_TOPOLOGY_FIXER_AGENT
	| typeof PACKAGE_MODULE_FIXER_AGENT;

export type MaintainLayer = "construct" | "static-topology" | "dynamic-topology";
export type MaintainMode = "issues" | "verify";

export type MaintainRoute = {
	agent: MaintainAgentId;
	layer: MaintainLayer;
	mode: MaintainMode;
};

const AGENT_INSTALL_DIR = join(homedir(), ".config", "opencode", "agents");

function agentPackagePath(agent: MaintainAgentId): string {
	return join(import.meta.dir, "..", "..", "agents", `${agent}.md`);
}

function agentInstallPath(agent: MaintainAgentId): string {
	return join(AGENT_INSTALL_DIR, `${agent}.md`);
}

export const CONSTRUCT_FIXER_AGENT_PATH = agentInstallPath(CONSTRUCT_FIXER_AGENT);
export const CONSTRUCT_VERIFIER_AGENT_PATH = agentInstallPath(
	CONSTRUCT_VERIFIER_AGENT,
);
export const STATIC_TOPOLOGY_FIXER_AGENT_PATH = agentInstallPath(
	STATIC_TOPOLOGY_FIXER_AGENT,
);
export const STATIC_TOPOLOGY_VERIFIER_AGENT_PATH = agentInstallPath(
	STATIC_TOPOLOGY_VERIFIER_AGENT,
);
export const PACKAGE_MODULE_FIXER_AGENT_PATH = agentInstallPath(
	PACKAGE_MODULE_FIXER_AGENT,
);
export const PACKAGE_MODULE_VERIFIER_AGENT_PATH = agentInstallPath(
	PACKAGE_MODULE_VERIFIER_AGENT,
);
export const RUNTIME_TOPOLOGY_VERIFIER_AGENT_PATH = agentInstallPath(
	RUNTIME_TOPOLOGY_VERIFIER_AGENT,
);

const CONSTRUCT_FIXER_PACKAGE_PATH = agentPackagePath(CONSTRUCT_FIXER_AGENT);
const CONSTRUCT_VERIFIER_PACKAGE_PATH = agentPackagePath(CONSTRUCT_VERIFIER_AGENT);
const STATIC_TOPOLOGY_FIXER_PACKAGE_PATH = agentPackagePath(
	STATIC_TOPOLOGY_FIXER_AGENT,
);
const STATIC_TOPOLOGY_VERIFIER_PACKAGE_PATH = agentPackagePath(
	STATIC_TOPOLOGY_VERIFIER_AGENT,
);
const PACKAGE_MODULE_FIXER_PACKAGE_PATH = agentPackagePath(
	PACKAGE_MODULE_FIXER_AGENT,
);
const PACKAGE_MODULE_VERIFIER_PACKAGE_PATH = agentPackagePath(
	PACKAGE_MODULE_VERIFIER_AGENT,
);
const RUNTIME_TOPOLOGY_VERIFIER_PACKAGE_PATH = agentPackagePath(
	RUNTIME_TOPOLOGY_VERIFIER_AGENT,
);

/** Keep in sync with `agents/construct-fixer.md`. */
const EMBEDDED_CONSTRUCT_FIXER = "---\ndescription: Fixes hard subsystem-model audit failures (verification failed). Proposes corrections via Studio HTTP; human confirms. Does not address gaps.\nmode: all\ntemperature: 0\npermission:\n  edit: deny\n  webfetch: deny\n  websearch: deny\n  skill: deny\n  question: deny\n  bash:\n    \"curl *3045*\": allow\n    \"* subsystem-model *\": allow\n    \"node *subsystem-model*\": allow\n    \"bun *subsystem-model*\": allow\n---\n\nYou are the **construct fixer** for Subsystem Models. Your job is to review a\ndeterministic audit that **failed verification**, investigate the code when\nneeded, and **propose** typed corrections with a clear rationale. You do **not**\naccept proposals and you do **not** rewrite the model JSON on disk.\n\nYou only fix **issues** (error / warn findings): missing file or symbol,\nconstruct or signature mismatch, and similar hard failures.\n**Do not** propose changes for gaps (construct unclassified, signature not in\ncache). A separate construct-verifier agent handles those after verification passes.\n\nSkip findings that already offer a deterministic Apply fix in the audit UI\n(unique Graphify file relocate, empty-claim signature fill, declaration\nre-pin) unless Apply is unavailable — prefer human one-click when it exists.\n\n## Important: which tools to use\n\nThe brief’s **Access** section is authoritative. Prefer **Studio HTTP (`curl`)**\ncommands listed there. Do **not** call bare `principal-ai …` unless the brief\ngives an absolute studio-cli path — many machines have an older unrelated\n`principal-ai` on PATH (canvas / principal-view-cli) that does **not** support\n`subsystem-model`.\n\n## Input\n\nThe brief (task message) contains:\n\n- Model id, title\n- **Access** — curl (and optional absolute CLI) for get / audit / proposals / propose\n- **Current audit** — issue findings and failing checks only\n- Repo roots when known\n\nTrust the audit for *what is wrong*. You decide *how to fix it*.\n\n## Procedure\n\n1. **Orient.** Use the brief’s get/audit curl commands if you need to refresh.\n2. **Triage.** High-severity failures first (missing file/symbol, then\n   construct/signature mismatches).\n3. **Investigate.** Read claimed files under the repo roots. Prefer source over\n   Graphify hints when they disagree.\n4. **Propose.** POST one focused proposal at a time (or a small coherent group\n   for the same component). Always include `rationale` and link `finding` when\n   applicable. Use the exact propose curl from the brief. Set\n   `\"author\": \"construct-fixer\"`.\n\n### Ambiguous file relocate (`missing_file` with multiple Graphify paths)\n\nWhen the finding says Graphify has the symbol at **multiple paths**, there is\nno deterministic fix. Open the candidates under the repo roots, pick the\ndefinition that matches this component’s role, and propose `field: \"file\"`.\n\n```json\n{\n  \"rationale\": \"Foo lives in src/a/Foo.ts (export class); the other hit is a test double.\",\n  \"author\": \"construct-fixer\",\n  \"finding\": {\n    \"kind\": \"missing_file\",\n    \"componentAlias\": \"…\",\n    \"message\": \"…\"\n  },\n  \"changes\": [\n    {\n      \"target\": \"component\",\n      \"componentAlias\": \"…\",\n      \"field\": \"file\",\n      \"value\": \"src/a/Foo.ts\"\n    }\n  ]\n}\n```\n\nIf none of the candidates fit, skip — do not invent a path.\n\n### Other missing file / symbol\n\nIf Graphify listed no candidates, search the repo for the symbol and propose\nthe correct `file` (and `symbol` if renamed). Prefer evidence over guessing.\n\n### Construct ≠ inferred (`construct_mismatch`)\n\nGraphify’s inferred construct is a **structural hint**, not ground truth. Do\n**not** auto-flip `component.construct` to the inferred value.\n\n1. Open the claimed file and read the declaration for the claimed symbol.\n2. Decide from **source semantics** (and the model’s intended role):\n   - **Claim wrong** — source is clearly a different construct family than the\n     model (e.g. model says `function`, source is `export class Foo`) → propose\n     `field: \"construct\"` with the corrected value.\n   - **Claim right / intentional** — source matches the claim, or the claim is a\n     deliberate higher-level construct (`store`, `module`, `custom_entity`, …)\n     that Graphify cannot express → **skip**. Say so in the summary. Do not\n     “fix” by adopting inferred.\n   - **Wrong symbol / file** — mismatch is really an identity error → propose\n     `file` / `symbol` (or both), not a blind construct flip.\n3. If unsure after reading source, skip — do not guess taxonomy.\n\n```json\n{\n  \"rationale\": \"Source is `export class SessionStore` in src/session.ts; model claimed function.\",\n  \"author\": \"construct-fixer\",\n  \"finding\": {\n    \"kind\": \"construct_mismatch\",\n    \"componentAlias\": \"…\",\n    \"message\": \"…\"\n  },\n  \"changes\": [\n    {\n      \"target\": \"component\",\n      \"componentAlias\": \"…\",\n      \"field\": \"construct\",\n      \"value\": \"class\"\n    }\n  ]\n}\n```\n\n### Signature mismatch (`signature_mismatch`)\n\nSame rule: Graphify type bags are a hint. Do **not** auto-adopt inferred bags\nwhen the model already has named types (that Apply path is only for empty\nclaims).\n\n1. Read the source signature.\n2. If the **model bags are wrong** and Graphify (or source) clearly shows the\n   right named types — note it in the summary and skip unless you can fix via\n   `symbol` / `file` / `construct` identity. (Detail bag edits are not in the\n   propose schema today.)\n3. If the **model matches source** and Graphify disagrees — skip; Graphify is\n   incomplete or wrong.\n4. If Apply “adopt graphify signature” is offered (empty claims), leave it for\n   the human one-click.\n\n### Example body (generic)\n\n```json\n{\n  \"rationale\": \"One or two sentences: what you checked and why this change.\",\n  \"author\": \"construct-fixer\",\n  \"finding\": {\n    \"kind\": \"missing_file\",\n    \"componentAlias\": \"…\",\n    \"message\": \"…\"\n  },\n  \"changes\": [\n    {\n      \"target\": \"component\",\n      \"componentAlias\": \"…\",\n      \"field\": \"file\",\n      \"value\": \"src/new-path.ts\"\n    }\n  ]\n}\n```\n\nAllowed change fields:\n\n- component: `file` | `symbol` | `construct` | `name` | `purl` | `declarationRef`\n- walkthrough-step: `file` | `line` | `symbol` | `from` | `to` | `mechanism` | `annotation`\n\n5. **Verify.** List proposals with the brief’s proposals curl. Do **not**\n   accept or reject.\n\n## Rules\n\n- Prefer many small proposals over one giant patch.\n- If you cannot determine a safe fix, skip — do not guess paths or constructs.\n- Never edit `~/.principal/subsystem-models/*.json` directly.\n- Never enable or rely on auto-accept; humans confirm in Studio.\n- Ignore unconfirmed / info findings even if they appear in a refreshed audit.\n- Never treat Graphify inferred construct/signature as automatically correct.\n\n## Output\n\nWhen finished, respond with a short plain-text summary only:\n\n- how many proposals you created\n- which findings you skipped and why (especially construct/signature skips)\n\nNo JSON dump of the model.\n";

/** Keep in sync with `agents/construct-verifier.md`. */
const EMBEDDED_CONSTRUCT_VERIFIER = "---\ndescription: Resolves unconfirmed subsystem-model claims (partially verified). Proposes classifications via Studio HTTP; human confirms. Does not fix hard failures.\nmode: all\ntemperature: 0\npermission:\n  edit: deny\n  webfetch: deny\n  websearch: deny\n  skill: deny\n  question: deny\n  bash:\n    \"curl *3045*\": allow\n    \"* subsystem-model *\": allow\n    \"node *subsystem-model*\": allow\n    \"bun *subsystem-model*\": allow\n---\n\nYou are the **construct verifier** for Subsystem Models. Your job is to review a\ndeterministic audit that is **partially verified** (nothing failed, but some\nclaims are unconfirmed), investigate the code when needed, and **propose** typed\ncorrections with a clear rationale. You do **not** accept proposals and you do\n**not** rewrite the model JSON on disk.\n\nYou only address **unconfirmed claims**: construct unclassified, signature\nnot in cache, unresolved repo/cache, and similar confirmation holes. **Do not** invent or\nchase hard failures — if the model has verification issues, stop and say so;\nconstruct-fixer handles those.\n\n## Important: which tools to use\n\nThe brief’s **Access** section is authoritative. Prefer **Studio HTTP (`curl`)**\ncommands listed there. Do **not** call bare `principal-ai …` unless the brief\ngives an absolute studio-cli path — many machines have an older unrelated\n`principal-ai` on PATH (canvas / principal-view-cli) that does **not** support\n`subsystem-model`.\n\n## Input\n\nThe brief (task message) contains:\n\n- Model id, title\n- **Access** — curl (and optional absolute CLI) for get / audit / proposals / propose\n- **Current audit** — unconfirmed findings and unconfirmed checks only\n- Repo roots when known\n\nTrust the audit for *what is incomplete*. You decide *how to fill it* safely.\n\n## Procedure\n\n1. **Orient.** Use the brief’s get/audit curl commands if you need to refresh.\n2. **Triage.** Prefer claims you can resolve from source. For signatures, read\n   the declaration and propose an augmentation when named types are clear.\n3. **Investigate.** Read claimed files under the repo roots. Prefer evidence\n   over guessing.\n4. **Propose.** POST one focused proposal at a time (or a small coherent group\n   for the same component). Always include `rationale` and link `finding` when\n   applicable. Use the exact propose curl from the brief. Set\n   `\"author\": \"construct-verifier\"`.\n\n### Construct unclassified (`construct_unconfirmed`)\n\nGraphify often cannot tell interface vs type_alias vs enum (label-only →\n`unknown`). Choose:\n\n- **Claim is correct** (source shows `interface HostInfo`, model already says\n  `interface`) → propose an **augmentation** confirmation. Do **not** re-propose\n  the same `component.construct` value — that does not clear the claim.\n- **Claim is wrong** → propose `target: \"component\", field: \"construct\"` with\n  the corrected value.\n\nAugmentation example (preferred when the model claim is already right):\n\n```json\n{\n  \"rationale\": \"HostInfo is declared as interface in <file>; graphify left it unclassified.\",\n  \"author\": \"construct-verifier\",\n  \"finding\": {\n    \"kind\": \"construct_unconfirmed\",\n    \"componentAlias\": \"…\",\n    \"message\": \"…\"\n  },\n  \"changes\": [\n    {\n      \"target\": \"augmentation\",\n      \"componentAlias\": \"…\",\n      \"field\": \"construct\",\n      \"value\": \"interface\"\n    }\n  ]\n}\n```\n\nModel-construct correction example (only when the claim itself is wrong):\n\n```json\n{\n  \"rationale\": \"Source declares a class, not a function.\",\n  \"author\": \"construct-verifier\",\n  \"finding\": {\n    \"kind\": \"construct_unconfirmed\",\n    \"componentAlias\": \"…\",\n    \"message\": \"…\"\n  },\n  \"changes\": [\n    {\n      \"target\": \"component\",\n      \"componentAlias\": \"…\",\n      \"field\": \"construct\",\n      \"value\": \"class\"\n    }\n  ]\n}\n```\n\n### Signature not in cache (`signature_unconfirmed`)\n\nGraphify has no usable `parameter_type` / `return_type` edges for this\nfunction/method. Read the source declaration and propose a **signature\naugmentation** carrying the **full signature**. That confirms the claim for\nthe next audit.\n\nRecord it faithfully and in order — do not reduce it to named types:\n\n- Every parameter: `name` (when the language declares one), `type` as written,\n  and `optional: true` for optional/defaulted/rest params.\n- Include inline object types, primitives, unions, and wrappers\n  (`Promise<…>`, `Array<…>`, `ReadonlySet<…>`) exactly as written.\n- If the language does not declare a parameter type, set `\"type\": \"\"` and keep\n  the `name`; do not drop the parameter.\n- **Destructured params are one parameter.** A component written\n  `function Foo({ a, b }: FooProps)` has a single callable parameter whose type\n  is the props type — do **not** flatten the destructure into one entry per\n  prop. Claim `{ \"parameters\": [{ \"type\": \"FooProps\" }] }` (omit `name` — the\n  source declares no name for the binding object). If the props type is\n  declared inline instead of by name, claim the whole inline object as the one\n  type, exactly as written.\n- **Return type.** When the declaration states one, record it as written\n  (include the wrapper, e.g. `Promise<Session>`). When it is **not** declared,\n  **infer it from the implementation** and record the inferred type — do not\n  leave it blank. For example: a React component that returns JSX →\n  `JSX.Element`; a hook that returns an object literal → that shape.\n- **The rationale must say whether the return type was declared or inferred,\n  and on what basis.** Do not present an inferred type as if it were written.\n- **Every signature augmentation must carry `lines`: the 1-based inclusive\n  line span of the declaration you read**, e.g. `\"lines\": { \"start\": 643, \"end\": 720 }`\n  for a declaration starting at line 643 and ending at its closing brace on\n  720. The span is forwarded to the Jev second opinion so it can read the\n  exact declaration you verified. `start` must be ≥ 1 and `end` ≥ `start`.\n- If you cannot read the declaration, skip — do not guess.\n\n```json\n{\n  \"rationale\": \"Source declares `assessSubsystemGraphifyReadiness(graph: { components: Array<{ purl?: string }> }, buildingPurls?: ReadonlySet<string>, storeRoot?: string): Promise<SubsystemGraphifyReadiness>`; declared return type is Promise<SubsystemGraphifyReadiness>. Graphify has no signature edges.\",\n  \"author\": \"construct-verifier\",\n  \"finding\": {\n    \"kind\": \"signature_unconfirmed\",\n    \"componentAlias\": \"…\",\n    \"message\": \"…\"\n  },\n  \"changes\": [\n    {\n      \"target\": \"augmentation\",\n      \"componentAlias\": \"…\",\n      \"field\": \"signature\",\n      \"lines\": { \"start\": 60, \"end\": 118 },\n      \"value\": {\n        \"parameters\": [\n          { \"name\": \"graph\", \"type\": \"{ components: Array<{ purl?: string }> }\" },\n          { \"name\": \"buildingPurls\", \"type\": \"ReadonlySet<string>\", \"optional\": true },\n          { \"name\": \"storeRoot\", \"type\": \"string\", \"optional\": true }\n        ],\n        \"returnType\": \"Promise<SubsystemGraphifyReadiness>\"\n      }\n    }\n  ]\n}\n```\n\nInferred return type (no annotation in source):\n\n```json\n{\n  \"rationale\": \"Source declares `SubsystemModelsView({ scope }: { scope?: { ids: string[]; title?: string } } = {})`. It has no declared return type; it returns JSX, so `JSX.Element` is inferred. Graphify has no signature edges.\",\n  \"author\": \"construct-verifier\",\n  \"finding\": {\n    \"kind\": \"signature_unconfirmed\",\n    \"componentAlias\": \"…\",\n    \"message\": \"…\"\n  },\n  \"changes\": [\n    {\n      \"target\": \"augmentation\",\n      \"componentAlias\": \"…\",\n      \"field\": \"signature\",\n      \"lines\": { \"start\": 643, \"end\": 720 },\n      \"value\": {\n        \"parameters\": [\n          { \"type\": \"{ scope?: { ids: string[]; title?: string } }\", \"optional\": true }\n        ],\n        \"returnType\": \"JSX.Element\"\n      }\n    }\n  ]\n}\n```\n\nNamed props type (destructured params collapse to the one props param):\n\n```json\n{\n  \"rationale\": \"Source declares `WalkthroughsPanel({ walkthroughs, … }: WalkthroughsPanelProps)`. The single destructurized param is the exported interface `WalkthroughsPanelProps` (lines 390-420); no declared return type, returns JSX, so `JSX.Element` is inferred. Graphify has no signature edges.\",\n  \"author\": \"construct-verifier\",\n  \"finding\": {\n    \"kind\": \"signature_unconfirmed\",\n    \"componentAlias\": \"…\",\n    \"message\": \"…\"\n  },\n  \"changes\": [\n    {\n      \"target\": \"augmentation\",\n      \"componentAlias\": \"…\",\n      \"field\": \"signature\",\n      \"lines\": { \"start\": 390, \"end\": 628 },\n      \"value\": {\n        \"parameters\": [\n          { \"type\": \"WalkthroughsPanelProps\" }\n        ],\n        \"returnType\": \"JSX.Element\"\n      }\n    }\n  ]\n}\n```\n\nAllowed change targets:\n\n- `augmentation`: `construct` | `signature` (accept writes the augmentation\n  store, not the model JSON). `file` / `symbol` / `purl` optional — default\n  from the component.\n- component: `file` | `symbol` | `construct` | `name` | `purl` | `declarationRef`\n- walkthrough-step: `file` | `line` | `symbol` | `from` | `to` | `mechanism` | `annotation`\n\n5. **Verify.** List proposals with the brief’s proposals curl. Do **not**\n   accept or reject.\n\n## Rules\n\n- Prefer many small proposals over one giant patch.\n- If you cannot determine a safe fill, skip — do not guess constructs or paths.\n- Never edit `~/.principal/subsystem-models/*.json` directly.\n- Never enable or rely on auto-accept; humans confirm in Studio.\n- Do not propose “fixes” for error/warn findings; those belong to construct-fixer.\n\n## Output\n\nWhen finished, respond with a short plain-text summary only:\n\n- how many proposals you created\n- which unconfirmed claims you skipped and why\n\nNo JSON dump of the model.\n";

const BRIEF_DIR = join(homedir(), ".principal", "subsystem-model-briefs");

export interface MaintainModelResult {
	ok: boolean;
	error?: string;
	model?: string;
	/** Which OpenCode agent ran (or would have run). */
	agent?: MaintainAgentId;
	layer?: MaintainLayer;
	mode?: MaintainMode;
	/** Audit verdict used for routing. */
	verdict?: SubsystemModelAuditVerdict;
	pendingCount?: number;
	/** True when audit was fully verified — no agent run. */
	skipped?: boolean;
	/** Agent stdout text summary (best-effort). */
	summary?: string;
	/** OpenCode V2 session id when the agent ran on the shared service. */
	sessionId?: string;
}

function isTopologyFindingKind(kind: string | undefined): boolean {
	return (
		kind === "topology_broken_endpoint" ||
		kind === "topology_relation_unconfirmed" ||
		kind === "topology_import_unconfirmed"
	);
}

function isBoundaryFindingKind(kind: string | undefined): boolean {
	return (
		kind === "boundary_module_file_mismatch" ||
		kind === "boundary_process_nest_disagree"
	);
}

/**
 * Repo/cache availability — a graph-level condition with an environment fix
 * (clone the repo, build the cache), not a model claim an agent can correct.
 */
function isAvailabilityFindingKind(kind: string | undefined): boolean {
	return kind === "repo_unresolved" || kind === "graphify_unavailable";
}

function isTopologyIssueFinding(
	f: SubsystemModelAuditReport["findings"][number],
): boolean {
	return f.kind === "topology_broken_endpoint";
}

function isTopologyGapFinding(
	f: SubsystemModelAuditReport["findings"][number],
): boolean {
	return (
		f.kind === "topology_relation_unconfirmed" ||
		f.kind === "topology_import_unconfirmed"
	);
}

/** Package/module (containment) hard failure — module without a file anchor. */
function isPackageModuleIssueFinding(
	f: SubsystemModelAuditReport["findings"][number],
): boolean {
	return f.kind === "boundary_module_file_mismatch" && f.severity === "error";
}

/** Package/module (containment) unconfirmed — intentional module≠file. */
function isPackageModuleGapFinding(
	f: SubsystemModelAuditReport["findings"][number],
): boolean {
	return f.kind === "boundary_module_file_mismatch" && f.severity !== "error";
}

/** Process (runtime deployment-unit) unconfirmed — process nest disagreement. */
function isRuntimeTopologyGapFinding(
	f: SubsystemModelAuditReport["findings"][number],
): boolean {
	return f.kind === "boundary_process_nest_disagree";
}

function isConstructIssueFinding(
	f: SubsystemModelAuditReport["findings"][number],
): boolean {
	if (
		isTopologyFindingKind(f.kind) ||
		isBoundaryFindingKind(f.kind) ||
		isAvailabilityFindingKind(f.kind)
	)
		return false;
	return f.severity === "error";
}

function isConstructGapFinding(
	f: SubsystemModelAuditReport["findings"][number],
): boolean {
	if (
		isTopologyFindingKind(f.kind) ||
		isBoundaryFindingKind(f.kind) ||
		isAvailabilityFindingKind(f.kind)
	)
		return false;
	if (f.severity === "error") return false;
	return (
		f.kind === "construct_unconfirmed" ||
		f.kind === "signature_unconfirmed" ||
		f.severity === "info"
	);
}

function hasConstructCheckIssues(report: SubsystemModelAuditReport): boolean {
	return report.checks.some((c) => c.verdict === "issue");
}

function hasConstructCheckGaps(report: SubsystemModelAuditReport): boolean {
	for (const c of report.checks) {
		if (c.verdict === "issue") continue;
		if (c.constructInferred === "unknown" && c.constructMatch !== true)
			return true;
		if (c.signature === "skipped") return true;
	}
	return false;
}

/**
 * Pick the next Maintain agent. Hard failures first, then unconfirmed claims;
 * within each tier: construct → static topology → package/module → runtime
 * topology. Membership (package/module, process) is settled before relations
 * so relation retargets run against a stable component set.
 */
export function selectMaintainRoute(
	report: SubsystemModelAuditReport,
): MaintainRoute | null {
	// Hard failures.
	if (
		report.findings.some(isConstructIssueFinding) ||
		hasConstructCheckIssues(report)
	) {
		return {
			agent: CONSTRUCT_FIXER_AGENT,
			layer: "construct",
			mode: "issues",
		};
	}
	if (report.findings.some(isTopologyIssueFinding)) {
		return {
			agent: STATIC_TOPOLOGY_FIXER_AGENT,
			layer: "static-topology",
			mode: "issues",
		};
	}
	if (report.findings.some(isPackageModuleIssueFinding)) {
		return {
			agent: PACKAGE_MODULE_FIXER_AGENT,
			layer: "dynamic-topology",
			mode: "issues",
		};
	}
	// Unconfirmed claims.
	if (
		report.findings.some(isConstructGapFinding) ||
		hasConstructCheckGaps(report)
	) {
		return {
			agent: CONSTRUCT_VERIFIER_AGENT,
			layer: "construct",
			mode: "verify",
		};
	}
	if (
		report.findings.some(isPackageModuleGapFinding) ||
		report.boundaryChecks?.some(
			(c) => c.kind === "module_file" && c.verdict === "gap",
		)
	) {
		return {
			agent: PACKAGE_MODULE_VERIFIER_AGENT,
			layer: "dynamic-topology",
			mode: "verify",
		};
	}
	if (
		report.findings.some(isRuntimeTopologyGapFinding) ||
		report.boundaryChecks?.some(
			(c) => c.kind === "process_nest" && c.verdict === "gap",
		)
	) {
		return {
			agent: RUNTIME_TOPOLOGY_VERIFIER_AGENT,
			layer: "dynamic-topology",
			mode: "verify",
		};
	}
	if (
		report.findings.some(isTopologyGapFinding) ||
		report.topologyChecks?.some((c) => c.verdict === "gap")
	) {
		return {
			agent: STATIC_TOPOLOGY_VERIFIER_AGENT,
			layer: "static-topology",
			mode: "verify",
		};
	}
	return null;
}

/**
 * The next stage a Maintain run would execute for a stored model, from its
 * persisted audit — or `null` when nothing is queued. Used by the Maintain
 * surface to show where a model sits in the fix cycle.
 */
export async function nextMaintainRouteForModel(
	graphId: string,
): Promise<MaintainRoute | null> {
	const saved = await loadSubsystemModelAudit(graphId);
	if (!saved) return null;
	return selectMaintainRoute(saved.report);
}

/** @deprecated Prefer selectMaintainRoute — coarse issues/gaps only. */
export function maintainModeForVerdict(
	verdict: SubsystemModelAuditVerdict,
): MaintainMode | null {
	if (verdict === "issues") return "issues";
	if (verdict === "partially_verified") return "verify";
	return null;
}

/** @deprecated Prefer selectMaintainRoute. */
export function agentForMaintainMode(mode: MaintainMode): MaintainAgentId {
	return mode === "issues" ? CONSTRUCT_FIXER_AGENT : CONSTRUCT_VERIFIER_AGENT;
}

export function maintainActionLabel(_mode: MaintainMode | null): string {
	return "Run maintenance";
}

function loadAgentSource(packagePath: string, embedded: string): string {
	try {
		if (existsSync(packagePath)) {
			return readFileSync(packagePath, "utf8");
		}
	} catch {
		/* fall through */
	}
	return embedded;
}

function loadTopologyAgentSource(packagePath: string): string {
	try {
		return readFileSync(packagePath, "utf8");
	} catch (err) {
		return `---\ndescription: topology agent unavailable\n---\nFailed to load ${packagePath}: ${(err as Error).message}\n`;
	}
}

/** Ensure Maintain agents are installed under ~/.config/opencode/agents/. */
export function ensureMaintainAgentsInstalled(): {
	ok: boolean;
	paths: string[];
	error?: string;
} {
	try {
		mkdirSync(AGENT_INSTALL_DIR, { recursive: true });
		writeFileSync(
			CONSTRUCT_FIXER_AGENT_PATH,
			loadAgentSource(CONSTRUCT_FIXER_PACKAGE_PATH, EMBEDDED_CONSTRUCT_FIXER),
			"utf8",
		);
		writeFileSync(
			CONSTRUCT_VERIFIER_AGENT_PATH,
			loadAgentSource(
				CONSTRUCT_VERIFIER_PACKAGE_PATH,
				EMBEDDED_CONSTRUCT_VERIFIER,
			),
			"utf8",
		);
		writeFileSync(
			STATIC_TOPOLOGY_FIXER_AGENT_PATH,
			loadTopologyAgentSource(STATIC_TOPOLOGY_FIXER_PACKAGE_PATH),
			"utf8",
		);
		writeFileSync(
			STATIC_TOPOLOGY_VERIFIER_AGENT_PATH,
			loadTopologyAgentSource(STATIC_TOPOLOGY_VERIFIER_PACKAGE_PATH),
			"utf8",
		);
		writeFileSync(
			PACKAGE_MODULE_FIXER_AGENT_PATH,
			loadTopologyAgentSource(PACKAGE_MODULE_FIXER_PACKAGE_PATH),
			"utf8",
		);
		writeFileSync(
			PACKAGE_MODULE_VERIFIER_AGENT_PATH,
			loadTopologyAgentSource(PACKAGE_MODULE_VERIFIER_PACKAGE_PATH),
			"utf8",
		);
		writeFileSync(
			RUNTIME_TOPOLOGY_VERIFIER_AGENT_PATH,
			loadTopologyAgentSource(RUNTIME_TOPOLOGY_VERIFIER_PACKAGE_PATH),
			"utf8",
		);
		return {
			ok: true,
			paths: [
				CONSTRUCT_FIXER_AGENT_PATH,
				CONSTRUCT_VERIFIER_AGENT_PATH,
				STATIC_TOPOLOGY_FIXER_AGENT_PATH,
				STATIC_TOPOLOGY_VERIFIER_AGENT_PATH,
				PACKAGE_MODULE_FIXER_AGENT_PATH,
				PACKAGE_MODULE_VERIFIER_AGENT_PATH,
				RUNTIME_TOPOLOGY_VERIFIER_AGENT_PATH,
			],
		};
	} catch (err) {
		return { ok: false, paths: [], error: (err as Error).message };
	}
}

/** @deprecated Use ensureMaintainAgentsInstalled. */
export function ensureClaimAdjudicatorAgentInstalled(): {
	ok: boolean;
	path: string;
	error?: string;
} {
	const r = ensureMaintainAgentsInstalled();
	return {
		ok: r.ok,
		path: CONSTRUCT_FIXER_AGENT_PATH,
		error: r.error,
	};
}

function primaryRepoRoot(graph: StoredSubsystemModel): string | undefined {
	for (const c of graph.components) {
		const root = resolveRepoRootForComponent(c.purl);
		if (root) return root;
	}
	return undefined;
}

function formatFinding(f: SubsystemModelAuditReport["findings"][number]): string {
	const where = [
		f.componentAlias ? `component=${f.componentAlias}` : null,
		f.componentName ? `name=${f.componentName}` : null,
		f.relationId ? `relation=${f.relationId}` : null,
		f.moduleKey ? `module=${f.moduleKey}` : null,
		f.walkthroughId ? `walkthrough=${f.walkthroughId}` : null,
		f.step != null ? `step=${f.step}` : null,
	]
		.filter(Boolean)
		.join(" ");
	return `- [${f.severity}] ${f.kind}${where ? ` (${where})` : ""}: ${f.message}`;
}

function formatIssueCheck(
	c: SubsystemModelAuditReport["checks"][number],
): string | null {
	if (c.verdict !== "issue") return null;
	const bits = [
		"verdict=issue",
		c.fileExists === false ? "file missing" : null,
		c.constructMatch === false
			? `construct ${c.constructClaimed ?? "?"} ≠ ${c.constructInferred ?? "?"}`
			: null,
		c.signature === "mismatch" ? "signature mismatch" : null,
		c.declarationFreshness === "stale" ? "declaration line drifted" : null,
		c.anchor && c.anchor !== "exact" && c.anchor !== "n/a"
			? `anchor=${c.anchor}`
			: null,
		c.note ?? null,
	].filter(Boolean);
	return `- ${c.componentName ?? c.componentAlias} (${c.componentAlias}): ${bits.join("; ")}`;
}

function formatGapCheck(
	c: SubsystemModelAuditReport["checks"][number],
): string | null {
	if (c.verdict === "issue") return null;
	const bits = [
		c.constructInferred === "unknown" && c.constructMatch !== true
			? "construct unclassified"
			: null,
		c.signature === "skipped" ? "signature not in cache" : null,
		c.graphify === "weak" || c.graphify === "unavailable"
			? `graphify=${c.graphify}`
			: null,
		c.verdict === "skipped" && c.note ? c.note : null,
	].filter(Boolean);
	if (bits.length === 0) return null;
	return `- ${c.componentName ?? c.componentAlias} (${c.componentAlias}): ${bits.join("; ")}`;
}

function formatTopologyCheck(
	c: NonNullable<SubsystemModelAuditReport["topologyChecks"]>[number],
	mode: MaintainMode,
): string | null {
	if (mode === "issues" && c.verdict !== "issue") return null;
	if (mode === "verify" && c.verdict !== "gap") return null;
	return `- ${c.relationId} (${c.relationType} ${c.from}→${c.to}): ${c.verdict}${c.note ? ` — ${c.note}` : ""}`;
}

function formatBoundaryCheck(
	c: NonNullable<SubsystemModelAuditReport["boundaryChecks"]>[number],
	mode: MaintainMode,
): string | null {
	if (mode === "issues" && c.verdict !== "issue") return null;
	if (mode === "verify" && c.verdict !== "gap") return null;
	const bits = [
		c.kind,
		c.module ? `module=${c.module}` : null,
		c.file ? `file=${c.file}` : null,
		c.process ? `process=${c.process}` : null,
	].filter(Boolean);
	return `- ${c.componentName ?? c.componentAlias} (${c.componentAlias}): ${c.verdict} · ${bits.join(" · ")}${c.note ? ` — ${c.note}` : ""}`;
}

function studioHttpBase(): string {
	const port = process.env["PRINCIPAL_STUDIO_HTTP_PORT"] ?? "3045";
	return `http://127.0.0.1:${port}`;
}

/**
 * Absolute invoker for @principal-ai/principal-studio-cli when available.
 * Returns null when only PATH's unrelated principal-view-cli would match.
 */
function resolveStudioCliInvoker(): string | null {
	const fromEnv = process.env["PRINCIPAL_STUDIO_CLI"]?.trim();
	if (fromEnv && existsSync(fromEnv)) {
		return fromEnv.endsWith(".cjs") || fromEnv.endsWith(".js")
			? `node ${JSON.stringify(fromEnv)}`
			: fromEnv;
	}
	const monorepoDist = join(
		import.meta.dir,
		"..",
		"..",
		"..",
		"principal-studio-cli",
		"dist",
		"index.cjs",
	);
	if (existsSync(monorepoDist)) {
		return `node ${JSON.stringify(monorepoDist)}`;
	}
	return null;
}

function briefTitle(route: MaintainRoute): string {
	switch (route.agent) {
		case CONSTRUCT_FIXER_AGENT:
			return "# Subsystem model construct-fixer brief";
		case CONSTRUCT_VERIFIER_AGENT:
			return "# Subsystem model construct-verifier brief";
		case STATIC_TOPOLOGY_FIXER_AGENT:
			return "# Subsystem model static-topology-fixer brief";
		case STATIC_TOPOLOGY_VERIFIER_AGENT:
			return "# Subsystem model static-topology-verifier brief";
		case PACKAGE_MODULE_FIXER_AGENT:
			return "# Subsystem model package-module-fixer brief";
		case PACKAGE_MODULE_VERIFIER_AGENT:
			return "# Subsystem model package-module-verifier brief";
		case RUNTIME_TOPOLOGY_VERIFIER_AGENT:
			return "# Subsystem model runtime-topology-verifier brief";
	}
}

function proposeShapeHint(agent: MaintainAgentId): string {
	if (agent === STATIC_TOPOLOGY_VERIFIER_AGENT) {
		return `Propose body shape: \`{ "rationale": "…", "author": "${agent}", "finding": { "kind", "relationId", "message" }, "changes": […] }\`. When the claim is intentional but Graphify is thin, use \`{ "target": "augmentation", "field": "relation", "relationId", "value": true }\`. When the claim is wrong, use \`{ "target": "relation", "relationId", "field": "delete"|"from"|"to"|"relationType", "value": … }\`. Do **not** call accept/reject.`;
	}
	if (agent === STATIC_TOPOLOGY_FIXER_AGENT) {
		return `Propose body shape: \`{ "rationale": "…", "author": "${agent}", "finding": { "kind", "relationId", "message" }, "changes": [{ "target": "relation", "relationId", "field": "delete"|"from"|"to"|"relationType", "value": … }] }\`. Do **not** call accept/reject.`;
	}
	if (
		agent === PACKAGE_MODULE_VERIFIER_AGENT ||
		agent === PACKAGE_MODULE_FIXER_AGENT
	) {
		return `Propose body shape: \`{ "rationale": "…", "author": "${agent}", "finding": {…}, "changes": […] }\`. For intentional module≠file use \`{ "target": "augmentation", "componentAlias", "field": "module", "value": "<module key>" }\`. For a module without a file anchor, use \`{ "target": "component", "field": "module", "value": … }\`. Do **not** call accept/reject.`;
	}
	if (agent === RUNTIME_TOPOLOGY_VERIFIER_AGENT) {
		return `Propose body shape: \`{ "rationale": "…", "author": "${agent}", "finding": {…}, "changes": […] }\`. For process-nest disagreement, use \`{ "target": "component", "field": "process", "value": "<deployment unit>" }\`. Do **not** call accept/reject.`;
	}
	return `Propose body shape: \`{ "rationale": "…", "author": "${agent}", "finding": {…}, "changes": […] }\`. For construct_unconfirmed when the claim is already correct, use \`{ "target": "augmentation", "componentAlias", "field": "construct", "value" }\`. For signature_unconfirmed, use \`{ "target": "augmentation", "componentAlias", "field": "signature", "value": { "parameters": [{ "name": …, "type": …, "optional": … }], "returnType": … } }\` — the full signature, not a bag of type names. When the return type is not declared, infer it from the implementation and say so in the rationale. Do **not** call accept/reject.`;
}

function taskBlurb(route: MaintainRoute): string {
	switch (route.agent) {
		case CONSTRUCT_FIXER_AGENT:
			return "Review each **construct issue** finding, investigate the code, and submit proposals via the Access curl commands (Studio HTTP). For construct ≠ inferred / signature mismatch: Graphify is a weak hint — read source; do not auto-adopt inferred; skip when the model claim is intentional. Ignore unconfirmed, package/module, and static-topology findings. Prefer small proposals. Finish with a short plain-text summary of proposals created and skips.";
		case CONSTRUCT_VERIFIER_AGENT:
			return "Review each **construct unconfirmed** claim, investigate the code, propose safe fills (e.g. construct classification, signature) via the Access curl commands (Studio HTTP). Do not chase hard failures, package/module, or static-topology findings. Prefer small proposals. Skip anything you cannot safely fill. Finish with a short plain-text summary of proposals created and skips.";
		case STATIC_TOPOLOGY_FIXER_AGENT:
			return "Review each **topology_broken_endpoint**, decide drop vs retarget against surviving component ids, and submit relation proposals via Access curl. Ignore construct/package-module findings and relation soft gaps. Prefer delete when retarget is unclear. Finish with a short plain-text summary.";
		case STATIC_TOPOLOGY_VERIFIER_AGENT:
			return "Review each **relation unconfirmed** claim. When source supports the claim (or it is a deliberate external Graphify rarely emits), propose a **relation augmentation**. Propose drop/retarget only when source shows the claim is wrong. Skip only when unsure. Ignore construct/package-module findings and hard topology issues. Finish with a short plain-text summary.";
		case PACKAGE_MODULE_FIXER_AGENT:
			return "Review each **package/module hard failure** (a module claim without a file anchor). Propose the corrected `module` (or clear it) via Access curl. Ignore construct/static-topology/runtime findings and soft containment gaps. Finish with a short plain-text summary.";
		case PACKAGE_MODULE_VERIFIER_AGENT:
			return "Review each **package/module containment gap**. For an intentional module≠file grouping, propose a **module augmentation**. For an authoring slip, propose a `module` field fix. Skip only when unsure. Ignore construct/static-topology/runtime findings. Finish with a short plain-text summary.";
		case RUNTIME_TOPOLOGY_VERIFIER_AGENT:
			return "Review each **process membership gap** (process nest disagreement). Propose the corrected `process` deployment unit via Access curl. Skip only when unsure. Ignore construct/static-topology/package-module findings. Finish with a short plain-text summary.";
	}
}

export function buildMaintainBrief(opts: {
	graph: StoredSubsystemModel;
	report: SubsystemModelAuditReport;
	route: MaintainRoute;
	/** Liveness token from this run; Step 0 makes the agent confirm it can call tools. */
	probeRunId?: string;
	/** This run's durable id — emitted into the brief so the agent stamps it onto every proposed correction. */
	runId?: string;
}): string {
	const { graph, report, route, probeRunId, runId } = opts;
	const { agent, mode, layer } = route;
	const id = graph.id;
	const enc = encodeURIComponent(id);
	const base = studioHttpBase();
	const lines: string[] = [];
	lines.push(briefTitle(route));
	lines.push("");
	lines.push(`- **Title**: ${graph.title}`);
	lines.push(`- **Model id**: ${id}`);
	lines.push(`- **Agent**: ${agent}`);
	lines.push(`- **Layer**: ${layer}`);
	lines.push(`- **Mode**: ${mode}`);
	lines.push(`- **Audited at**: ${report.checkedAt}`);
	if (runId) {
		lines.push(`- **Run id**: ${runId}`);
	}
	lines.push(
		`- **Needs update**: ${report.needsUpdate ? "yes (verification failed)" : "no"}`,
	);
	if (probeRunId) {
		lines.push("");
		lines.push("## Step 0 · Confirm you're live (required first)");
		lines.push("");
		lines.push(
			"Before anything else, make this one call and confirm it returns `{\"ok\":true}`:",
		);
		lines.push("");
		lines.push(
			`    curl -sS -X POST ${base}/api/maintainer/probe -H 'Content-Type: application/json' -d '{"runId":"${probeRunId}"}'`,
		);
		lines.push("");
		lines.push(
			"Do **not** begin the task until that call returns `{\"ok\":true}`.",
		);
	}
	lines.push("");
	lines.push("## Access");
	lines.push("");
	lines.push(
		"**Prefer Studio HTTP** (Studio is running — do not use bare `principal-ai` on PATH; it is often an older unrelated CLI without `subsystem-model`):",
	);
	lines.push("");
	lines.push(`    curl -sS ${base}/api/subsystem-model/${enc}`);
	lines.push(`    curl -sS ${base}/api/subsystem-model/${enc}/audit`);
	lines.push(`    curl -sS ${base}/api/subsystem-model/${enc}/proposals`);
	lines.push(
		`    curl -sS -X POST ${base}/api/subsystem-model/${enc}/proposals -H 'Content-Type: application/json' -d '<proposal-json>'`,
	);
	lines.push("");
	lines.push(proposeShapeHint(agent));
	if (runId) {
		lines.push("");
		lines.push(
			`Include \`"runId": "${runId}"\` in every propose body you POST — it associates each proposal with this run.`,
		);
	}

	const cli = resolveStudioCliInvoker();
	if (cli) {
		lines.push("");
		lines.push(
			"**Optional studio-cli** (absolute — only if curl is unavailable):",
		);
		lines.push("");
		lines.push(`    ${cli} subsystem-model get ${id}`);
		lines.push(`    ${cli} subsystem-model audit ${id}`);
		lines.push(`    ${cli} subsystem-model proposals ${id}`);
		lines.push(
			`    ${cli} subsystem-model propose ${id} --author ${agent} -f -`,
		);
	}

	const roots = new Set<string>();
	for (const c of graph.components) {
		const r = resolveRepoRootForComponent(c.purl);
		if (r) roots.add(r);
	}
	if (roots.size > 0) {
		lines.push("");
		lines.push("**Repo roots** (read source here):");
		for (const r of roots) lines.push(`- ${r}`);
	}

	if (layer === "static-topology") {
		lines.push("");
		lines.push("**Surviving component ids** (retarget targets):");
		for (const c of graph.components) {
			lines.push(`- ${c.alias} (${c.name}${c.symbol ? ` · ${c.symbol}` : ""})`);
		}
	}

	const findings = report.findings.filter((f) => {
		switch (agent) {
			case CONSTRUCT_FIXER_AGENT:
				return isConstructIssueFinding(f);
			case CONSTRUCT_VERIFIER_AGENT:
				return isConstructGapFinding(f);
			case STATIC_TOPOLOGY_FIXER_AGENT:
				return isTopologyIssueFinding(f);
			case STATIC_TOPOLOGY_VERIFIER_AGENT:
				return isTopologyGapFinding(f);
			case PACKAGE_MODULE_FIXER_AGENT:
				return isPackageModuleIssueFinding(f);
			case PACKAGE_MODULE_VERIFIER_AGENT:
				return isPackageModuleGapFinding(f);
			case RUNTIME_TOPOLOGY_VERIFIER_AGENT:
				return isRuntimeTopologyGapFinding(f);
		}
	});

	lines.push("");
	lines.push(
		mode === "issues"
			? "## Current audit — issue findings"
			: "## Current audit — unconfirmed findings",
	);
	lines.push("");
	if (findings.length === 0) {
		lines.push("(no findings in this mode)");
	} else {
		for (const f of findings) lines.push(formatFinding(f));
	}

	if (layer === "construct") {
		lines.push("");
		lines.push(
			mode === "issues"
				? "## Current audit — failing checks"
				: "## Current audit — unconfirmed checks",
		);
		lines.push("");
		const checkLines = (
			mode === "issues"
				? report.checks.map(formatIssueCheck)
				: report.checks.map(formatGapCheck)
		).filter(Boolean) as string[];
		if (checkLines.length === 0) {
			lines.push("(nothing flagged in this mode)");
		} else {
			for (const row of checkLines) lines.push(row);
		}
	} else if (layer === "static-topology") {
		lines.push("");
		lines.push("## Current audit — relation checks");
		lines.push("");
		const topoLines = (report.topologyChecks ?? [])
			.map((c) => formatTopologyCheck(c, mode))
			.filter(Boolean) as string[];
		if (topoLines.length === 0) {
			lines.push("(nothing flagged in this mode)");
		} else {
			for (const row of topoLines) lines.push(row);
		}
	} else {
		lines.push("");
		lines.push("## Current audit — package/module & process checks");
		lines.push("");
		const boundaryLines = (report.boundaryChecks ?? [])
			.map((c) => formatBoundaryCheck(c, mode))
			.filter(Boolean) as string[];
		if (boundaryLines.length === 0) {
			lines.push("(nothing flagged in this mode)");
		} else {
			for (const row of boundaryLines) lines.push(row);
		}
	}

	lines.push("");
	lines.push("## Task");
	lines.push("");
	lines.push(taskBlurb(route));
	return lines.join("\n");
}

export function writeMaintainBrief(opts: {
	graph: StoredSubsystemModel;
	report: SubsystemModelAuditReport;
	route: MaintainRoute;
}): string {
	mkdirSync(BRIEF_DIR, { recursive: true });
	const path = join(BRIEF_DIR, `${opts.graph.id}.brief.md`);
	writeFileSync(path, buildMaintainBrief(opts), "utf8");
	return path;
}

/** Run Maintain agent on OpenCode V2 (session create + prompt + live SSE). */
export async function runMaintainAgent(opts: {
	agent: MaintainAgentId;
	primaryRepoRoot?: string;
	task: string;
	model: string;
	graphId?: string;
	title?: string;
	onSession?: (sessionId: string) => void;
	probeRunId?: string;
	firstActivityTimeoutMs?: number;
}): Promise<{
	ok: boolean;
	error?: string;
	summary?: string;
	model: string;
	agent: MaintainAgentId;
	sessionId?: string;
	unusable?: boolean;
}> {
	const directory = opts.primaryRepoRoot?.trim() || process.cwd();
	const run = await runOpencodeV2AgentSession({
		title: opts.title ?? `Maintain — ${opts.agent}`,
		agent: opts.agent,
		model: opts.model,
		directory,
		text: opts.task,
		graphId: opts.graphId,
		onSession: opts.onSession,
		probeRunId: opts.probeRunId,
		firstActivityTimeoutMs: opts.firstActivityTimeoutMs,
	});
	return {
		ok: run.ok,
		error: run.error,
		summary: run.summary,
		model: run.model,
		agent: opts.agent,
		sessionId: run.sessionId,
		unusable: run.unusable,
	};
}

/** @deprecated Use runMaintainAgent. */
export async function runClaimAdjudicator(opts: {
	primaryRepoRoot?: string;
	task: string;
	model: string;
}): Promise<{ ok: boolean; error?: string; summary?: string; model: string }> {
	const run = await runMaintainAgent({
		agent: CONSTRUCT_FIXER_AGENT,
		primaryRepoRoot: opts.primaryRepoRoot,
		task: opts.task,
		model: opts.model,
	});
	return {
		ok: run.ok,
		error: run.error,
		summary: run.summary,
		model: run.model,
	};
}

interface MaintainRunContext {
	graph: StoredSubsystemModel;
	/** Model resolved for this run (before any per-run fallback). */
	model: string;
	credentialed: string[] | null;
	root?: string;
}

/**
 * Install agents, load the model, and resolve the maintainer model — the
 * shared preamble for a single-stage run and a full sequence.
 */
async function resolveMaintainRunContext(
	graphId: string,
	opts?: { model?: string },
): Promise<
	{ ok: true; ctx: MaintainRunContext } | { ok: false; error: string }
> {
	const installed = ensureMaintainAgentsInstalled();
	if (!installed.ok) {
		return { ok: false, error: installed.error ?? "failed to install agents" };
	}

	const graph = await getSubsystemModel(graphId);
	if (!graph) return { ok: false, error: `unknown graph: ${graphId}` };

	const settings = loadViewerSettings();
	const override = opts?.model?.trim();
	const resolved = await resolveSubsystemMaintainerModel({
		configured: override || settings.subsystemMaintainerModel,
	});

	// A remembered model whose provider has no credential (e.g. a free
	// opencode/Zen model from the old picker) can never execute headless and
	// would override the working credentialed default forever — drop it.
	if (
		!override &&
		resolved.source !== "settings" &&
		resolved.source !== "env" &&
		settings.subsystemMaintainerModel
	) {
		patchViewerSettings(settings, { subsystemMaintainerModel: null });
	}

	const credentialed = resolved.credentialedProviders ?? null;
	let model = resolved.model;
	// Degraded-memory fast path: the free tier just proved unusable, so don't
	// re-burn the 30s liveness timeout — go straight to the credentialed fallback.
	if (
		isModelUnusable(model) &&
		modelProviderOf(model) === "opencode" &&
		credentialed?.includes("opencode-go")
	) {
		model = FALLBACK_MAINTAINER_MODEL;
	}

	return {
		ok: true,
		ctx: { graph, model, credentialed, root: primaryRepoRoot(graph) },
	};
}

interface MaintainStageRunResult {
	ok: boolean;
	/** Durable run id for this stage — the join key for its proposals. */
	runId: string;
	model: string;
	error?: string;
	summary?: string;
	sessionId?: string;
	unusable?: boolean;
}

/**
 * Run exactly one stage's agent against a supplied audit report, log the run,
 * and retry once on the credentialed fallback when the free tier proves
 * unusable headless.
 */
async function runMaintainStage(opts: {
	ctx: MaintainRunContext;
	graphId: string;
	report: SubsystemModelAuditReport;
	route: MaintainRoute;
	verdict?: SubsystemModelAuditVerdict;
	onSession?: (sessionId: string) => void;
}): Promise<MaintainStageRunResult> {
	const { ctx, graphId, report, route, verdict } = opts;
	const { agent, mode, layer } = route;
	const graph = ctx.graph;

	const runOnce = async (runModel: string, probeRunId: string) => {
		const runId = randomUUID();
		const startedAt = new Date().toISOString();
		let sessionId: string | undefined;
		const run = await runMaintainAgent({
			agent,
			primaryRepoRoot: ctx.root,
			task: buildMaintainBrief({
				graph,
				report,
				route,
				probeRunId,
				runId,
			}),
			model: runModel,
			graphId,
			title: `Maintain — ${graph.title}`,
			// The session id arrives from the create POST; write the durable
			// sessionId -> graphId pair as soon as it does.
			onSession: (sid) => {
				sessionId = sid;
				// Best-effort: a failed log write must never break the run.
				void noteSubsystemModelRunStart({
					graphId,
					graphTitle: graph.title,
					sessionId: sid,
					runId,
					agent,
					layer,
					mode,
					model: runModel,
					startedAt,
				}).catch(() => {});
				opts.onSession?.(sid);
			},
			probeRunId,
			firstActivityTimeoutMs: firstActivityTimeoutMsFor(runModel),
		});
		try {
			await noteSubsystemModelRunFinish({
				graphId,
				graphTitle: graph.title,
				runId,
				sessionId: run.sessionId ?? sessionId,
				agent,
				layer,
				mode,
				model: run.model || runModel,
				status: run.ok ? "done" : "error",
				ok: run.ok,
				error: run.error,
				summary: run.summary,
				verdict,
				endedAt: new Date().toISOString(),
			});
		} catch {
			// Best-effort log — never fail the run over it.
		}
		return { run, runId };
	};

	let { run, runId } = await runOnce(ctx.model, randomUUID());

	// The model could not make its first tool call — it's unusable headless.
	// Remember that, then retry once on the credentialed fallback if we have one.
	if (!run.ok && run.unusable) {
		rememberModelUnusable(run.model);
		if (
			modelProviderOf(run.model) === "opencode" &&
			ctx.credentialed?.includes("opencode-go")
		) {
			({ run, runId } = await runOnce(FALLBACK_MAINTAINER_MODEL, randomUUID()));
		}
	}

	return {
		ok: run.ok,
		runId,
		model: run.model || ctx.model,
		error: run.error,
		summary: run.summary,
		sessionId: run.sessionId,
		unusable: run.unusable,
	};
}

/**
 * Full host path: install agents → audit → route by verdict → brief → opencode.
 */
export async function maintainSubsystemModel(
	graphId: string,
	opts?: {
		model?: string;
		onSession?: (sessionId: string) => void;
	},
): Promise<MaintainModelResult> {
	const resolved = await resolveMaintainRunContext(graphId, opts);
	if (!resolved.ok) return { ok: false, error: resolved.error };
	const { ctx } = resolved;

	const audit = await auditSubsystemModel(graphId);
	if (!audit.ok) return { ok: false, error: audit.error };

	const verdict = classifyAuditReport(audit.report);
	const route = selectMaintainRoute(audit.report);
	const pendingCount = await pendingProposalCount(graphId);

	if (!route) {
		const summary = "Fully verified — nothing for Maintain to propose";
		try {
			await noteSubsystemModelRunFinish({
				graphId,
				graphTitle: ctx.graph.title,
				status: "skipped",
				model: ctx.model,
				verdict,
				pendingCount,
				summary,
			});
		} catch {
			// Best-effort log — skip reporting still succeeds without it.
		}
		return {
			ok: true,
			skipped: true,
			verdict,
			model: ctx.model,
			pendingCount,
			summary,
		};
	}

	const stage = await runMaintainStage({
		ctx,
		graphId,
		report: audit.report,
		route,
		verdict,
		onSession: opts?.onSession,
	});

	const pendingAfter = await pendingProposalCount(graphId);
	if (!stage.ok) {
		return {
			ok: false,
			error: stage.error,
			model: stage.model,
			agent: route.agent,
			layer: route.layer,
			mode: route.mode,
			verdict,
			pendingCount: pendingAfter,
			summary: stage.summary,
			sessionId: stage.sessionId,
		};
	}
	return {
		ok: true,
		model: stage.model,
		agent: route.agent,
		layer: route.layer,
		mode: route.mode,
		verdict,
		pendingCount: pendingAfter,
		summary: stage.summary,
		sessionId: stage.sessionId,
	};
}

export interface MaintainSequenceHostResult {
	ok: boolean;
	outcome: MaintainSequenceOutcome;
	stages: MaintainStageOutcome[];
	blockedAt?: MaintainRoute;
	error?: string;
	model?: string;
	pendingCount: number;
}

/**
 * Full sequenced path: audit → run each routed stage in priority order,
 * advancing only when a stage leaves no pending proposals. Stops and surfaces
 * (`needs_unblock`) the moment a stage does not clear — see runMaintainSequence.
 */
export async function maintainSubsystemModelSequence(
	graphId: string,
	opts?: {
		model?: string;
		onSession?: (sessionId: string) => void;
		maxStages?: number;
	},
): Promise<MaintainSequenceHostResult> {
	const resolved = await resolveMaintainRunContext(graphId, opts);
	if (!resolved.ok) {
		return {
			ok: false,
			outcome: "error",
			stages: [],
			error: resolved.error,
			pendingCount: 0,
		};
	}
	const { ctx } = resolved;
	let lastModel = ctx.model;

	const result = await runMaintainSequence({
		audit: async () => {
			const audited = await auditSubsystemModel(graphId);
			if (!audited.ok) throw new Error(audited.error);
			return audited.report;
		},
		runStage: async (route, report) => {
			const stage = await runMaintainStage({
				ctx,
				graphId,
				report,
				route,
				verdict: classifyAuditReport(report),
				onSession: opts?.onSession,
			});
			lastModel = stage.model;
			return {
				ok: stage.ok,
				runId: stage.runId,
				error: stage.error,
				sessionId: stage.sessionId,
				summary: stage.summary,
			};
		},
		pendingForRun: (runId) => pendingProposalCountForRun(graphId, runId),
		maxStages: opts?.maxStages,
	});

	const pendingCount = await pendingProposalCount(graphId);
	return {
		ok: result.ok,
		outcome: result.outcome,
		stages: result.stages,
		blockedAt: result.blockedAt,
		error: result.error,
		model: lastModel,
		pendingCount,
	};
}

export function readMaintainAgentSystemPrompt(agent: MaintainAgentId): string {
	try {
		ensureMaintainAgentsInstalled();
		const path = agentInstallPath(agent);
		return readFileSync(path, "utf8");
	} catch (err) {
		return `(system prompt unavailable — ${(err as Error).message})`;
	}
}

/** @deprecated Use readMaintainAgentSystemPrompt. */
export function readClaimAdjudicatorSystemPrompt(): string {
	return readMaintainAgentSystemPrompt(CONSTRUCT_FIXER_AGENT);
}

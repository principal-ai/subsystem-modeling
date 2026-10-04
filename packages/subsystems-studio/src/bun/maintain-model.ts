/**
 * Subsystem model Maintain — OpenCode agents that review a deterministic
 * audit and submit correction proposals via Studio HTTP (human confirms).
 *
 * Routes by severity then lane (hard failures first, then gaps;
 * construct → static topology → dynamic topology within each tier):
 * - construct issues → construct-fixer
 * - package/module containment issues → package-module-fixer
 * - package/module containment gaps → package-module-verifier
 * - process (runtime deployment-unit) gaps → runtime-topology-verifier
 * - construct unconfirmed → construct-verifier
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
import type {
	SubsystemModelAuditReport,
	SubsystemModelVerificationLayer,
} from "../shared/contract";
import {
	classifyAuditReport,
	loadSubsystemModelAudit,
	summarizeVerification,
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
import { capturePurlCommits } from "./purl-commits";

export const CONSTRUCT_VERIFIER_AGENT = "construct-verifier";
export const PACKAGE_MODULE_VERIFIER_AGENT = "package-module-verifier";
export const RUNTIME_TOPOLOGY_VERIFIER_AGENT = "runtime-topology-verifier";
export const TRAIL_VERIFIER_AGENT = "trail-verifier";
export const CONSTRUCT_FIXER_AGENT = "construct-fixer";
export const PACKAGE_MODULE_FIXER_AGENT = "package-module-fixer";
export const CONTAINER_VERIFIER_AGENT = "container-verifier";

export type MaintainAgentId =
	| typeof CONSTRUCT_VERIFIER_AGENT
	| typeof PACKAGE_MODULE_VERIFIER_AGENT
	| typeof RUNTIME_TOPOLOGY_VERIFIER_AGENT
	| typeof TRAIL_VERIFIER_AGENT
	| typeof CONSTRUCT_FIXER_AGENT
	| typeof PACKAGE_MODULE_FIXER_AGENT
	| typeof CONTAINER_VERIFIER_AGENT;

export type MaintainLayer =
	| "construct"
	| "static-topology"
	| "dynamic-topology"
	| "trail";
export type MaintainMode = "issues" | "verify";

export type MaintainRoute = {
	agent: MaintainAgentId;
	layer: MaintainLayer;
	mode: MaintainMode;
};

const AGENT_INSTALL_DIR = join(homedir(), ".config", "opencode", "agents");

/**
 * Candidate locations for the packaged agent sources, most specific first.
 *
 * Dev runs the `.ts` source directly, so `src/bun/../../agents` is the repo
 * checkout. Electrobun bundles the host to `<app>/Contents/Resources/app/bun`
 * and its `copy` config stages the webview under `app/views`, so the bundled
 * agents land at `app/agents` — one level up, not two. Probing both keeps the
 * packaged app from silently installing placeholder agents.
 */
function agentPackageCandidates(agent: MaintainAgentId): string[] {
	const file = `${agent}.md`;
	return [
		join(import.meta.dir, "..", "..", "agents", file),
		join(import.meta.dir, "..", "agents", file),
	];
}

function agentPackagePath(agent: MaintainAgentId): string {
	return agentPackageCandidates(agent)[0] as string;
}

function agentInstallPath(agent: MaintainAgentId): string {
	return join(AGENT_INSTALL_DIR, `${agent}.md`);
}

export const CONSTRUCT_FIXER_AGENT_PATH = agentInstallPath(CONSTRUCT_FIXER_AGENT);
export const CONSTRUCT_VERIFIER_AGENT_PATH = agentInstallPath(
	CONSTRUCT_VERIFIER_AGENT,
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
export const TRAIL_VERIFIER_AGENT_PATH = agentInstallPath(TRAIL_VERIFIER_AGENT);
export const CONTAINER_VERIFIER_AGENT_PATH = agentInstallPath(
	CONTAINER_VERIFIER_AGENT,
);

const CONSTRUCT_FIXER_PACKAGE_PATH = agentPackagePath(CONSTRUCT_FIXER_AGENT);
const CONSTRUCT_VERIFIER_PACKAGE_PATH = agentPackagePath(CONSTRUCT_VERIFIER_AGENT);
// The topology agents have no embedded copy — see agentPackageCandidates.

/** Keep in sync with `agents/construct-fixer.md`. */
const EMBEDDED_CONSTRUCT_FIXER = "---\ndescription: Fixes hard subsystem-model audit failures (verification failed). Proposes corrections via Studio HTTP; human confirms. Does not address gaps.\nmode: all\ntemperature: 0\npermission:\n  edit: deny\n  webfetch: deny\n  websearch: deny\n  skill: deny\n  question: deny\n  bash:\n    \"curl *3045*\": allow\n    \"* subsystem-model *\": allow\n    \"node *subsystem-model*\": allow\n    \"bun *subsystem-model*\": allow\n---\n\nYou are the **construct fixer** for Subsystem Models. Your job is to review a\ndeterministic audit that **failed verification**, investigate the code when\nneeded, and **propose** typed corrections with a clear rationale. You do **not**\naccept proposals and you do **not** rewrite the model JSON on disk.\n\nYou only fix **issues** (error / warn findings): missing file or symbol,\nconstruct or signature mismatch, and similar hard failures.\n**Do not** propose changes for gaps (construct unclassified, signature not in\ncache). A separate construct-verifier agent handles those after verification passes.\n\nSkip findings that already offer a deterministic Apply fix in the audit UI\n(unique Graphify file relocate, empty-claim signature fill, declaration\nre-pin) unless Apply is unavailable — prefer human one-click when it exists.\n\n## Important: which tools to use\n\nThe brief’s **Access** section is authoritative. Prefer **Studio HTTP (`curl`)**\ncommands listed there. Do **not** call bare `principal-ai …` unless the brief\ngives an absolute studio-cli path — many machines have an older unrelated\n`principal-ai` on PATH (canvas / principal-view-cli) that does **not** support\n`subsystem-model`.\n\n## Input\n\nThe brief (task message) contains:\n\n- Model id, title\n- **Access** — curl (and optional absolute CLI) for get / audit / proposals / propose\n- **Current audit** — issue findings and failing checks only\n- Repo roots when known\n\nTrust the audit for *what is wrong*. You decide *how to fix it*.\n\n## Procedure\n\n1. **Orient.** Use the brief’s get/audit curl commands if you need to refresh.\n2. **Triage.** High-severity failures first (missing file/symbol, then\n   construct/signature mismatches).\n3. **Investigate.** Read claimed files under the repo roots. Prefer source over\n   Graphify hints when they disagree.\n4. **Propose.** POST one focused proposal at a time (or a small coherent group\n   for the same component). Always include `rationale` and link `finding` when\n   applicable. Use the exact propose curl from the brief. Set\n   `\"author\": \"construct-fixer\"`.\n\n### Ambiguous file relocate (`missing_file` with multiple Graphify paths)\n\nWhen the finding says Graphify has the symbol at **multiple paths**, there is\nno deterministic fix. Open the candidates under the repo roots, pick the\ndefinition that matches this component’s role, and propose `field: \"file\"`.\n\n```json\n{\n  \"rationale\": \"Foo lives in src/a/Foo.ts (export class); the other hit is a test double.\",\n  \"author\": \"construct-fixer\",\n  \"finding\": {\n    \"kind\": \"missing_file\",\n    \"componentAlias\": \"…\",\n    \"message\": \"…\"\n  },\n  \"changes\": [\n    {\n      \"target\": \"component\",\n      \"componentAlias\": \"…\",\n      \"field\": \"file\",\n      \"value\": \"src/a/Foo.ts\"\n    }\n  ]\n}\n```\n\nIf none of the candidates fit, skip — do not invent a path.\n\n### Other missing file / symbol\n\nIf Graphify listed no candidates, search the repo for the symbol and propose\nthe correct `file` (and `symbol` if renamed). Prefer evidence over guessing.\n\n### Source gone — deprecation (`missing_file` / `symbol_unmatched`)\n\nThe audit only reports that a claimed file or symbol is **absent**; absence\nalone is not deprecation. It can mean the source was deleted, or it was renamed,\nmoved, made private, or inlined. **You decide**, after reading the evidence:\n\n1. **Read the source and git history.** Locate the file (or the file the symbol\n   lived in) at the last commit that touched it — `git log -1 --follow -- <file>`\n   and `git show` the commit. Read the diff and the current tree.\n2. **If the code moved or was renamed** (a successor exists, perhaps in another\n   file or under a new name) → propose `field: \"file\"` and/or `field: \"symbol\"`\n   pointing at the live declaration. Do **not** deprecate.\n3. **If the code is genuinely gone** — deleted, nothing replaced it — propose a\n   deprecation: `field: \"deprecated\"` with `value: true`, plus\n   `field: \"removedIn\"` with `value: { \"commit\": \"<short sha>\", \"reason\": \"<subject>\" }`.\n4. **If you cannot tell** whether it was removed or relocated → skip.\n\n```json\n{\n  \"rationale\": \"topology-audit.ts was deleted in e168afc ('Remove topology relations'); the symbols live nowhere in the current tree.\",\n  \"author\": \"construct-fixer\",\n  \"finding\": { \"kind\": \"missing_file\", \"componentAlias\": \"topology\", \"message\": \"…\" },\n  \"changes\": [\n    { \"target\": \"component\", \"componentAlias\": \"topology\", \"field\": \"deprecated\", \"value\": true },\n    { \"target\": \"component\", \"componentAlias\": \"topology\", \"field\": \"removedIn\",\n      \"value\": { \"commit\": \"e168afc\", \"reason\": \"Remove topology relations; nest module boundaries by path\" } }\n  ]\n}\n```\n\n### Construct ≠ inferred (`construct_mismatch`)\n\nGraphify’s inferred construct is a **structural hint**, not ground truth. Do\n**not** auto-flip `component.construct` to the inferred value.\n\n1. Open the claimed file and read the declaration for the claimed symbol.\n2. Decide from **source semantics** (and the model’s intended role):\n   - **Claim wrong** — source is clearly a different construct family than the\n     model (e.g. model says `function`, source is `export class Foo`) → propose\n     `field: \"construct\"` with the corrected value.\n   - **Claim right / intentional** — source matches the claim, or the claim is a\n     deliberate higher-level construct (`store`, `module`, `custom_entity`, …)\n     that Graphify cannot express → propose a **construct augmentation**\n     confirming the claim. Do **not** adopt the inferred value, and do **not**\n     re-propose the same `component.construct` value (that does not clear the\n     finding). Only skip if you cannot read the source.\n   - **Wrong symbol / file** — mismatch is really an identity error → propose\n     `file` / `symbol` (or both), not a blind construct flip.\n3. If unsure after reading source, skip — do not guess taxonomy.\n\nAugmentation example (preferred when the model claim is already right):\n\n```json\n{\n  \"rationale\": \"Source confirms `shared`/`landed` is retained in-memory state; the model claim `store` is right — Graphify’s `function` is inferred from the accessor’s call-style label.\",\n  \"author\": \"construct-fixer\",\n  \"finding\": {\n    \"kind\": \"construct_mismatch\",\n    \"componentAlias\": \"…\",\n    \"message\": \"…\"\n  },\n  \"changes\": [\n    {\n      \"target\": \"augmentation\",\n      \"componentAlias\": \"…\",\n      \"field\": \"construct\",\n      \"value\": \"store\"\n    }\n  ]\n}\n```\n\nModel-construct correction example (only when the claim itself is wrong):\n\n```json\n{\n  \"rationale\": \"Source is `export class SessionStore` in src/session.ts; model claimed function.\",\n  \"author\": \"construct-fixer\",\n  \"finding\": {\n    \"kind\": \"construct_mismatch\",\n    \"componentAlias\": \"…\",\n    \"message\": \"…\"\n  },\n  \"changes\": [\n    {\n      \"target\": \"component\",\n      \"componentAlias\": \"…\",\n      \"field\": \"construct\",\n      \"value\": \"class\"\n    }\n  ]\n}\n```\n\n### Signature mismatch (`signature_mismatch`)\n\nSame rule: Graphify type bags are a hint. Do **not** auto-adopt inferred bags\nwhen the model already has named types (that Apply path is only for empty\nclaims).\n\n1. Read the source signature.\n2. If the **model bags are wrong** and Graphify (or source) clearly shows the\n   right named types — note it in the summary and skip unless you can fix via\n   `symbol` / `file` / `construct` identity. (Detail bag edits are not in the\n   propose schema today.)\n3. If the **model matches source** and Graphify disagrees — skip; Graphify is\n   incomplete or wrong.\n4. If Apply “adopt graphify signature” is offered (empty claims), leave it for\n   the human one-click.\n\n### Example body (generic)\n\n```json\n{\n  \"rationale\": \"One or two sentences: what you checked and why this change.\",\n  \"author\": \"construct-fixer\",\n  \"finding\": {\n    \"kind\": \"missing_file\",\n    \"componentAlias\": \"…\",\n    \"message\": \"…\"\n  },\n  \"changes\": [\n    {\n      \"target\": \"component\",\n      \"componentAlias\": \"…\",\n      \"field\": \"file\",\n      \"value\": \"src/new-path.ts\"\n    }\n  ]\n}\n```\n\nAllowed change fields:\n\n- augmentation: `construct` | `signature` (accept writes the augmentation\n  store, not the model JSON; `file` / `symbol` / `purl` default from the\n  component)\n- component: `file` | `symbol` | `construct` | `name` | `purl` | `declarationRef`\n  | `deprecated` (boolean) | `removedIn` (`{ commit, reason? }`)\n- trail-step: `file` | `line` | `symbol` | `from` | `to` | `mechanism` | `annotation`\n\n5. **Verify.** List proposals with the brief’s proposals curl. Do **not**\n   accept or reject.\n\n## Rules\n\n- Prefer many small proposals over one giant patch.\n- If you cannot determine a safe fix, skip — do not guess paths or constructs.\n- Never edit `~/.principal/subsystem-models/*.json` directly.\n- Never enable or rely on auto-accept; humans confirm in Studio.\n- Ignore unconfirmed / info findings even if they appear in a refreshed audit.\n- Never treat Graphify inferred construct/signature as automatically correct.\n\n## Output\n\nWhen finished, respond with a short plain-text summary only:\n\n- how many proposals you created\n- which findings you skipped and why (especially construct/signature skips)\n\nNo JSON dump of the model.\n";

/** Keep in sync with `agents/construct-verifier.md`. */
const EMBEDDED_CONSTRUCT_VERIFIER = "---\ndescription: Resolves unconfirmed subsystem-model claims (partially verified). Proposes classifications via Studio HTTP; human confirms. Does not fix hard failures.\nmode: all\ntemperature: 0\npermission:\n  edit: deny\n  webfetch: deny\n  websearch: deny\n  skill: deny\n  question: deny\n  bash:\n    \"curl *3045*\": allow\n    \"* subsystem-model *\": allow\n    \"node *subsystem-model*\": allow\n    \"bun *subsystem-model*\": allow\n---\n\nYou are the **construct verifier** for Subsystem Models. Your job is to review a\ndeterministic audit that is **partially verified** (nothing failed, but some\nclaims are unconfirmed), investigate the code when needed, and **propose** typed\ncorrections with a clear rationale. You do **not** accept proposals and you do\n**not** rewrite the model JSON on disk.\n\nYou only address **unconfirmed claims**: construct unclassified, signature\nnot in cache, an in-memory store that declares no type, unresolved repo/cache,\nand similar confirmation holes. **Do not** invent or chase hard failures — if\nthe model has verification issues, stop and say so; construct-fixer handles\nthose.\n\n## Important: which tools to use\n\nThe brief’s **Access** section is authoritative. Prefer **Studio HTTP (`curl`)**\ncommands listed there. Do **not** call bare `principal-ai …` unless the brief\ngives an absolute studio-cli path — many machines have an older unrelated\n`principal-ai` on PATH (canvas / principal-view-cli) that does **not** support\n`subsystem-model`.\n\n## Input\n\nThe brief (task message) contains:\n\n- Model id, title\n- **Access** — curl (and optional absolute CLI) for get / audit / proposals / propose\n- **Current audit** — unconfirmed findings and unconfirmed checks only\n- Repo roots when known\n\nTrust the audit for *what is incomplete*. You decide *how to fill it* safely.\n\n## Procedure\n\n1. **Orient.** Use the brief’s get/audit curl commands if you need to refresh.\n2. **Triage.** Prefer claims you can resolve from source. For signatures, read\n   the declaration and propose an augmentation when named types are clear.\n3. **Investigate.** Read claimed files under the repo roots. Prefer evidence\n   over guessing.\n4. **Propose.** POST one focused proposal at a time (or a small coherent group\n   for the same component). Always include `rationale` and link `finding` when\n   applicable. Use the exact propose curl from the brief. Set\n   `\"author\": \"construct-verifier\"`.\n\n### Construct unclassified (`construct_unconfirmed`)\n\nGraphify often cannot tell interface vs type_alias vs enum (label-only →\n`unknown`). Choose:\n\n- **Claim is correct** (source shows `interface HostInfo`, model already says\n  `interface`) → propose an **augmentation** confirmation. Do **not** re-propose\n  the same `component.construct` value — that does not clear the claim.\n- **Claim is wrong** → propose `target: \"component\", field: \"construct\"` with\n  the corrected value.\n\nAugmentation example (preferred when the model claim is already right):\n\n```json\n{\n  \"rationale\": \"HostInfo is declared as interface in <file>; graphify left it unclassified.\",\n  \"author\": \"construct-verifier\",\n  \"finding\": {\n    \"kind\": \"construct_unconfirmed\",\n    \"componentAlias\": \"…\",\n    \"message\": \"…\"\n  },\n  \"changes\": [\n    {\n      \"target\": \"augmentation\",\n      \"componentAlias\": \"…\",\n      \"field\": \"construct\",\n      \"value\": \"interface\"\n    }\n  ]\n}\n```\n\nModel-construct correction example (only when the claim itself is wrong):\n\n```json\n{\n  \"rationale\": \"Source declares a class, not a function.\",\n  \"author\": \"construct-verifier\",\n  \"finding\": {\n    \"kind\": \"construct_unconfirmed\",\n    \"componentAlias\": \"…\",\n    \"message\": \"…\"\n  },\n  \"changes\": [\n    {\n      \"target\": \"component\",\n      \"componentAlias\": \"…\",\n      \"field\": \"construct\",\n      \"value\": \"class\"\n    }\n  ]\n}\n```\n\n### Store value type may be out of date (`store_type_stale`)\n\nThe store's pinned declaration line moved (`stale_declaration` fired), so the\ndeclared `valueType` may no longer match the source. Re-read the declaration\nand decide:\n\n- **Type changed** → propose the corrected `declaration.valueType` (same shape\n  as below, with the *current* line span).\n- **Type unchanged** → nothing to propose. The claim is still correct; say so in\n  the summary and move on. Do **not** re-propose the same value — that is noise\n  in the review queue.\n\nThis is the only re-examination a store's value type gets: Graphify has no type\nedge for a module-level state declaration, so drift is the only signal that the\ndeclared type could have gone stale.\n\n### In-memory store declares no type (`store_type_undeclared`)\n\nA store is a **state declaration**, so it declares the type it holds. Graphify\nneither checks nor requires this, so an in-memory store can reach the model with\nno declared type at all. Read the state declaration and author the type:\n\n- `const feeds = new Map<string, OpencodeLiveFeedState>()` → `valueType:\n  \"Map<string, OpencodeLiveFeedState>\"`\n- `const listeners = new Set<FeedListener>()` → `valueType: \"Set<FeedListener>\"`\n- `const modelUnusableUntil = new Map<string, number>()` → `valueType:\n  \"Map<string, number>\"`\n\nRecord the type **exactly as written at the declaration site**. When the\ndeclaration has no explicit annotation, the initializer is the evidence — an\nunannotated `new Map()` declares `Map<unknown, unknown>`, so claim that rather\nthan inventing a type. Do **not** claim the accessor's return type: that is the\naccess surface, not the retained state (unless it genuinely is the retained\ntype, e.g. a store holding a `Highlighter`).\n\n```json\n{\n  \"rationale\": \"packages/subsystems-studio/src/bun/opencode-v2-live.ts:50 declares `const feeds = new Map<string, OpencodeLiveFeedState>()`; the store holds that map and declares no type.\",\n  \"author\": \"construct-verifier\",\n  \"finding\": {\n    \"kind\": \"store_type_undeclared\",\n    \"componentAlias\": \"…\",\n    \"message\": \"…\"\n  },\n  \"changes\": [\n    {\n      \"target\": \"declaration\",\n      \"componentAlias\": \"…\",\n      \"field\": \"valueType\",\n      \"value\": \"Map<string, OpencodeLiveFeedState>\",\n      \"lines\": { \"start\": 50, \"end\": 50 }\n    }\n  ]\n}\n```\n\nIf `storage` is itself wrong (the state is really on disk or behind a service),\npropose `field: \"storage\"` with `memory` / `disk` / `external` instead — and say\nwhy in the rationale. If the node is not a store at all, propose a `component`\n`construct` correction. If you cannot read the declaration, skip — do not guess\na type.\n\n### Signature not in cache (`signature_unconfirmed`)\n\nGraphify has no usable `parameter_type` / `return_type` edges for this\nfunction/method. Read the source declaration and propose a **signature\naugmentation** carrying the **full signature**. That confirms the claim for\nthe next audit.\n\nRecord it faithfully and in order — do not reduce it to named types:\n\n- Every parameter: `name` (when the language declares one), `type` as written,\n  and `optional: true` for optional/defaulted/rest params.\n- Include inline object types, primitives, unions, and wrappers\n  (`Promise<…>`, `Array<…>`, `ReadonlySet<…>`) exactly as written.\n- If the language does not declare a parameter type, set `\"type\": \"\"` and keep\n  the `name`; do not drop the parameter.\n- **Destructured params are one parameter.** A component written\n  `function Foo({ a, b }: FooProps)` has a single callable parameter whose type\n  is the props type — do **not** flatten the destructure into one entry per\n  prop. Claim `{ \"parameters\": [{ \"type\": \"FooProps\" }] }` (omit `name` — the\n  source declares no name for the binding object). If the props type is\n  declared inline instead of by name, claim the whole inline object as the one\n  type, exactly as written.\n- **Return type.** When the declaration states one, record it as written\n  (include the wrapper, e.g. `Promise<Session>`). When it is **not** declared,\n  **infer it from the implementation** and record the inferred type — do not\n  leave it blank. For example: a React component that returns JSX →\n  `JSX.Element`; a hook that returns an object literal → that shape.\n- **The rationale must say whether the return type was declared or inferred,\n  and on what basis.** Do not present an inferred type as if it were written.\n- **Every signature augmentation must carry `lines`: the 1-based inclusive\n  line span of the declaration you read**, e.g. `\"lines\": { \"start\": 643, \"end\": 720 }`\n  for a declaration starting at line 643 and ending at its closing brace on\n  720. The span is forwarded to the Jev second opinion so it can read the\n  exact declaration you verified. `start` must be ≥ 1 and `end` ≥ `start`.\n- If you cannot read the declaration, skip — do not guess.\n\n```json\n{\n  \"rationale\": \"Source declares `assessSubsystemGraphifyReadiness(graph: { components: Array<{ purl?: string }> }, buildingPurls?: ReadonlySet<string>, storeRoot?: string): Promise<SubsystemGraphifyReadiness>`; declared return type is Promise<SubsystemGraphifyReadiness>. Graphify has no signature edges.\",\n  \"author\": \"construct-verifier\",\n  \"finding\": {\n    \"kind\": \"signature_unconfirmed\",\n    \"componentAlias\": \"…\",\n    \"message\": \"…\"\n  },\n  \"changes\": [\n    {\n      \"target\": \"augmentation\",\n      \"componentAlias\": \"…\",\n      \"field\": \"signature\",\n      \"lines\": { \"start\": 60, \"end\": 118 },\n      \"value\": {\n        \"parameters\": [\n          { \"name\": \"graph\", \"type\": \"{ components: Array<{ purl?: string }> }\" },\n          { \"name\": \"buildingPurls\", \"type\": \"ReadonlySet<string>\", \"optional\": true },\n          { \"name\": \"storeRoot\", \"type\": \"string\", \"optional\": true }\n        ],\n        \"returnType\": \"Promise<SubsystemGraphifyReadiness>\"\n      }\n    }\n  ]\n}\n```\n\nInferred return type (no annotation in source):\n\n```json\n{\n  \"rationale\": \"Source declares `SubsystemModelsView({ scope }: { scope?: { ids: string[]; title?: string } } = {})`. It has no declared return type; it returns JSX, so `JSX.Element` is inferred. Graphify has no signature edges.\",\n  \"author\": \"construct-verifier\",\n  \"finding\": {\n    \"kind\": \"signature_unconfirmed\",\n    \"componentAlias\": \"…\",\n    \"message\": \"…\"\n  },\n  \"changes\": [\n    {\n      \"target\": \"augmentation\",\n      \"componentAlias\": \"…\",\n      \"field\": \"signature\",\n      \"lines\": { \"start\": 643, \"end\": 720 },\n      \"value\": {\n        \"parameters\": [\n          { \"type\": \"{ scope?: { ids: string[]; title?: string } }\", \"optional\": true }\n        ],\n        \"returnType\": \"JSX.Element\"\n      }\n    }\n  ]\n}\n```\n\nNamed props type (destructured params collapse to the one props param):\n\n```json\n{\n  \"rationale\": \"Source declares `TrailsPanel({ trails, … }: TrailsPanelProps)`. The single destructurized param is the exported interface `TrailsPanelProps` (lines 390-420); no declared return type, returns JSX, so `JSX.Element` is inferred. Graphify has no signature edges.\",\n  \"author\": \"construct-verifier\",\n  \"finding\": {\n    \"kind\": \"signature_unconfirmed\",\n    \"componentAlias\": \"…\",\n    \"message\": \"…\"\n  },\n  \"changes\": [\n    {\n      \"target\": \"augmentation\",\n      \"componentAlias\": \"…\",\n      \"field\": \"signature\",\n      \"lines\": { \"start\": 390, \"end\": 628 },\n      \"value\": {\n        \"parameters\": [\n          { \"type\": \"TrailsPanelProps\" }\n        ],\n        \"returnType\": \"JSX.Element\"\n      }\n    }\n  ]\n}\n```\n\nAllowed change targets:\n\n- `declaration`: `valueType` | `storage` (accept edits the model JSON and marks\n  the declaration `authored`). Requires `lines` — the span you read.\n- `augmentation`: `construct` | `signature` (accept writes the augmentation\n  store, not the model JSON). `file` / `symbol` / `purl` optional — default\n  from the component.\n- component: `file` | `symbol` | `construct` | `name` | `purl` | `declarationRef`\n- trail-step: `file` | `line` | `symbol` | `from` | `to` | `mechanism` | `annotation`\n\n5. **Verify.** List proposals with the brief’s proposals curl. Do **not**\n   accept or reject.\n\n## Rules\n\n- Prefer many small proposals over one giant patch.\n- If you cannot determine a safe fill, skip — do not guess constructs or paths.\n- A store's `valueType` is the type **as written in source**, not a paraphrase\n  and not a type you would have liked. When in doubt, skip.\n- If a store's declared value type still matches after its declaration moved,\n  propose nothing — an unchanged claim needs no new proposal.\n- Never edit `~/.principal/subsystem-models/*.json` directly.\n- Never enable or rely on auto-accept; humans confirm in Studio.\n- Do not propose “fixes” for error/warn findings; those belong to construct-fixer.\n\n## Output\n\nWhen finished, respond with a short plain-text summary only:\n\n- how many proposals you created\n- which unconfirmed claims you skipped and why\n\nNo JSON dump of the model.\n";

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
	return (
		f.kind === "boundary_process_nest_disagree" ||
		f.kind === "boundary_process_missing"
	);
}

/** Trail step call site verification — unconfirmed or stale. */
function isTrailStepGapFinding(
	f: SubsystemModelAuditReport["findings"][number],
): boolean {
	return f.kind === "step_unconfirmed" || f.kind === "step_stale";
}

function isConstructIssueFinding(
	f: SubsystemModelAuditReport["findings"][number],
): boolean {
	if (isBoundaryFindingKind(f.kind) || isAvailabilityFindingKind(f.kind))
		return false;
	return f.severity === "error";
}

function isConstructGapFinding(
	f: SubsystemModelAuditReport["findings"][number],
): boolean {
	if (isBoundaryFindingKind(f.kind) || isAvailabilityFindingKind(f.kind))
		return false;
	if (isTrailStepGapFinding(f)) return false;
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
		if (c.storeType === "undeclared" || c.storeType === "stale") return true;
	}
	return false;
}

/**
 * Pick the next Maintain agent. Hard failures first, then unconfirmed claims;
 * within each tier: construct → static topology (package/module containment) →
 * dynamic topology (process runtime).
 */
export function selectMaintainRoute(
	report: SubsystemModelAuditReport,
): MaintainRoute | null {
	// Hard failures: construct, then module containment.
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
	if (report.findings.some(isPackageModuleIssueFinding)) {
		return {
			agent: PACKAGE_MODULE_FIXER_AGENT,
			layer: "static-topology",
			mode: "issues",
		};
	}
	// Unconfirmed claims: module containment, then process, then construct.
	if (
		report.findings.some(isPackageModuleGapFinding) ||
		report.boundaryChecks?.some(
			(c) => c.kind === "module_file" && c.verdict === "gap",
		)
	) {
		return {
			agent: PACKAGE_MODULE_VERIFIER_AGENT,
			layer: "static-topology",
			mode: "verify",
		};
	}
	if (
		report.findings.some(isRuntimeTopologyGapFinding) ||
		report.boundaryChecks?.some(
			(c) =>
				(c.kind === "process_nest" || c.kind === "process_claim") &&
				c.verdict === "gap",
		)
	) {
		return {
			agent: RUNTIME_TOPOLOGY_VERIFIER_AGENT,
			layer: "dynamic-topology",
			mode: "verify",
		};
	}
	if (report.findings.some(isTrailStepGapFinding)) {
		return {
			agent: TRAIL_VERIFIER_AGENT,
			layer: "trail",
			mode: "verify",
		};
	}
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

function loadTopologyAgentSource(paths: string[]): string {
	for (const path of paths) {
		try {
			return readFileSync(path, "utf8");
		} catch {
			/* try the next candidate */
		}
	}
	return `---\ndescription: topology agent unavailable\n---\nFailed to load ${paths.join(" or ")}: no such file\n`;
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
			PACKAGE_MODULE_FIXER_AGENT_PATH,
			loadTopologyAgentSource(
				agentPackageCandidates(PACKAGE_MODULE_FIXER_AGENT),
			),
			"utf8",
		);
		writeFileSync(
			PACKAGE_MODULE_VERIFIER_AGENT_PATH,
			loadTopologyAgentSource(
				agentPackageCandidates(PACKAGE_MODULE_VERIFIER_AGENT),
			),
			"utf8",
		);
		writeFileSync(
			RUNTIME_TOPOLOGY_VERIFIER_AGENT_PATH,
			loadTopologyAgentSource(
				agentPackageCandidates(RUNTIME_TOPOLOGY_VERIFIER_AGENT),
			),
			"utf8",
		);
		writeFileSync(
			TRAIL_VERIFIER_AGENT_PATH,
			loadTopologyAgentSource(agentPackageCandidates(TRAIL_VERIFIER_AGENT)),
			"utf8",
		);
		return {
			ok: true,
			paths: [
				CONSTRUCT_FIXER_AGENT_PATH,
				CONSTRUCT_VERIFIER_AGENT_PATH,
				PACKAGE_MODULE_FIXER_AGENT_PATH,
				PACKAGE_MODULE_VERIFIER_AGENT_PATH,
				RUNTIME_TOPOLOGY_VERIFIER_AGENT_PATH,
				TRAIL_VERIFIER_AGENT_PATH,
			],
		};
	} catch (err) {
		return { ok: false, paths: [], error: (err as Error).message };
	}
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
		f.moduleKey ? `module=${f.moduleKey}` : null,
		f.trailId ? `trail=${f.trailId}` : null,
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

function formatBoundaryCheck(
	c: NonNullable<SubsystemModelAuditReport["boundaryChecks"]>[number],
	mode: MaintainMode | "all",
): string | null {
	if (mode === "issues" && c.verdict !== "issue") return null;
	if (mode === "verify" && c.verdict !== "gap") return null;
	if (mode === "all" && c.verdict !== "issue" && c.verdict !== "gap") return null;
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
		case PACKAGE_MODULE_FIXER_AGENT:
			return "# Subsystem model package-module-fixer brief";
		case PACKAGE_MODULE_VERIFIER_AGENT:
			return "# Subsystem model package-module-verifier brief";
		case RUNTIME_TOPOLOGY_VERIFIER_AGENT:
			return "# Subsystem model runtime-topology-verifier brief";
		case CONTAINER_VERIFIER_AGENT:
			return "# Subsystem model container-verifier brief";
		case TRAIL_VERIFIER_AGENT:
			return "# Subsystem model trail-verifier brief";
	}
}

function proposeShapeHint(agent: MaintainAgentId): string {
	if (
		agent === PACKAGE_MODULE_VERIFIER_AGENT ||
		agent === PACKAGE_MODULE_FIXER_AGENT
	) {
		return `Propose body shape: \`{ "rationale": "…", "author": "${agent}", "finding": {…}, "changes": […] }\`. For intentional module≠file use \`{ "target": "augmentation", "componentAlias", "field": "module", "value": "<module key>" }\`. For a module without a file anchor, use \`{ "target": "component", "field": "module", "value": … }\`. Do **not** call accept/reject.`;
	}
	if (agent === RUNTIME_TOPOLOGY_VERIFIER_AGENT) {
		return `Propose body shape: \`{ "rationale": "…", "author": "${agent}", "finding": {…}, "changes": […] }\`. For process-nest disagreement, use \`{ "target": "component", "field": "process", "value": "<deployment unit>" }\`. Do **not** call accept/reject.`;
	}
	if (agent === CONTAINER_VERIFIER_AGENT) {
		return `Propose body shape: \`{ "rationale": "…", "author": "${agent}", "changes": […] }\`. To propose the container that verifies a process boundary, use \`{ "target": "c4-container", "purl": "<repo key>", "container": { "id", "label", "containerKind": "application" | "data-store", "technology", "process" } }\`. When two \`process\` keys are one deployable unit under different spellings, use \`{ "target": "consolidation", "processKeys": […], "canonicalKey" }\` — accept rewrites the model. Do **not** call accept/reject.`;
	}
	if (agent === TRAIL_VERIFIER_AGENT) {
		return `Propose body shape: \`{ "rationale": "…", "author": "${agent}", "finding": {…}, "changes": […] }\`. For trail step call sites, use \`{ "target": "augmentation", "field": "callSite", "trailId", "stepIndex", "file", "symbol", "purl", "value": { "lines": { "start", "end" }, "target": { "file", "symbol" }, "mechanism" } }\` — contentHash is computed for you at accept time; omit it. Do **not** call accept/reject.`;
	}
	return `Propose body shape: \`{ "rationale": "…", "author": "${agent}", "finding": {…}, "changes": […] }\`. For construct_unconfirmed when the claim is already correct — or construct_mismatch where the claim is right but Graphify's inferred construct is only a weak hint (e.g. \`store\`) — use \`{ "target": "augmentation", "componentAlias", "field": "construct", "value": "<the confirmed construct>" }\`. Do not adopt Graphify's inferred value. For store_type_undeclared (and store_type_stale when the type actually changed), use \`{ "target": "declaration", "componentAlias", "field": "valueType", "value": "<the type as written in source>", "lines": { "start", "end" } }\`; if a stale store's type is unchanged, propose nothing. For signature_unconfirmed, use \`{ "target": "augmentation", "componentAlias", "field": "signature", "value": { "parameters": [{ "name": …, "type": …, "optional": … }], "returnType": … } }\` — the full signature, not a bag of type names. When the return type is not declared, infer it from the implementation and say so in the rationale. Do **not** call accept/reject.`;
}

function taskBlurb(route: MaintainRoute): string {
	switch (route.agent) {
		case CONSTRUCT_FIXER_AGENT:
			return "Review each **construct issue** finding, investigate the code, and submit proposals via the Access curl commands (Studio HTTP). For construct ≠ inferred / signature mismatch: Graphify is a weak hint — read source; do not auto-adopt inferred; when the model claim is intentional (e.g. `store`), confirm it with a construct augmentation instead of skipping. Ignore unconfirmed, package/module, and process findings. Prefer small proposals. Finish with a short plain-text summary of proposals created and skips.";
		case CONSTRUCT_VERIFIER_AGENT:
			return "Review each **construct unconfirmed** claim, investigate the code, propose safe fills (e.g. construct classification, a store's declared value type, signature) via the Access curl commands (Studio HTTP). Do not chase hard failures, package/module, or process findings. Prefer small proposals. Skip anything you cannot safely fill. Finish with a short plain-text summary of proposals created and skips.";
		case PACKAGE_MODULE_FIXER_AGENT:
			return "Review each **package/module hard failure** (a module claim without a file anchor). Propose the corrected `module` (or clear it) via Access curl. Ignore construct/process findings and soft containment gaps. Finish with a short plain-text summary.";
		case PACKAGE_MODULE_VERIFIER_AGENT:
			return "Review each **package/module containment gap**. For an intentional module≠file grouping, propose a **module augmentation**. For an authoring slip, propose a `module` field fix. Skip only when unsure. Ignore construct/process findings. Finish with a short plain-text summary.";
		case RUNTIME_TOPOLOGY_VERIFIER_AGENT:
			return "Review each **process membership gap** (process nest disagreement). Propose the corrected `process` deployment unit via Access curl. Skip only when unsure. Ignore construct/package-module findings. Finish with a short plain-text summary.";
		case CONTAINER_VERIFIER_AGENT:
			return "Work from the **subsystem diagrams** (the process rollup, not source). Assess each process boundary with the two questions: does a container already exist for it (query containers and the proposal store's rejected history), and can the boundary be discerned into one (library-shaped groups get no proposal). Propose `c4-container` changes for unclaimed boundaries and `consolidation` changes when two `process` keys are one deployable unit. The rationale is your own reasoning. Finish with a short plain-text summary of boundaries assessed, proposals created, and skips.";
		case TRAIL_VERIFIER_AGENT:
			return "Review each **trail step call site finding** (`step_unconfirmed`, `step_stale`). Open the step's caller file, locate the call to the target component's symbol, and propose a `callSite` augmentation confirming the call site's exact line span, target, and mechanism via Access curl. For a stale call site, re-read the current lines and propose the fresh span. Skip only when the call site no longer exists or the step's claim is wrong in a way a callSite augmentation cannot express. Ignore construct/package-module/process findings. Finish with a short plain-text summary.";
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

	const findings = report.findings.filter((f) => {
		switch (agent) {
			case CONSTRUCT_FIXER_AGENT:
				return isConstructIssueFinding(f);
			case CONSTRUCT_VERIFIER_AGENT:
				return isConstructGapFinding(f);
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
		lines.push("## Current audit — package/module checks");
		lines.push("");
		const moduleLines = (report.boundaryChecks ?? [])
			.filter((c) => c.kind === "module_file")
			.map((c) => formatBoundaryCheck(c, mode))
			.filter(Boolean) as string[];
		if (moduleLines.length === 0) {
			lines.push("(nothing flagged in this mode)");
		} else {
			for (const row of moduleLines) lines.push(row);
		}
	} else {
		lines.push("");
		lines.push("## Current audit — process checks");
		lines.push("");
		const processLines = (report.boundaryChecks ?? [])
			.filter((c) => c.kind === "process_nest")
			.map((c) => formatBoundaryCheck(c, mode))
			.filter(Boolean) as string[];
		if (processLines.length === 0) {
			lines.push("(nothing flagged in this mode)");
		} else {
			for (const row of processLines) lines.push(row);
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

function formatLayerCoverage(l: SubsystemModelVerificationLayer): string {
	const adjudicable = l.verified + l.open;
	if (adjudicable === 0) return l.blocked > 0 ? "blocked" : "n/a";
	return `${l.verified}/${adjudicable} (${Math.round(l.coverage * 100)}%)`;
}

/**
 * Route-agnostic brief capturing a model's *verification state* for handoff to
 * an agent as context (so a person can ask questions about what is and isn't
 * verified) rather than as a fix task. Unlike `buildMaintainBrief` it does not
 * filter findings/checks to one agent/lane/mode and does not ask for proposals.
 */
export function buildVerificationBrief(opts: {
	graph: StoredSubsystemModel;
	/** Persisted audit report, when one exists. */
	report?: SubsystemModelAuditReport;
	/** Host-computed: model/graphify inputs changed since the report was saved. */
	stale?: boolean;
}): string {
	const { graph, report, stale } = opts;
	const id = graph.id;
	const enc = encodeURIComponent(id);
	const base = studioHttpBase();
	const lines: string[] = [];
	lines.push("# Subsystem model verification brief");
	lines.push("");
	lines.push(`- **Title**: ${graph.title}`);
	lines.push(`- **Model id**: ${id}`);
	if (graph.description) lines.push(`- **Description**: ${graph.description}`);
	lines.push(`- **Components**: ${graph.components.length}`);
	if (report) {
		const ledger = summarizeVerification(report);
		lines.push(`- **Verdict**: ${classifyAuditReport(report)}`);
		lines.push(`- **Audited at**: ${report.checkedAt}`);
		lines.push(
			`- **Needs update**: ${report.needsUpdate ? "yes (verification failed)" : "no"}`,
		);
		lines.push(
			`- **Ledger**: ${ledger.verified} verified · ${ledger.open} open (${ledger.blocking} blocking) · ${ledger.blocked} blocked · ${ledger.na} n/a · coverage ${Math.round(ledger.coverage * 100)}%`,
		);
		lines.push(
			`- **By layer**: construct ${formatLayerCoverage(ledger.byLayer.construct)} · boundary ${formatLayerCoverage(ledger.byLayer.boundary)}`,
		);
		if (stale) {
			lines.push(
				"- **Stale**: yes — model/graphify inputs changed since this audit; re-audit before trusting it.",
			);
		}
	} else {
		lines.push("- **Verdict**: unknown (no audit persisted yet)");
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

	if (!report) {
		lines.push("");
		lines.push("## Task");
		lines.push("");
		lines.push(
			"There is no persisted audit for this model yet. Answer from the model JSON (via the get curl) and the source under the repo roots, and say that the verification state is not yet established.",
		);
		return lines.join("\n");
	}

	lines.push("");
	lines.push("## Audit summary");
	lines.push("");
	lines.push(
		`- components: ${report.summary.components} · files verified: ${report.summary.filesVerified} · symbols verified: ${report.summary.symbolsVerified} · declarations fresh: ${report.summary.declarationsFresh}`,
	);
	lines.push(
		`- construct mismatches: ${report.summary.constructMismatches} · signature mismatches: ${report.summary.signatureMismatches} · missing files: ${report.summary.missingFiles} · missing symbols: ${report.summary.missingSymbols}`,
	);
	lines.push(
		`- graphify confirmed: ${report.summary.graphifyConfirmed} · weak anchors: ${report.summary.weakAnchors} · externals skipped: ${report.summary.externalsSkipped} · unresolved: ${report.summary.unresolved}`,
	);

	lines.push("");
	lines.push("## Findings");
	lines.push("");
	if (report.findings.length === 0) {
		lines.push("(none)");
	} else {
		for (const f of report.findings) lines.push(formatFinding(f));
	}

	lines.push("");
	lines.push("## Component checks");
	lines.push("");
	const componentChecks = [
		...report.checks.map(formatIssueCheck),
		...report.checks.map(formatGapCheck),
	].filter(Boolean) as string[];
	if (componentChecks.length === 0) {
		lines.push("(nothing flagged)");
	} else {
		for (const row of componentChecks) lines.push(row);
	}

	lines.push("");
	lines.push("## Package/module & process checks");
	lines.push("");
	const boundaryLines = (report.boundaryChecks ?? [])
		.map((c) => formatBoundaryCheck(c, "all"))
		.filter(Boolean) as string[];
	if (boundaryLines.length === 0) {
		lines.push("(nothing flagged)");
	} else {
		for (const row of boundaryLines) lines.push(row);
	}

	lines.push("");
	lines.push("## Task");
	lines.push("");
	lines.push(
		"Answer questions about this model's verification state. The audit above is the current deterministic verdict — trust it for what is and isn't verified, and read the source under the repo roots when it isn't enough. Do not propose or apply changes unless explicitly asked.",
	);
	return lines.join("\n");
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
		// The commit(s) the agent will read: the HEAD of every referenced repo
		// that resolves locally. Best-effort — a run must never fail over the
		// coordinate it records.
		const commitsAtStart = await capturePurlCommits(graph.components).catch(
			() => ({}),
		);
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
					commitsAtStart,
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
		// A skipped pass still read the tree, so record the same coordinate a
		// spawned run would — the row stays comparable across outcomes.
		const commitsAtStart = await capturePurlCommits(ctx.graph.components).catch(
			() => ({}),
		);
		try {
			await noteSubsystemModelRunFinish({
				graphId,
				graphTitle: ctx.graph.title,
				status: "skipped",
				model: ctx.model,
				verdict,
				pendingCount,
				summary,
				commitsAtStart,
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


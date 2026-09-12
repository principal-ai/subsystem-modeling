/**
 * Subsystem model Maintain — OpenCode agents that review a deterministic
 * audit and submit correction proposals via Studio HTTP (human confirms).
 *
 * Routes by audit verdict:
 * - issues → issue-fixer
 * - partially_verified → gap-filler
 * - fully_verified → no-op
 *
 * Same host pattern as concept extraction: RPC returns immediately, the
 * OpenCode V2 session continues in the background (live SSE tab), then a push
 * notifies the UI.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SubsystemModelAuditReport } from "../shared/contract";
import {
	classifyAuditReport,
	type SubsystemModelAuditVerdict,
} from "./audit-report-store";
import { auditSubsystemModel } from "./verify-subsystem-component";
import {
	getSubsystemModel,
	resolveRepoRootForComponent,
	type StoredSubsystemModel,
} from "./subsystem-model-store";
import { pendingProposalCount } from "./proposal-store";
import { resolveSubsystemMaintainerModel } from "./opencode-models";
import { loadViewerSettings } from "./viewer-settings";
import { runOpencodeV2AgentSession } from "./opencode-v2-live";

export const ISSUE_FIXER_AGENT = "issue-fixer";
export const GAP_FILLER_AGENT = "gap-filler";

export type MaintainAgentId = typeof ISSUE_FIXER_AGENT | typeof GAP_FILLER_AGENT;
export type MaintainMode = "issues" | "gaps";

const AGENT_INSTALL_DIR = join(homedir(), ".config", "opencode", "agents");

const ISSUE_FIXER_PACKAGE_PATH = join(
	import.meta.dir,
	"..",
	"..",
	"agents",
	`${ISSUE_FIXER_AGENT}.md`,
);
const GAP_FILLER_PACKAGE_PATH = join(
	import.meta.dir,
	"..",
	"..",
	"agents",
	`${GAP_FILLER_AGENT}.md`,
);

export const ISSUE_FIXER_AGENT_PATH = join(
	AGENT_INSTALL_DIR,
	`${ISSUE_FIXER_AGENT}.md`,
);
export const GAP_FILLER_AGENT_PATH = join(
	AGENT_INSTALL_DIR,
	`${GAP_FILLER_AGENT}.md`,
);

/** Keep in sync with `agents/issue-fixer.md`. */
const EMBEDDED_ISSUE_FIXER = "---\ndescription: Fixes hard subsystem-model audit failures (verification failed). Proposes corrections via Studio HTTP; human confirms. Does not address gaps.\nmode: all\ntemperature: 0\npermission:\n  edit: deny\n  webfetch: deny\n  websearch: deny\n  skill: deny\n  question: deny\n  bash:\n    \"curl *3045*\": allow\n    \"* subsystem-model *\": allow\n    \"node *subsystem-model*\": allow\n    \"bun *subsystem-model*\": allow\n---\n\nYou are the **issue fixer** for Subsystem Models. Your job is to review a\ndeterministic audit that **failed verification**, investigate the code when\nneeded, and **propose** typed corrections with a clear rationale. You do **not**\naccept proposals and you do **not** rewrite the model JSON on disk.\n\nYou only fix **issues** (error / warn findings): missing file or symbol,\nconstruct or signature mismatch, and similar hard failures.\n**Do not** propose changes for gaps (construct unclassified, signature not in\ncache). A separate gap-filler agent handles those after verification passes.\n\nSkip findings that already offer a deterministic Apply fix in the audit UI\n(unique Graphify file relocate, empty-claim signature fill, declaration\nre-pin) unless Apply is unavailable — prefer human one-click when it exists.\n\n## Important: which tools to use\n\nThe brief’s **Access** section is authoritative. Prefer **Studio HTTP (`curl`)**\ncommands listed there. Do **not** call bare `principal-ai …` unless the brief\ngives an absolute studio-cli path — many machines have an older unrelated\n`principal-ai` on PATH (canvas / principal-view-cli) that does **not** support\n`subsystem-model`.\n\n## Input\n\nThe brief (task message) contains:\n\n- Model id, title\n- **Access** — curl (and optional absolute CLI) for get / audit / proposals / propose\n- **Current audit** — issue findings and failing checks only\n- Repo roots when known\n\nTrust the audit for *what is wrong*. You decide *how to fix it*.\n\n## Procedure\n\n1. **Orient.** Use the brief’s get/audit curl commands if you need to refresh.\n2. **Triage.** High-severity failures first (missing file/symbol, then\n   construct/signature mismatches).\n3. **Investigate.** Read claimed files under the repo roots. Prefer source over\n   Graphify hints when they disagree.\n4. **Propose.** POST one focused proposal at a time (or a small coherent group\n   for the same component). Always include `rationale` and link `finding` when\n   applicable. Use the exact propose curl from the brief. Set\n   `\"author\": \"issue-fixer\"`.\n\n### Ambiguous file relocate (`missing_file` with multiple Graphify paths)\n\nWhen the finding says Graphify has the symbol at **multiple paths**, there is\nno deterministic fix. Open the candidates under the repo roots, pick the\ndefinition that matches this component’s role, and propose `field: \"file\"`.\n\n```json\n{\n  \"rationale\": \"Foo lives in src/a/Foo.ts (export class); the other hit is a test double.\",\n  \"author\": \"issue-fixer\",\n  \"finding\": {\n    \"kind\": \"missing_file\",\n    \"componentId\": \"…\",\n    \"message\": \"…\"\n  },\n  \"changes\": [\n    {\n      \"target\": \"component\",\n      \"componentId\": \"…\",\n      \"field\": \"file\",\n      \"value\": \"src/a/Foo.ts\"\n    }\n  ]\n}\n```\n\nIf none of the candidates fit, skip — do not invent a path.\n\n### Other missing file / symbol\n\nIf Graphify listed no candidates, search the repo for the symbol and propose\nthe correct `file` (and `symbol` if renamed). Prefer evidence over guessing.\n\n### Construct ≠ inferred (`construct_mismatch`)\n\nGraphify’s inferred construct is a **structural hint**, not ground truth. Do\n**not** auto-flip `component.construct` to the inferred value.\n\n1. Open the claimed file and read the declaration for the claimed symbol.\n2. Decide from **source semantics** (and the model’s intended role):\n   - **Claim wrong** — source is clearly a different construct family than the\n     model (e.g. model says `function`, source is `export class Foo`) → propose\n     `field: \"construct\"` with the corrected value.\n   - **Claim right / intentional** — source matches the claim, or the claim is a\n     deliberate higher-level construct (`store`, `module`, `custom_entity`, …)\n     that Graphify cannot express → **skip**. Say so in the summary. Do not\n     “fix” by adopting inferred.\n   - **Wrong symbol / file** — mismatch is really an identity error → propose\n     `file` / `symbol` (or both), not a blind construct flip.\n3. If unsure after reading source, skip — do not guess taxonomy.\n\n```json\n{\n  \"rationale\": \"Source is `export class SessionStore` in src/session.ts; model claimed function.\",\n  \"author\": \"issue-fixer\",\n  \"finding\": {\n    \"kind\": \"construct_mismatch\",\n    \"componentId\": \"…\",\n    \"message\": \"…\"\n  },\n  \"changes\": [\n    {\n      \"target\": \"component\",\n      \"componentId\": \"…\",\n      \"field\": \"construct\",\n      \"value\": \"class\"\n    }\n  ]\n}\n```\n\n### Signature mismatch (`signature_mismatch`)\n\nSame rule: Graphify type bags are a hint. Do **not** auto-adopt inferred bags\nwhen the model already has named types (that Apply path is only for empty\nclaims).\n\n1. Read the source signature.\n2. If the **model bags are wrong** and Graphify (or source) clearly shows the\n   right named types — note it in the summary and skip unless you can fix via\n   `symbol` / `file` / `construct` identity. (Detail bag edits are not in the\n   propose schema today.)\n3. If the **model matches source** and Graphify disagrees — skip; Graphify is\n   incomplete or wrong.\n4. If Apply “adopt graphify signature” is offered (empty claims), leave it for\n   the human one-click.\n\n### Example body (generic)\n\n```json\n{\n  \"rationale\": \"One or two sentences: what you checked and why this change.\",\n  \"author\": \"issue-fixer\",\n  \"finding\": {\n    \"kind\": \"missing_file\",\n    \"componentId\": \"…\",\n    \"message\": \"…\"\n  },\n  \"changes\": [\n    {\n      \"target\": \"component\",\n      \"componentId\": \"…\",\n      \"field\": \"file\",\n      \"value\": \"src/new-path.ts\"\n    }\n  ]\n}\n```\n\nAllowed change fields:\n\n- component: `file` | `symbol` | `construct` | `name` | `purl` | `declarationRef`\n- walkthrough-step: `file` | `line` | `symbol` | `from` | `to` | `mechanism` | `annotation`\n\n5. **Verify.** List proposals with the brief’s proposals curl. Do **not**\n   accept or reject.\n\n## Rules\n\n- Prefer many small proposals over one giant patch.\n- If you cannot determine a safe fix, skip — do not guess paths or constructs.\n- Never edit `~/.principal/subsystem-models/*.json` directly.\n- Never enable or rely on auto-accept; humans confirm in Studio.\n- Ignore gap / info findings even if they appear in a refreshed audit.\n- Never treat Graphify inferred construct/signature as automatically correct.\n\n## Output\n\nWhen finished, respond with a short plain-text summary only:\n\n- how many proposals you created\n- which findings you skipped and why (especially construct/signature skips)\n\nNo JSON dump of the model.\n";

/** Keep in sync with `agents/gap-filler.md`. */
const EMBEDDED_GAP_FILLER = "---\ndescription: Fills subsystem-model audit gaps (partially verified). Proposes classifications via Studio HTTP; human confirms. Does not fix hard failures.\nmode: all\ntemperature: 0\npermission:\n  edit: deny\n  webfetch: deny\n  websearch: deny\n  skill: deny\n  question: deny\n  bash:\n    \"curl *3045*\": allow\n    \"* subsystem-model *\": allow\n    \"node *subsystem-model*\": allow\n    \"bun *subsystem-model*\": allow\n---\n\nYou are the **gap filler** for Subsystem Models. Your job is to review a\ndeterministic audit that is **partially verified** (nothing failed, but some\nclaims are unconfirmed), investigate the code when needed, and **propose** typed\ncorrections with a clear rationale. You do **not** accept proposals and you do\n**not** rewrite the model JSON on disk.\n\nYou only address **gaps**: construct unclassified, signature not in cache,\nunresolved repo/cache, and similar confirmation holes. **Do not** invent or\nchase hard failures — if the model has verification issues, stop and say so;\nissue-fixer handles those.\n\n## Important: which tools to use\n\nThe brief’s **Access** section is authoritative. Prefer **Studio HTTP (`curl`)**\ncommands listed there. Do **not** call bare `principal-ai …` unless the brief\ngives an absolute studio-cli path — many machines have an older unrelated\n`principal-ai` on PATH (canvas / principal-view-cli) that does **not** support\n`subsystem-model`.\n\n## Input\n\nThe brief (task message) contains:\n\n- Model id, title\n- **Access** — curl (and optional absolute CLI) for get / audit / proposals / propose\n- **Current audit** — gap findings and gap-shaped checks only\n- Repo roots when known\n\nTrust the audit for *what is incomplete*. You decide *how to fill it* safely.\n\n## Procedure\n\n1. **Orient.** Use the brief’s get/audit curl commands if you need to refresh.\n2. **Triage.** Prefer gaps you can resolve from source. For signature gaps, read\n   the declaration and propose an augmentation when named types are clear.\n3. **Investigate.** Read claimed files under the repo roots. Prefer evidence\n   over guessing.\n4. **Propose.** POST one focused proposal at a time (or a small coherent group\n   for the same component). Always include `rationale` and link `finding` when\n   applicable. Use the exact propose curl from the brief. Set\n   `\"author\": \"gap-filler\"`.\n\n### Construct unclassified (`construct_unconfirmed`)\n\nGraphify often cannot tell interface vs type_alias vs enum (label-only →\n`unknown`). Choose:\n\n- **Claim is correct** (source shows `interface HostInfo`, model already says\n  `interface`) → propose an **augmentation** confirmation. Do **not** re-propose\n  the same `component.construct` value — that does not clear the gap.\n- **Claim is wrong** → propose `target: \"component\", field: \"construct\"` with\n  the corrected value.\n\nAugmentation example (preferred when the model claim is already right):\n\n```json\n{\n  \"rationale\": \"HostInfo is declared as interface in <file>; graphify left it unclassified.\",\n  \"author\": \"gap-filler\",\n  \"finding\": {\n    \"kind\": \"construct_unconfirmed\",\n    \"componentId\": \"…\",\n    \"message\": \"…\"\n  },\n  \"changes\": [\n    {\n      \"target\": \"augmentation\",\n      \"componentId\": \"…\",\n      \"field\": \"construct\",\n      \"value\": \"interface\"\n    }\n  ]\n}\n```\n\nModel-construct correction example (only when the claim itself is wrong):\n\n```json\n{\n  \"rationale\": \"Source declares a class, not a function.\",\n  \"author\": \"gap-filler\",\n  \"finding\": {\n    \"kind\": \"construct_unconfirmed\",\n    \"componentId\": \"…\",\n    \"message\": \"…\"\n  },\n  \"changes\": [\n    {\n      \"target\": \"component\",\n      \"componentId\": \"…\",\n      \"field\": \"construct\",\n      \"value\": \"class\"\n    }\n  ]\n}\n```\n\n### Signature not in cache (`signature_unconfirmed`)\n\nGraphify has no usable `parameter_type` / `return_type` edges for this\nfunction/method. Read the source declaration and propose a **signature\naugmentation** with the named type bags (not primitives-only). That confirms\nthe claim for the next audit.\n\n- Include only **named** types (classes, interfaces, type aliases, enums).\n  Skip bare `string` / `number` / `boolean` / inline `{…}` unless they are the\n  only story — then skip the gap rather than invent noise.\n- If the model already claims the same named bags, still propose the\n  augmentation (mirrors construct confirmation).\n- If you cannot name real types from source, skip — do not guess.\n\n```json\n{\n  \"rationale\": \"Source declares (req: HostInfo) => Promise<Session>; Graphify had no signature edges.\",\n  \"author\": \"gap-filler\",\n  \"finding\": {\n    \"kind\": \"signature_unconfirmed\",\n    \"componentId\": \"…\",\n    \"message\": \"…\"\n  },\n  \"changes\": [\n    {\n      \"target\": \"augmentation\",\n      \"componentId\": \"…\",\n      \"field\": \"signature\",\n      \"value\": {\n        \"parameterTypes\": [\"HostInfo\"],\n        \"returnTypes\": [\"Session\"]\n      }\n    }\n  ]\n}\n```\n\nAllowed change targets:\n\n- `augmentation`: `construct` | `signature` (accept writes the augmentation\n  store, not the model JSON). `file` / `symbol` / `purl` optional — default\n  from the component.\n- component: `file` | `symbol` | `construct` | `name` | `purl` | `declarationRef`\n- walkthrough-step: `file` | `line` | `symbol` | `from` | `to` | `mechanism` | `annotation`\n\n5. **Verify.** List proposals with the brief’s proposals curl. Do **not**\n   accept or reject.\n\n## Rules\n\n- Prefer many small proposals over one giant patch.\n- If you cannot determine a safe fill, skip — do not guess constructs or paths.\n- Never edit `~/.principal/subsystem-models/*.json` directly.\n- Never enable or rely on auto-accept; humans confirm in Studio.\n- Do not propose “fixes” for error/warn findings; those belong to issue-fixer.\n\n## Output\n\nWhen finished, respond with a short plain-text summary only:\n\n- how many proposals you created\n- which gaps you skipped and why\n\nNo JSON dump of the model.\n";

const BRIEF_DIR = join(homedir(), ".principal", "subsystem-model-briefs");

export interface MaintainModelResult {
	ok: boolean;
	error?: string;
	model?: string;
	/** Which OpenCode agent ran (or would have run). */
	agent?: MaintainAgentId;
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

export function maintainModeForVerdict(
	verdict: SubsystemModelAuditVerdict,
): MaintainMode | null {
	if (verdict === "issues") return "issues";
	if (verdict === "partially_verified") return "gaps";
	return null;
}

export function agentForMaintainMode(mode: MaintainMode): MaintainAgentId {
	return mode === "issues" ? ISSUE_FIXER_AGENT : GAP_FILLER_AGENT;
}

export function maintainActionLabel(_mode: MaintainMode | null): string {
	return "Run maintenance";
}

function loadAgentSource(
	packagePath: string,
	embedded: string,
): string {
	try {
		if (existsSync(packagePath)) {
			return readFileSync(packagePath, "utf8");
		}
	} catch {
		/* fall through */
	}
	return embedded;
}

/** Ensure both Maintain agents are installed under ~/.config/opencode/agents/. */
export function ensureMaintainAgentsInstalled(): {
	ok: boolean;
	paths: string[];
	error?: string;
} {
	try {
		mkdirSync(AGENT_INSTALL_DIR, { recursive: true });
		writeFileSync(
			ISSUE_FIXER_AGENT_PATH,
			loadAgentSource(ISSUE_FIXER_PACKAGE_PATH, EMBEDDED_ISSUE_FIXER),
			"utf8",
		);
		writeFileSync(
			GAP_FILLER_AGENT_PATH,
			loadAgentSource(GAP_FILLER_PACKAGE_PATH, EMBEDDED_GAP_FILLER),
			"utf8",
		);
		return {
			ok: true,
			paths: [ISSUE_FIXER_AGENT_PATH, GAP_FILLER_AGENT_PATH],
		};
	} catch (err) {
		return {
			ok: false,
			paths: [ISSUE_FIXER_AGENT_PATH, GAP_FILLER_AGENT_PATH],
			error: (err as Error).message,
		};
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
		path: ISSUE_FIXER_AGENT_PATH,
		error: r.error,
	};
}

function primaryRepoRoot(graph: StoredSubsystemModel): string | undefined {
	if (graph.repoRoot) return graph.repoRoot;
	if (graph.repoRoots) {
		for (const root of Object.values(graph.repoRoots)) {
			if (typeof root === "string" && root.length > 0) return root;
		}
	}
	for (const c of graph.components) {
		const root = resolveRepoRootForComponent(graph, c.purl);
		if (root) return root;
	}
	return undefined;
}

function isIssueFinding(
	f: SubsystemModelAuditReport["findings"][number],
): boolean {
	return f.severity === "error" || f.severity === "warn";
}

function isGapFinding(
	f: SubsystemModelAuditReport["findings"][number],
): boolean {
	if (f.severity === "error" || f.severity === "warn") return false;
	return (
		f.kind === "construct_unconfirmed" ||
		f.kind === "signature_unconfirmed" ||
		f.kind === "unresolved" ||
		f.severity === "info"
	);
}

function formatFinding(f: SubsystemModelAuditReport["findings"][number]): string {
	const where = [
		f.componentId ? `component=${f.componentId}` : null,
		f.componentName ? `name=${f.componentName}` : null,
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
	return `- ${c.componentName ?? c.componentId} (${c.componentId}): ${bits.join("; ")}`;
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
	return `- ${c.componentName ?? c.componentId} (${c.componentId}): ${bits.join("; ")}`;
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

export function buildMaintainBrief(opts: {
	graph: StoredSubsystemModel;
	report: SubsystemModelAuditReport;
	mode: MaintainMode;
}): string {
	const { graph, report, mode } = opts;
	const agent = agentForMaintainMode(mode);
	const id = graph.id;
	const enc = encodeURIComponent(id);
	const base = studioHttpBase();
	const lines: string[] = [];
	lines.push(
		mode === "issues"
			? "# Subsystem model issue-fixer brief"
			: "# Subsystem model gap-filler brief",
	);
	lines.push("");
	lines.push(`- **Title**: ${graph.title}`);
	lines.push(`- **Model id**: ${id}`);
	lines.push(`- **Agent**: ${agent}`);
	lines.push(`- **Mode**: ${mode}`);
	lines.push(`- **Audited at**: ${report.checkedAt}`);
	lines.push(
		`- **Needs update**: ${report.needsUpdate ? "yes (verification failed)" : "no"}`,
	);
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
	lines.push(
		`Propose body shape: \`{ "rationale": "…", "author": "${agent}", "finding": {…}, "changes": […] }\`. For construct_unconfirmed when the claim is already correct, use \`{ "target": "augmentation", "componentId", "field": "construct", "value" }\`. For signature_unconfirmed, use \`{ "target": "augmentation", "componentId", "field": "signature", "value": { "parameterTypes": […], "returnTypes": […] } }\`. Do **not** call accept/reject.`,
	);

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
	if (graph.repoRoot) roots.add(graph.repoRoot);
	for (const r of Object.values(graph.repoRoots ?? {})) {
		if (r) roots.add(r);
	}
	for (const c of graph.components) {
		const r = resolveRepoRootForComponent(graph, c.purl);
		if (r) roots.add(r);
	}
	if (roots.size > 0) {
		lines.push("");
		lines.push("**Repo roots** (read source here):");
		for (const r of roots) lines.push(`- ${r}`);
	}

	const findings =
		mode === "issues"
			? report.findings.filter(isIssueFinding)
			: report.findings.filter(isGapFinding);

	lines.push("");
	lines.push(
		mode === "issues"
			? "## Current audit — issue findings"
			: "## Current audit — gap findings",
	);
	lines.push("");
	if (findings.length === 0) {
		lines.push("(no findings in this mode)");
	} else {
		for (const f of findings) lines.push(formatFinding(f));
	}

	lines.push("");
	lines.push(
		mode === "issues"
			? "## Current audit — failing checks"
			: "## Current audit — gap checks",
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

	lines.push("");
	lines.push("## Task");
	lines.push("");
	if (mode === "issues") {
		lines.push(
			"Review each **issue** finding, investigate the code, and submit proposals via the Access curl commands (Studio HTTP). For construct ≠ inferred / signature mismatch: Graphify is a weak hint — read source; do not auto-adopt inferred; skip when the model claim is intentional. Ignore gaps. Prefer small proposals. Finish with a short plain-text summary of proposals created and skips.",
		);
	} else {
		lines.push(
			"Review each **gap**, investigate the code, propose safe fills (e.g. construct classification) via the Access curl commands (Studio HTTP). Do not chase hard failures. Prefer small proposals. Skip anything you cannot safely fill. Finish with a short plain-text summary of proposals created and skips.",
		);
	}
	return lines.join("\n");
}

export function writeMaintainBrief(opts: {
	graph: StoredSubsystemModel;
	report: SubsystemModelAuditReport;
	mode: MaintainMode;
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
}): Promise<{
	ok: boolean;
	error?: string;
	summary?: string;
	model: string;
	agent: MaintainAgentId;
	sessionId?: string;
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
	});
	return {
		ok: run.ok,
		error: run.error,
		summary: run.summary,
		model: run.model,
		agent: opts.agent,
		sessionId: run.sessionId,
	};
}

/** @deprecated Use runMaintainAgent. */
export async function runClaimAdjudicator(opts: {
	primaryRepoRoot?: string;
	task: string;
	model: string;
}): Promise<{ ok: boolean; error?: string; summary?: string; model: string }> {
	const run = await runMaintainAgent({
		agent: ISSUE_FIXER_AGENT,
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

	const audit = await auditSubsystemModel(graphId);
	if (!audit.ok) return { ok: false, error: audit.error };

	const verdict = classifyAuditReport(audit.report);
	const mode = maintainModeForVerdict(verdict);
	const pendingCount = await pendingProposalCount(graphId);

	if (!mode) {
		return {
			ok: true,
			skipped: true,
			verdict,
			model: resolved.model,
			pendingCount,
			summary: "Fully verified — nothing for Maintain to propose",
		};
	}

	const agent = agentForMaintainMode(mode);
	writeMaintainBrief({ graph, report: audit.report, mode });
	const task = buildMaintainBrief({ graph, report: audit.report, mode });
	const run = await runMaintainAgent({
		agent,
		primaryRepoRoot: primaryRepoRoot(graph),
		task,
		model: resolved.model,
		graphId,
		title: `Maintain — ${graph.title}`,
		onSession: opts?.onSession,
	});
	const pendingAfter = await pendingProposalCount(graphId);
	if (!run.ok) {
		return {
			ok: false,
			error: run.error,
			model: run.model,
			agent,
			verdict,
			pendingCount: pendingAfter,
			summary: run.summary,
			sessionId: run.sessionId,
		};
	}
	return {
		ok: true,
		model: run.model,
		agent,
		verdict,
		pendingCount: pendingAfter,
		summary: run.summary,
		sessionId: run.sessionId,
	};
}

export function readMaintainAgentSystemPrompt(agent: MaintainAgentId): string {
	try {
		ensureMaintainAgentsInstalled();
		const path =
			agent === ISSUE_FIXER_AGENT
				? ISSUE_FIXER_AGENT_PATH
				: GAP_FILLER_AGENT_PATH;
		return readFileSync(path, "utf8");
	} catch (err) {
		return `(system prompt unavailable — ${(err as Error).message})`;
	}
}

/** @deprecated Use readMaintainAgentSystemPrompt. */
export function readClaimAdjudicatorSystemPrompt(): string {
	return readMaintainAgentSystemPrompt(ISSUE_FIXER_AGENT);
}

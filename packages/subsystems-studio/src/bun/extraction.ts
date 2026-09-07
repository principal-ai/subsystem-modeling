/**
 * Session understanding — turns a session's beat analysis into a brief the
 * extractor agent can act on, then runs the agent and parses arc-summary
 * cards out.
 *
 * This is the Phase-2 replacement for `stubConceptCard`: the host saves a
 * `pending` analysis, runs this in the background (the opencode run outlives
 * the 5s RPC window), then persists the parsed cards or the error.
 *
 * The host does the *mechanical* front half (beat segmentation, kind/function
 * classification, file collection — see `beat-analysis.ts`) and hands the
 * agent a brief: the beats, the CLI accessor for the full accumulated feed,
 * and the procedure for the *judgment* half (grouping beats into arcs and
 * detours, naming each arc's concept, writing the concept/evidence summary,
 * and producing the mermaid). The agent reads the accumulated feed itself via
 * the CLI so it can enrich summaries with real event content; it is not
 * sandboxed from the session's repos.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
	ConceptCardData,
	ConceptChangeType,
	ExtractionPromptInfo,
	RepoInfo,
	SubsystemEntryPoint,
	SubsystemEntryPointKind,
	SubsystemFileRef,
	SubsystemIntegration,
	SubsystemIntegrationMechanism,
	SubsystemSnapshot,
	SubsystemTestSuite,
} from "../shared/contract";
import type { BeatAnalysis } from "./beat-analysis";
import { buildBeatBrief } from "./beat-analysis";

/** Fixed extractor model — the opencode-go provider's fast flash model. */
export const EXTRACTOR_MODEL = "opencode-go/deepseek-v4-flash";

/** The opencode agent the run invokes (defined globally under
 *  `~/.config/opencode/agents/` so it applies regardless of `--dir`). */
export const CONCEPT_EXTRACTOR_AGENT = "concept-extractor";

const OPENCODE_BIN =
	process.env["OPENCODE_BIN"] ?? "/Users/griever/.opencode/bin/opencode";

/** Where the system prompt lives on disk — the source of truth surfaced by the
 *  prompt tab. Overridable via `TRAIL_EXTRACTOR_AGENT_PATH`. */
export const EXTRACTOR_AGENT_PATH =
	process.env["TRAIL_EXTRACTOR_AGENT_PATH"] ??
	join(homedir(), ".config", "opencode", "agents", `${CONCEPT_EXTRACTOR_AGENT}.md`);

// ---------------------------------------------------------------------------
// Brief building
// ---------------------------------------------------------------------------

export interface BriefSource {
	sessionId: string;
	sessionTitle: string;
	sessionSlug?: string;
	agent?: string;
	repos: RepoInfo[];
	beats: BeatAnalysis;
}

/** The CLI accessor the agent runs to fetch the full accumulated feed. The
 *  command is published with the `--view` flag the extractor relies on. */
export function buildAccessorCommand(sessionId: string): string {
	return `principal-ai agent-session fetch ${sessionId} --view accumulated`;
}

/**
 * Render the brief the extractor agent acts on: session identity, the accessor
 * command + repo roots, the host-computed beats, and the procedure + output
 * contract for the judgment half. Deliberately *not* a transcript dump — the
 * agent runs the accessor itself when it needs the full event content.
 */
export function buildBrief(src: BriefSource): string {
	const lines: string[] = [];
	lines.push("# Session understanding brief");
	lines.push("");
	lines.push(`- **Session**: ${src.sessionTitle}`);
	lines.push(`- **Agent**: ${src.agent ?? "opencode"}`);
	if (src.sessionSlug) lines.push(`- **Slug**: ${src.sessionSlug}`);
	lines.push(`- **Session id**: ${src.sessionId}`);
	lines.push("");
	lines.push("## Access");
	lines.push("");
	lines.push(
		`Fetch the session's full accumulated event feed yourself by running the CLI accessor:`,
	);
	lines.push("");
	lines.push(`    ${buildAccessorCommand(src.sessionId)}`);
	lines.push("");
	lines.push(
		"The output carries `operation`, `description`, and `files` per event — use it to enrich the beat summaries below when you need the underlying event content.",
	);
	if (src.repos.length > 0) {
		lines.push("");
		lines.push("**Repos the session worked in** (roots — cite files from here as purl refs):");
		for (const r of src.repos) {
			const identity =
				r.owner && r.name ? `${r.owner}/${r.name}` : r.name ?? r.root;
			lines.push(`- ${r.root}${identity === r.root ? "" : ` (${identity})`}`);
		}
	}
	lines.push("");
	lines.push(buildBeatBrief(src.beats));
	lines.push("");
	lines.push("## Task");
	lines.push("");
	lines.push(
		"Group the beats into arcs and detours and produce one card per arc/detour. An **arc** is a main thread of the session (a concept that recurs and accumulates, e.g. \"build the session service\"). A **detour** is a self-contained sequence of content beats that deviates from the main threads, resolves, and hands control back (opens with a problem report like \"none of the tabs are showing\", closes with a transition like \"yep that fixed it\").",
	);
	lines.push("");
	lines.push(
		"Rules: a bug-fix sequence is a detour only when its subject matches **no arc**'s concept — if it matches an arc (e.g. a caching bug in a session with a caching arc), it is evidence for that arc, not a detour. Work beats are concept-poor (agreement gestures like \"yes please\", \"lets do it\"); name each arc's concept from its plan/Q&A beats and its files, not from the work-beat text.",
	);
	lines.push("");
	lines.push(
		"Each card's `description` states the concept (the *what*); `points` list the evidence (the *that* — which beats and what happened). Keep `keyBeats` to the beat indices the arc spans and set `arcKind` to `\"arc\"` or `\"detour\"`.",
	);
	lines.push("");
	lines.push("## Output contract");
	lines.push("");
	lines.push(
		"Respond with **only** a single JSON object — no prose before or after, no markdown fences:",
	);
	lines.push("");
	lines.push('```json\n{ "concepts": [ ... ], "subsystems": [ ... ] }\n```');
	lines.push("");
	lines.push(
		"Each element is an arc-summary card. All fields below are required unless marked optional:",
	);
	lines.push("");
	lines.push('```json\n{');
	lines.push('  "id": "kebab-case-short-id",');
	lines.push('  "title": "Short, specific title naming the arc concept",');
	lines.push('  "changeType": "execution | derive | integration | ui",');
	lines.push('  "arcKind": "arc | detour",');
	lines.push('  "keyBeats": [1, 3, 5],');
	lines.push('  "sessionIds": ["<the session id from the brief header>"],');
	lines.push('  "repos": [{ "owner": "<owner>", "name": "<name>" }],');
	lines.push('  "description": "One or two sentences stating the concept (the what).",');
	lines.push('  "points": ["Short bullet stating evidence (the that)", "..."],');
	lines.push('  "mermaid": "flowchart LR\\n  ...",');
	lines.push('  "markdown": "# Markdown prose for the slide view",');
	lines.push('  "files": ["pkg:github/owner/name#packages/subsystems-core/src/index.ts"]');
	lines.push('}\n```');
	lines.push("");
	lines.push("## Subsystem snapshots");
	lines.push("");
	lines.push(
		"The session may cover **several subsystems** — emit one snapshot per subsystem the session worked on or analyzed. A subsystem is a snapshot of a concept being worked on: the durable, verifiable record of what that concept means in the code at this point. Cluster on **edited** files (repo-root-relative paths only), never read/touch noise. Shared seams (registries, barrels, package facades) are **integration-edge targets, not members** — a reader \"registers into\" the registry rather than listing it as a file.",
	);
	lines.push("");
	lines.push('```json\n{');
	lines.push('  "id": "kebab-case-short-id",');
	lines.push('  "name": "Stable name of the concept being worked on",');
	lines.push('  "description": "One or two sentences: what this subsystem is.",');
	lines.push('  "repo": { "owner": "<owner>", "name": "<name>" },');
	lines.push('  "files": [{ "purl": "pkg:github/owner/name#src/foo.ts", "role": "core | supporting", "purpose": "one-line purpose" }],');
	lines.push('  "entryPoints": [{ "symbol": "FooBar", "kind": "class | function | interface | type | const | method", "file": "pkg:...#src/foo.ts", "line": 36, "signature": "export class FooBar {" }],');
	lines.push('  "integrations": [{ "to": "<other subsystem or pkg:...#symbol>", "mechanism": "imports | calls | extends | registers-into", "refs": ["pkg:...#src/foo.ts"] }],');
	lines.push('  "fixtures": ["pkg:github/owner/name#test-data/fixture.jsonl"],');
	lines.push('  "testSuites": [{ "file": "pkg:...#V2RealSession.test.ts", "exercises": ["FooBar.normalize"], "verifies": "maps the prompt lifecycle" }],');
	lines.push('  "graphMermaid": "flowchart LR\\n    ...",');
	lines.push('  "sessionIds": ["<the session id from the brief header>"]');
	lines.push('}\n```');
	lines.push("");
	lines.push(
		"Rules: emit an empty `subsystems: []` when the session was purely exploratory with no file cluster. `entryPoints[].symbol` and `signature` must be **verbatim from the code** (read the file; `line` is 1-based). `graphMermaid` is the component graph — nodes are kind-tagged components, packages render as subgraphs, only cross-package edges leave the box, and shared seams (registries/barrels/facades) are edge targets, never member nodes. `testSuites`/`fixtures` capture how it is tested, separate from how it exists.",
	);
	lines.push("");
	lines.push(
		"`entries` may span multiple repos (e.g. building in one repo, integrating into consumers in another) — one snapshot can carry files/integrations from several repos, or you may emit separate snapshots per cluster.",
	);
	return lines.join("\n");
}

/** Write the brief to `~/.principal/transcripts/<id>.md` and return its path
 *  (kept for compatibility/debugging; the run no longer attaches it). */
export function writeBrief(src: BriefSource): string {
	mkdirSync(TRANSCRIPT_DIR, { recursive: true });
	const safeId = src.sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
	const path = join(TRANSCRIPT_DIR, `${safeId}.brief.md`);
	writeFileSync(path, buildBrief(src), "utf8");
	return path;
}

const TRANSCRIPT_DIR = join(homedir(), ".principal", "transcripts");

// ---------------------------------------------------------------------------
// Prompt surfaces
// ---------------------------------------------------------------------------

/** The task message template — the brief is the task (access + procedure). */
export function extractTaskTemplate(sessionTitle: string): string {
	return `Read the session brief below, run the accessor to fetch the accumulated feed, group the beats into arcs/detours, and emit arc-summary cards for "${sessionTitle}". Respond with ONLY a JSON object: {"concepts": [...]}.`;
}

/** Read the extractor agent's system prompt from its config file. Falls back to
 *  a placeholder line so the prompt tab degrades gracefully if the file moves. */
export function readExtractorSystemPrompt(): string {
	try {
		return readFileSync(EXTRACTOR_AGENT_PATH, "utf8");
	} catch (err) {
		return `(system prompt unavailable — ${(err as Error).message})`;
	}
}

/** What the prompt tab renders: the fixed agent identity + the verbatim prompt
 *  and the task template (with its interpolation point marked). */
export function getExtractionPromptInfo(): ExtractionPromptInfo {
	return {
		agent: CONCEPT_EXTRACTOR_AGENT,
		model: EXTRACTOR_MODEL,
		systemPrompt: readExtractorSystemPrompt(),
		taskTemplate: extractTaskTemplate("<session title>"),
		agentPath: EXTRACTOR_AGENT_PATH,
	};
}

// ---------------------------------------------------------------------------
// opencode run + parsing
// ---------------------------------------------------------------------------

export interface ExtractionResult {
	ok: boolean;
	error?: string;
	concepts?: ConceptCardData[];
	/** Subsystem snapshots teased out of the session — one per subsystem. */
	subsystems?: SubsystemSnapshot[];
	/** Model the run reported via `-m` (deterministic, but kept on the record). */
	model?: string;
}

/**
 * Spawn `opencode run` with the concept-extractor agent and the brief as the
 * task message, then parse the JSONL event stream for the agent's JSON
 * response. The brief is the task (not a `-f` attachment) so the agent runs
 * the CLI accessor itself to fetch the accumulated feed.
 */
export async function runOpenCodeExtraction(opts: {
	primaryRepoRoot?: string;
	task: string;
}): Promise<ExtractionResult> {
	const args = [
		"run",
		"--agent",
		CONCEPT_EXTRACTOR_AGENT,
		"--format",
		"json",
		"-m",
		EXTRACTOR_MODEL,
	];
	if (opts.primaryRepoRoot) args.push("--dir", opts.primaryRepoRoot);
	args.push(opts.task);

	const proc = Bun.spawn({
		cmd: [OPENCODE_BIN, ...args],
		stdio: ["ignore", "pipe", "pipe"],
	});

	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	const exitCode = await proc.exited;

	if (exitCode !== 0) {
		const detail = stderr.trim().split("\n").pop() ?? "";
		return {
			ok: false,
			error: detail || `opencode run exited ${exitCode}`,
			model: EXTRACTOR_MODEL,
		};
	}

	const { text, error } = parseRunOutput(stdout);
	if (error) return { ok: false, error, model: EXTRACTOR_MODEL };

	const concepts = parseConceptsJson(text);
	const subsystems = parseSubsystemsJson(text);
	if (concepts.length === 0 && subsystems.length === 0) {
		return {
			ok: false,
			error: "Extractor returned no parseable concept cards or subsystems",
			model: EXTRACTOR_MODEL,
		};
	}
	return { ok: true, concepts, subsystems, model: EXTRACTOR_MODEL };
}

/** Walk the NDJSON `opencode run --format json` stream. The agent's answer is
 *  the concatenation of `text` parts; errors surface as `error` events. */
function parseRunOutput(
	stdout: string,
): { text: string; error?: string } {
	let text = "";
	let error: string | undefined;
	for (const line of stdout.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		let ev: { type?: string; part?: { text?: unknown }; message?: unknown };
		try {
			ev = JSON.parse(trimmed);
		} catch {
			continue;
		}
		if (!ev || typeof ev !== "object") continue;
		if (ev.type === "text" && typeof ev.part?.text === "string") {
			text += ev.part.text;
		} else if (ev.type === "error") {
			error = typeof ev.message === "string" ? ev.message : "opencode run failed";
		}
	}
	return { text, error };
}

/** Extract a `{ "concepts": [...] }` (or bare `[...]`) JSON value from the
 *  agent's reply, tolerating a bit of prose and markdown fences. */
function parseConceptsJson(raw: string): ConceptCardData[] {
	const parsed = extractTopLevelJson(raw);
	if (parsed === null) return [];

	const arr = Array.isArray(parsed)
		? parsed
		: (parsed as { concepts?: unknown }).concepts;
	if (!Array.isArray(arr)) return [];

	const out: ConceptCardData[] = [];
	for (const item of arr) {
		const card = validateCard(item, out.length);
		if (card) out.push(card);
	}
	return out;
}

/** Extract the `{ "subsystems": [...] }` array from the agent's reply, tolerant
 *  of prose + fences, validating each snapshot loosely (missing optional facets
 *  are dropped, not fatal). */
function parseSubsystemsJson(raw: string): SubsystemSnapshot[] {
	const parsed = extractTopLevelJson(raw);
	if (parsed === null) return [];

	const arr = Array.isArray(parsed)
		? []
		: (parsed as { subsystems?: unknown }).subsystems;
	if (!Array.isArray(arr)) return [];

	const out: SubsystemSnapshot[] = [];
	for (const item of arr) {
		const s = validateSubsystem(item, out.length);
		if (s) out.push(s);
	}
	return out;
}

/** Parse the top-level JSON value (object or array) out of the agent's reply,
 *  tolerating prose and markdown fences. */
function extractTopLevelJson(raw: string): unknown | null {
	const text = raw.trim();
	if (!text) return null;

	let parsed: unknown = null;
	try {
		parsed = JSON.parse(text);
	} catch {
		// fall through to fence/balanced extraction
	}
	if (parsed === null) {
		try {
			const fenced = text
				.replace(/^```(?:json)?\s*/i, "")
				.replace(/```\s*$/i, "")
				.trim();
			parsed = JSON.parse(fenced);
		} catch {
			// fall through to balanced extraction
		}
	}
	if (parsed === null) {
		const extracted = extractBalancedJson(text);
		if (extracted !== null) {
			try {
				parsed = JSON.parse(extracted);
			} catch {
				parsed = null;
			}
		}
	}
	return parsed;
}

/** Pull the outermost balanced JSON value (object or array) out of a string. */
function extractBalancedJson(text: string): string | null {
	const start = text.search(/[{[]/);
	if (start < 0) return null;
	const open = text[start];
	const close = open === "{" ? "}" : "]";
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < text.length; i++) {
		const ch = text[i];
		if (inString) {
			if (escaped) escaped = false;
			else if (ch === "\\") escaped = true;
			else if (ch === '"') inString = false;
			continue;
		}
		if (ch === '"') {
			inString = true;
		} else if (ch === open) {
			depth++;
		} else if (ch === close) {
			depth--;
			if (depth === 0) return text.slice(start, i + 1);
		}
	}
	return null;
}

const VALID_CHANGE_TYPES: ConceptChangeType[] = [
	"execution",
	"derive",
	"integration",
	"ui",
];

function validateCard(
	raw: unknown,
	idx: number,
): ConceptCardData | null {
	if (typeof raw !== "object" || raw === null) return null;
	const r = raw as Record<string, unknown>;
	const title =
		typeof r["title"] === "string" && (r["title"] as string).trim()
			? (r["title"] as string).trim()
			: "";
	const description =
		typeof r["description"] === "string" && (r["description"] as string).trim()
			? (r["description"] as string).trim()
			: "";
	if (!title || !description) return null;

	const changeType = VALID_CHANGE_TYPES.includes(
		r["changeType"] as ConceptChangeType,
	)
		? (r["changeType"] as ConceptChangeType)
		: "execution";
	const points = Array.isArray(r["points"])
		? (r["points"] as unknown[]).filter((p): p is string => typeof p === "string")
		: [];
	const sessionIds = Array.isArray(r["sessionIds"])
		? (r["sessionIds"] as unknown[]).filter(
				(s): s is string => typeof s === "string",
			)
		: [];
	// Card repos are owner/name pairs — entries without an owner (local repos)
	// are dropped rather than carried as nulls.
	const repos = Array.isArray(r["repos"])
		? (r["repos"] as unknown[])
				.filter(
					(re): re is { owner?: unknown; name?: unknown } =>
						typeof re === "object" && re !== null,
				)
				.map((re) => ({
					owner: typeof re.owner === "string" ? re.owner : "",
					name: typeof re.name === "string" ? re.name : "",
				}))
				.filter((re) => re.owner !== "" && re.name !== "")
		: [];
	// Purl file-refs — keep only well-formed `pkg:<type>/<owner>/<name>#<path>`
	// refs with a subpath; the host parses + path-safety-checks them on open.
	const files = Array.isArray(r["files"])
		? (r["files"] as unknown[])
				.filter((f): f is string => typeof f === "string")
				.map((f) => f.trim())
				.filter((f) => {
					if (!f.startsWith("pkg:") || !f.includes("#")) return false;
					const [base] = f.split("#");
					const segs = base.split("/").slice(1);
					return segs.length >= 2; // type + owner + name
				})
				.slice(0, 8)
		: [];
	const keyBeats = Array.isArray(r["keyBeats"])
		? (r["keyBeats"] as unknown[])
				.filter((k): k is number => typeof k === "number")
				.map((k) => Math.floor(k))
				.filter((k) => k >= 1)
		: [];
	const arcKind = r["arcKind"] === "detour" ? "detour" : r["arcKind"] === "arc" ? "arc" : undefined;
	return {
		id:
			typeof r["id"] === "string" && (r["id"] as string).trim()
				? (r["id"] as string).trim()
				: `concept-${idx}`,
		title,
		changeType,
		status: "draft",
		sessionIds,
		repos,
		description,
		points: points.length > 0 ? points : [title],
		mermaid:
			typeof r["mermaid"] === "string" && (r["mermaid"] as string).trim()
				? (r["mermaid"] as string).trim()
				: "",
		markdown:
			typeof r["markdown"] === "string" && (r["markdown"] as string).trim()
				? (r["markdown"] as string).trim()
				: undefined,
		files: files.length > 0 ? files : undefined,
		arcKind,
		keyBeats: keyBeats.length > 0 ? keyBeats : undefined,
	};
}

// ---------------------------------------------------------------------------
// Subsystem snapshot validation
// ---------------------------------------------------------------------------

const SUBSYSTEM_ENTRY_KINDS: SubsystemEntryPointKind[] = [
	"class",
	"function",
	"interface",
	"type",
	"const",
	"method",
];

const INTEGRATION_MECHANISMS: SubsystemIntegrationMechanism[] = [
	"imports",
	"calls",
	"extends",
	"registers-into",
];

/** A well-formed purl file-ref: `pkg:<type>/<owner>/<name>#<subpath>`. */
function isPurlFileRef(v: string): boolean {
	if (!v.startsWith("pkg:") || !v.includes("#")) return false;
	const segs = v.split("#")[0].split("/").slice(1);
	return segs.length >= 2; // type + owner + name
}

function str(r: Record<string, unknown>, key: string): string | undefined {
	const v = r[key];
	return typeof v === "string" && (v as string).trim()
		? (v as string).trim()
		: undefined;
}

/** Validate one subsystem snapshot loosely — name is required; every optional
 *  facet tolerates malformed entries by dropping them rather than failing. */
function validateSubsystem(raw: unknown, idx: number): SubsystemSnapshot | null {
	if (typeof raw !== "object" || raw === null) return null;
	const r = raw as Record<string, unknown>;
	const name = str(r, "name");
	if (!name) return null;

	const files: SubsystemFileRef[] = [];
	if (Array.isArray(r["files"])) {
		for (const f of r["files"] as unknown[]) {
			if (typeof f !== "object" || f === null) continue;
			const fr = f as Record<string, unknown>;
			const purl = str(fr, "purl");
			if (!purl || !isPurlFileRef(purl)) continue;
			files.push({
				purl,
				role: fr["role"] === "supporting" ? "supporting" : "core",
				purpose: str(fr, "purpose"),
			});
		}
	}

	const entryPoints: SubsystemEntryPoint[] = [];
	if (Array.isArray(r["entryPoints"])) {
		for (const ep of r["entryPoints"] as unknown[]) {
			if (typeof ep !== "object" || ep === null) continue;
			const er = ep as Record<string, unknown>;
			const symbol = str(er, "symbol");
			const file = str(er, "file");
			if (!symbol || !file || !isPurlFileRef(file)) continue;
			const kind = SUBSYSTEM_ENTRY_KINDS.includes(
				er["kind"] as SubsystemEntryPointKind,
			)
				? (er["kind"] as SubsystemEntryPointKind)
				: "function";
			const line = typeof er["line"] === "number" ? Math.floor(er["line"]) : undefined;
			entryPoints.push({ symbol, kind, file, line, signature: str(er, "signature") });
		}
	}

	const integrations: SubsystemIntegration[] = [];
	if (Array.isArray(r["integrations"])) {
		for (const it of r["integrations"] as unknown[]) {
			if (typeof it !== "object" || it === null) continue;
			const ir = it as Record<string, unknown>;
			const to = str(ir, "to");
			if (!to) continue;
			const refs = Array.isArray(ir["refs"])
				? (ir["refs"] as unknown[]).filter((x): x is string => typeof x === "string")
				: [];
			integrations.push({
				to,
				mechanism: INTEGRATION_MECHANISMS.includes(
					ir["mechanism"] as SubsystemIntegrationMechanism,
				)
					? (ir["mechanism"] as SubsystemIntegrationMechanism)
					: "imports",
				refs,
			});
		}
	}

	const fixtures = Array.isArray(r["fixtures"])
		? (r["fixtures"] as unknown[])
				.filter((f): f is string => typeof f === "string" && isPurlFileRef(f.trim()))
				.map((f) => f.trim())
				.slice(0, 12)
		: [];

	const testSuites: SubsystemTestSuite[] = [];
	if (Array.isArray(r["testSuites"])) {
		for (const t of r["testSuites"] as unknown[]) {
			if (typeof t !== "object" || t === null) continue;
			const tr = t as Record<string, unknown>;
			const file = str(tr, "file");
			if (!file || !isPurlFileRef(file)) continue;
			testSuites.push({
				file,
				exercises: Array.isArray(tr["exercises"])
					? (tr["exercises"] as unknown[]).filter((x): x is string => typeof x === "string")
					: [],
				verifies: str(tr, "verifies"),
			});
		}
	}

	const sessionIds = Array.isArray(r["sessionIds"])
		? (r["sessionIds"] as unknown[]).filter((s): s is string => typeof s === "string")
		: [];

	const repoRaw = r["repo"];
	const repo =
		typeof repoRaw === "object" && repoRaw !== null
			? (() => {
					const or = repoRaw as Record<string, unknown>;
					const owner = str(or, "owner");
					const repoName = str(or, "name");
					return owner && repoName ? { owner, name: repoName } : undefined;
				})()
			: undefined;

	return {
		id: str(r, "id") ?? `subsystem-${idx}`,
		name,
		description: str(r, "description"),
		repo,
		files,
		entryPoints,
		integrations,
		fixtures,
		testSuites,
		graphMermaid: str(r, "graphMermaid"),
		sessionIds,
	};
}

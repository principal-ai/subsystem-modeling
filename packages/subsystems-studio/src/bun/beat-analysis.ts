/**
 * Beat analysis — the mechanical front half of session understanding.
 *
 * Turns a session's accumulated event layer into a compact, deterministic
 * beat list: segmentation (text-prompt anchors), per-beat classification
 * (kind by editing ops × function by prompt intent), and file/tool
 * collection. This is deliberately pure computation over the trimmed
 * `SessionEventRow[]` — no LLM, no raw payloads.
 *
 * The beats are the durable facts. Arcs (grouping beats by concept) and arc
 * summaries (concept/evidence prose, mermaid) are the *judgment* half and are
 * left to the extractor agent, which receives these beats in its brief plus
 * the CLI accessor to fetch the full accumulated feed when it needs more
 * signal.
 *
 * Classifier rules (validated across sessions; see the "session beats →
 * semantic arcs" topic):
 * - beat anchor = accumulated `operation === "prompting"` with non-empty
 *   `description` (text-bearing user turns; empty prompt rows are internal
 *   message updates and do not open beats)
 * - kind: `editing` ops present → work; else any reading/grepping/globbing/
 *   tool signal → investigation; else check-in
 * - function: work beats are always `content`; edit-free beats classify by
 *   prompt keywords with bookkeeping > transition > check-in precedence
 */

import type { SessionEventRow } from "../shared/contract";

export type BeatKind = "work" | "investigation" | "check-in";
export type BeatFunction = "content" | "bookkeeping" | "transition";

export interface Beat {
	/** 1-based beat number (order in the session). */
	index: number;
	prompt: string;
	/** Accumulated timestamp of the anchoring prompt event. */
	timestamp: number;
	/** Operation histogram across the beat's events. */
	ops: Record<string, number>;
	/** Distinct files touched (repo-root-relative when known, else display). */
	files: string[];
	/** Distinct files edited (subset of `files`). */
	edits: string[];
	/** Distinct tool names run (from `description` "ran X" lines). */
	tools: string[];
	/** Total non-prompt accumulated events in the beat. */
	evts: number;
	kind: BeatKind;
	function: BeatFunction;
}

export interface BeatAnalysis {
	sessionId: string;
	beats: Beat[];
}

/** Function keywords. Bookkeeping must outrank transition (known-issue #1). */
const BOOKKEEPING = /commit|publish|version|topic|status|diagram|delete|release|merge|push|deploy/i;
const TRANSITION =
	/where were we|what is next|next from|continue|fixed it|resume|in the middle|were we working|original work|keep going|ok\s+(lets?\s+)?(begin|start|go)|looks good|yep that/i;
const CHECKIN = /hows? it going|are you (there|ok)\??/i;

/** A substantive question (why/how/what/when/where + "?" or "help me understand") —
 *  the Q&A beat signal. */
const QUESTION = /(why|how|what|when|where|which|does|do|can|is|are)\b|\?|help me understand/i;

function classifyFunction(prompt: string): BeatFunction {
	const text = prompt.toLowerCase();
	if (CHECKIN.test(text)) return "transition";
	if (BOOKKEEPING.test(text)) return "bookkeeping";
	if (TRANSITION.test(text)) return "transition";
	return "content";
}

function classifyKind(ops: Record<string, number>, prompt: string): BeatKind {
	if ((ops["editing"] ?? 0) > 0) return "work";
	const signal =
		(ops["reading"] ?? 0) +
		(ops["grepping"] ?? 0) +
		(ops["globbing"] ?? 0) +
		(ops["tool"] ?? 0);
	if (signal > 0) return "investigation";
	// No tool signal: a substantive question is investigation (Q&A beat);
	// only social/short text is a check-in.
	if (QUESTION.test(prompt)) return "investigation";
	return "check-in";
}

/** Extract a file label from an accumulated file entry. */
export function fileLabel(f: unknown): string {
	if (typeof f === "string") return f;
	const obj = f as {
		repository?: { relativePath?: string };
		displayPath?: string;
		relativePath?: string;
	};
	return (
		obj?.repository?.relativePath ??
		obj?.displayPath ??
		obj?.relativePath ??
		JSON.stringify(f)
	);
}

/** The lock/meta files that carry no narrative signal (known-issue #4). */
const META_FILE = /bun\.lock|package\.json|pnpm-lock|yarn\.lock|npm-shrinkwrap|\.eb-import-test/;

/** Segment + classify a session's accumulated events into beats. */
export function analyzeBeats(
	sessionId: string,
	events: SessionEventRow[],
): BeatAnalysis {
	const beats: Beat[] = [];
	let cur: Beat | null = null;

	const flush = (): void => {
		if (cur) beats.push(cur);
		cur = null;
	};

	for (const row of events) {
		const acc = row.accumulated;
		if (!acc) continue;

		// Beat anchor: a text-bearing prompting event (user turn).
		const isPrompt = acc.operation === "prompting";
		const text = (acc.description ?? "").trim();
		if (isPrompt && text) {
			flush();
			cur = {
				index: beats.length + 1,
				prompt: text,
				timestamp: acc.timestamp ?? 0,
				ops: {},
				files: [],
				edits: [],
				tools: [],
				evts: 0,
				kind: "investigation",
				function: "content",
			};
			continue;
		}

		if (!cur) continue;
		cur.evts++;
		cur.ops[acc.operation] = (cur.ops[acc.operation] ?? 0) + 1;
		for (const f of acc.files ?? []) {
			const label = fileLabel(f);
			if (!cur.files.includes(label)) cur.files.push(label);
			if (acc.operation === "editing" && !cur.edits.includes(label)) {
				cur.edits.push(label);
			}
		}
		const tool = (acc.description ?? "").match(/ran (\w+)/);
		if (tool && !cur.tools.includes(tool[1])) cur.tools.push(tool[1]);
	}
	flush();

	for (const b of beats) {
		b.kind = classifyKind(b.ops, b.prompt);
		// Kind gates function: a work beat is always content (known-issue #2).
		b.function = b.kind === "work" ? "content" : classifyFunction(b.prompt);
	}

	return { sessionId, beats };
}

/**
 * Source edit set for arc evidence, with lock/meta files stripped so the
 * overlap signal and summaries aren't inflated by dependency bumps.
 */
export function evidenceEdits(beats: Beat[]): string[] {
	const out = new Set<string>();
	for (const b of beats) {
		for (const f of b.edits) if (!META_FILE.test(f)) out.add(f);
	}
	return [...out];
}

export function buildBeatBrief(analysis: BeatAnalysis): string {
	const lines: string[] = [];
	lines.push(`### Beats (${analysis.beats.length}) — deterministic segmentation + classification`);
	lines.push("");
	for (const b of analysis.beats) {
		const ts = new Date(b.timestamp).toISOString().slice(5, 16).replace("T", " ");
		const ops = Object.entries(b.ops)
			.sort((a, c) => c[1] - a[1])
			.map(([k, v]) => `${k}×${v}`)
			.join(" ");
		const prompt = b.prompt.length > 90 ? b.prompt.slice(0, 90) + "…" : b.prompt;
		lines.push(
			`B${b.index} [${ts}] kind=${b.kind} function=${b.function} evts=${b.evts} ${prompt}`,
		);
		if (ops) lines.push(`  ops: ${ops}`);
		if (b.edits.length) lines.push(`  edits: ${b.edits.join(", ")}`);
		if (b.tools.length) lines.push(`  tools: ${b.tools.join(", ")}`);
	}
	lines.push("");
	return lines.join("\n");
}

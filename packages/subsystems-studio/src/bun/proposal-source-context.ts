/**
 * Source-context builder for proposal second opinions.
 *
 * The Jev `state` is otherwise just the agent's prose rationale + a before/after
 * preview — enough to describe a claim but not to verify it. This resolves each
 * proposal change to its component's local checkout (via purl → Alexandria),
 * reads the declaration site, and appends the resulting block to the state so
 * Jev can check the claim against real code instead of trusting the author.
 */

import { promises as fs } from "node:fs";
import { join } from "node:path";
import type {
	SubsystemModelDocument,
	SubsystemModelProposal,
	SubsystemModelProposalChange,
} from "../shared/contract";
import { resolveRepoRootForPurl } from "./graphify-store";
import { purlRepoKey } from "./subsystem-model-store";

/**
 * Window around an anchor line. Biased forward: a small lead-in catches the
 * JSDoc/annotations directly above the declaration, while the bulk of the
 * window extends past it so the signature and body are visible. A symmetric
 * window would mostly show the previous declaration instead.
 */
const CONTEXT_BEFORE_LINES = 5;
const CONTEXT_AFTER_LINES = 40;
/** Cap for a single component's rendered slice. */
const MAX_CHARS_PER_COMPONENT = 8000;
/** Cap for the whole source-context block. */
const MAX_TOTAL_CHARS = 24000;

interface LineRange {
	start: number;
	end: number;
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitLines(content: string): string[] {
	return content.split(/\r?\n/);
}

/**
 * First 1-based line declaring `symbol` (function/class/interface/type/…), or
 * the first line that merely mentions it. Text scan — no graphify dependency.
 */
export function findSymbolLine(
	content: string,
	symbol: string | undefined,
): number | null {
	const name = symbol?.trim();
	if (!name) return null;
	const lines = splitLines(content);
	const decl = new RegExp(
		`\\b(?:function|class|interface|type|enum|const|let|var)\\s+${escapeRegExp(name)}\\b`,
	);
	for (let i = 0; i < lines.length; i++) {
		if (decl.test(lines[i] ?? "")) return i + 1;
	}
	for (let i = 0; i < lines.length; i++) {
		if ((lines[i] ?? "").includes(name)) return i + 1;
	}
	return null;
}

/** Merge overlapping/adjacent ranges so each line renders once. */
export function mergeRanges(ranges: LineRange[]): LineRange[] {
	const sorted = [...ranges].sort((a, b) => a.start - b.start);
	const out: LineRange[] = [];
	for (const r of sorted) {
		const last = out[out.length - 1];
		if (last && r.start <= last.end + 1) {
			last.end = Math.max(last.end, r.end);
		} else {
			out.push({ start: r.start, end: r.end });
		}
	}
	return out;
}

function windowAround(line: number, total: number): LineRange {
	return {
		start: Math.max(1, line - CONTEXT_BEFORE_LINES),
		end: Math.min(total, line + CONTEXT_AFTER_LINES),
	};
}

function renderRanges(lines: string[], ranges: LineRange[]): string {
	const parts: string[] = [];
	for (const r of ranges) {
		const body = lines
			.slice(r.start - 1, r.end)
			.map((l, i) => `${String(r.start + i).padStart(5)}| ${l}`)
			.join("\n");
		parts.push(body);
	}
	return parts.join("\n      …\n");
}

/** Component aliases a proposal touches (component + augmentation changes). */
function componentAliases(proposal: SubsystemModelProposal): string[] {
	const aliases = new Set<string>();
	if (proposal.finding?.componentAlias) aliases.add(proposal.finding.componentAlias);
	for (const change of proposal.changes) {
		if ("componentAlias" in change && change.componentAlias) {
			aliases.add(change.componentAlias);
		}
	}
	return [...aliases];
}

/**
 * Agent-declared line span for an augmentation on `alias`, when the change
 * carries one. Later changes win; the first valid span found is returned.
 */
function declaredSpan(
	proposal: SubsystemModelProposal,
	alias: string,
): { start: number; end: number } | undefined {
	for (const change of proposal.changes) {
		if (change.target !== "augmentation") continue;
		if (!("componentAlias" in change) || change.componentAlias !== alias) continue;
		const span = (change as { lines?: { start?: unknown; end?: unknown } }).lines;
		const start = typeof span?.start === "number" ? span.start : null;
		const end = typeof span?.end === "number" ? span.end : null;
		if (start != null && end != null && start >= 1 && end >= start) {
			return { start, end };
		}
	}
	return undefined;
}

function sliceComponent(
	content: string,
	declarationLine: number | null,
	span?: { start: number; end: number },
): string {
	const lines = splitLines(content);
	const total = lines.length;
	const ranges: LineRange[] = [];
	if (span) {
		// The agent told us exactly which lines it read. Union with the
		// declaration anchor so the span can never exclude the declaration
		// itself (guards against a too-narrow agent span).
		const start = Math.max(1, Math.min(span.start, declarationLine ?? span.start));
		const end = Math.min(total, Math.max(span.end, declarationLine ?? span.end));
		ranges.push({ start, end });
	} else if (declarationLine != null) {
		ranges.push(windowAround(declarationLine, total));
	}
	if (ranges.length === 0) {
		// No anchor found — show the head of the file rather than nothing.
		ranges.push({
			start: 1,
			end: Math.min(total, CONTEXT_BEFORE_LINES + CONTEXT_AFTER_LINES),
		});
	}
	return renderRanges(lines, mergeRanges(ranges));
}

/**
 * First callSite augmentation change in the proposal, if any. Call site
 * changes are keyed by trail step and carry their own file/purl rather than a
 * component alias.
 */
function callSiteChange(
	proposal: SubsystemModelProposal,
): (SubsystemModelProposalChange & {
	field: "callSite";
	trailId: string;
	stepIndex: number;
	file: string;
	purl: string;
	value: { lines: { start: number; end: number } };
}) | undefined {
	for (const change of proposal.changes) {
		if (change.target !== "augmentation" || change.field !== "callSite")
			continue;
		const ch = change as unknown as {
			trailId?: unknown;
			stepIndex?: unknown;
			file?: unknown;
			purl?: unknown;
			value?: { lines?: { start?: unknown; end?: unknown } };
		};
		const start = typeof ch.value?.lines?.start === "number" ? ch.value.lines.start : null;
		const end = typeof ch.value?.lines?.end === "number" ? ch.value.lines.end : null;
		if (
			typeof ch.trailId === "string" &&
			typeof ch.stepIndex === "number" &&
			typeof ch.file === "string" &&
			typeof ch.purl === "string" &&
			start != null &&
			end != null &&
			start >= 1 &&
			end >= start
		) {
			return {
				...change,
				field: "callSite",
				trailId: ch.trailId,
				stepIndex: ch.stepIndex,
				file: ch.file,
				purl: ch.purl,
				value: { lines: { start, end } },
			} as SubsystemModelProposalChange & {
				field: "callSite";
				trailId: string;
				stepIndex: number;
				file: string;
				purl: string;
				value: { lines: { start: number; end: number } };
			};
		}
	}
	return undefined;
}

/**
 * Build the source-context block for a proposal, or `undefined` when nothing
 * could be resolved locally (no repo checkout, missing file, no aliases).
 */
export async function buildProposalSourceContext(
	graph: Pick<SubsystemModelDocument, "components">,
	proposal: SubsystemModelProposal,
): Promise<string | undefined> {
	const aliases = componentAliases(proposal);
	const callSite = callSiteChange(proposal);
	if (aliases.length === 0 && !callSite) return undefined;
	const blocks: string[] = [];
	let total = 0;

	if (callSite) {
		// The caller file is the code Jev must check the claim against: slice
		// the claimed span with breathing room around it.
		const purlKey = purlRepoKey(callSite.purl);
		const repoRoot = purlKey ? resolveRepoRootForPurl(purlKey) : null;
		if (repoRoot) {
			try {
				const content = await fs.readFile(
					join(repoRoot, callSite.file),
					"utf8",
				);
				const lines = splitLines(content);
				const start = Math.max(1, callSite.value.lines.start - CONTEXT_BEFORE_LINES);
				const end = Math.min(
					lines.length,
					callSite.value.lines.end + CONTEXT_AFTER_LINES,
				);
				const rendered = renderRanges(lines, [{ start, end }]);
				const block = [
					`--- ${callSite.file} (claimed call site lines ${callSite.value.lines.start}-${callSite.value.lines.end}, trail ${callSite.trailId} step ${callSite.stepIndex + 1}) ---`,
					rendered,
				].join("\n");
				blocks.push(block.slice(0, MAX_CHARS_PER_COMPONENT));
				total += block.length;
			} catch {
				// Caller file unreadable — fall through to component context.
			}
		}
	}

	for (const alias of aliases) {
		const component = graph.components.find((c) => c.alias === alias);
		if (!component?.file) continue;
		const purlKey = purlRepoKey(component.purl);
		const repoRoot = purlKey ? resolveRepoRootForPurl(purlKey) : null;
		if (!repoRoot) continue;

		let content: string;
		try {
			content = await fs.readFile(join(repoRoot, component.file), "utf8");
		} catch {
			continue;
		}

		const symbol = component.symbol ?? component.name;
		const declarationLine =
			component.declarationRef?.startLine ?? findSymbolLine(content, symbol);

		const span = declaredSpan(proposal, alias);
		const rendered = sliceComponent(content, declarationLine, span);
		const block = [
			`--- ${component.file}${
				declarationLine != null ? `:${declarationLine}` : ""
			}${span ? ` (lines ${span.start}-${span.end})` : ""} (symbol ${symbol}) ---`,
			rendered,
		].join("\n");
		if (total + block.length > MAX_TOTAL_CHARS) break;
		blocks.push(block.slice(0, MAX_CHARS_PER_COMPONENT));
		total += block.length;
	}

	return blocks.length > 0 ? blocks.join("\n\n") : undefined;
}

/**
 * Jev second-opinion gate for subsystem proposals.
 *
 * Sends the proposal as state plus three atomic questions (accurate:noul,
 * change_kind:choice, risk:score) to the configured judge — the hosted
 * TypeSafe AI SystemOne endpoint or a local Ollama model (see `judge.ts`).
 * Fail-open: transport or parse errors are returned as an opinion with
 * `verdict: "uncertain"` plus `error`, never thrown, so the caller can
 * persist and display without blocking accept/reject.
 *
 * Phase 1 displays the opinion in ProposalsModal; Phase 2 auto-accepts a
 * proposal only when its calibrated confidence clears the configured
 * threshold (`autoAcceptProposalIfConfident`).
 *
 * API docs: https://docs.typesafe.ai/api
 */

import type {
	JudgeProbeResult,
	SubsystemModelProposal,
	SubsystemModelProposalChange,
	SubsystemModelSecondOpinion,
	SubsystemModelSecondOpinionRequest,
	SubsystemVerificationLane,
} from "../shared/contract";
import {
	describeJudgeFailure,
	resolveJudge,
	type Judge,
	type JudgeQuestions,
	type JudgeSettings,
} from "./judge";
import { deriveProposalLane } from "./proposal-lane";
import {
	acceptSubsystemModelProposal,
	setProposalSecondOpinion,
} from "./proposal-store";

export {
	envTypesafeKey,
	JEV_MODEL,
	JEV_SYSTEMONE_URL,
	TYPESAFE_KEY_HELP,
} from "./judge";

function clamp01(n: unknown): number {
	if (typeof n !== "number" || !Number.isFinite(n)) return 0;
	if (n < 0) return 0;
	if (n > 1) return 1;
	return n;
}

function previewText(p: SubsystemModelProposal): string {
	return p.preview
		.slice(0, 8)
		.map((r) => `${r.label}: ${JSON.stringify(r.before)} -> ${JSON.stringify(r.after)}`)
		.join("\n");
}

export function buildProposalState(
	p: SubsystemModelProposal,
	opts?: { sourceContext?: string },
): string {
	const finding = p.finding
		? `Finding (${p.finding.kind ?? "unknown"}): ${p.finding.message ?? ""}`
		: "Finding: none linked";
	const parts = [
		`Proposal rationale: ${p.rationale}`,
		finding,
		`Author: ${p.author ?? "unknown"}`,
		`Changes (${p.changes.length}):`,
		previewText(p),
	];
	const ctx = opts?.sourceContext?.trim();
	if (ctx) {
		parts.push("", "Source under review:", ctx);
	}
	return parts.join("\n");
}

type JevAnswers = Record<string, unknown>;

/** Lane-level accuracy subject for non-construct lanes. */
const LANE_SUBJECT: Record<SubsystemVerificationLane, string> = {
	construct:
		"The proposed construct correction is an accurate extraction of the declaration in the source under review.",
	"static-topology":
		"The proposed package/module containment claim is accurate given the source under review.",
	"dynamic-topology":
		"The proposed process (runtime deployment-unit) membership is accurate given the source under review.",
	trail:
		"The proposed trail step is accurate given the source under review.",
};

/** Construct-lane wording, finer-grained by change. */
function constructSubject(proposal: SubsystemModelProposal): string {
	const c: SubsystemModelProposalChange | undefined = proposal.changes[0];
	if (!c) return LANE_SUBJECT.construct;
	if (c.target === "declaration") {
		return "The proposed declaration field is an accurate, faithful extraction of the declaration in the source under review. A store's `valueType` must be the type of the retained state exactly as written at the declaration site (e.g. `Map<string, FeedState>`, `Set<Listener>`), not a paraphrase, not the store's own name, and not the accessor's return type unless that genuinely is the retained type. When the declaration states no explicit type annotation, the initializer is the evidence — `new Map<string, number>()` declares `Map<string, number>`; do not treat an unannotated `new Map()` as unverifiable, and do not invent a type it does not have.";
	}
	if (c.target === "augmentation") {
		if (c.field === "signature") {
			return "The proposed signature is an accurate, complete extraction of the function/method declaration in the source under review. For a React component function (in a .tsx file) that destructures a single props object and returns JSX without a declared return type, an inferred JSX.Element return type is the correct and expected claim — treat the absence of an explicit return annotation as confirming JSX.Element whenever the body contains a `return ( ... )` or other JSX expression, and do not penalize the claim for inferring it. When the declaration has an explicit return annotation, that declared type is authoritative and complete: a named or union return type (for example `Promise<MaintainModelResult>` or `MaintainRoute | null`) is the correct claim whenever it matches the source. Likewise a structural object parameter type (for example `opts?: { model?: string; onSession?: (sessionId: string) => void }`) is the correct claim when it matches the source verbatim; do not treat structural, optional, or function-typed members as unverifiable.";
		}
		if (c.field === "construct") {
			return "The proposed construct classification is accurate for the declaration in the source under review.";
		}
	}
	if (c.target === "component") {
		if (c.field === "declarationSpan") {
			return "The proposed declaration span (start/end lines + content hash) is correct for the source under review.";
		}
		return "The proposed component identity or field value is correct given the source under review.";
	}
	return LANE_SUBJECT.construct;
}

/** Trail-lane wording, finer-grained by change. */
function trailSubject(proposal: SubsystemModelProposal): string {
	const c: SubsystemModelProposalChange | undefined = proposal.changes[0];
	if (
		c?.target === "augmentation" &&
		c.field === "callSite"
	) {
		return "The proposed call site verification is accurate: the claimed line span in the caller file contains the caller's call to the target symbol, with the claimed mechanism, and the span matches the source exactly.";
	}
	return LANE_SUBJECT.trail;
}

export function proposalLane(
	proposal: SubsystemModelProposal,
): SubsystemVerificationLane {
	return proposal.lane ?? deriveProposalLane(proposal);
}

/**
 * The primary question is an *accuracy* judgment — "does the source support
 * this proposed value?" — not an accept-safety one (that is `risk`). Wording
 * is chosen by verification lane, and finer-grained within the construct lane.
 */
export function accuracyInstruction(proposal: SubsystemModelProposal): string {
	const lane = proposalLane(proposal);
	const subject =
		lane === "construct"
			? constructSubject(proposal)
			: lane === "trail"
				? trailSubject(proposal)
				: LANE_SUBJECT[lane];
	return `${subject} Judge only whether the source supports it — ignore whether accepting it is risky.`;
}

/**
 * Risk wording for auto-accept. A signature augmentation that was checked
 * against the declaration in the source under review is a low-risk, reversible
 * claim (it records a confirmation in the augmentation store; it does not
 * rewrite model JSON), so steer Jev toward Safe rather than the generic
 * "Needs human" default for augmentations.
 */
export function riskInstruction(
	proposal: SubsystemModelProposal,
	opts?: { hasSourceContext?: boolean },
): string {
	const base = "Risk of auto-accepting this correction";
	const c = proposal.changes[0];
	const isSourceBackedSignatureAugment =
		opts?.hasSourceContext === true &&
		proposalLane(proposal) === "construct" &&
		c?.target === "augmentation" &&
		c.field === "signature";
	if (isSourceBackedSignatureAugment) {
		return `${base}. This is a signature augmentation verified against the declaration in the source under review; it records a confirmation and does not rewrite the model JSON. Score Safe when the proposed signature matches the source, Needs human only when the source is ambiguous, and Unsafe only when the source contradicts it.`;
	}
	const isSourceBackedCallSiteAugment =
		opts?.hasSourceContext === true &&
		proposalLane(proposal) === "trail" &&
		c?.target === "augmentation" &&
		c.field === "callSite";
	if (isSourceBackedCallSiteAugment) {
		return `${base}. This is a call site augmentation verified against the caller file in the source under review; it records a confirmation (content hash of the claimed span) and does not rewrite the model JSON. Score Safe when the claimed span contains the caller's call to the target symbol, Needs human only when the call site is ambiguous, and Unsafe only when the source contradicts the claim.`;
	}
	return base;
}

/** Per-lane `change_kind` choice: instructions + option criteria. */
export function changeKindQuestion(proposal: SubsystemModelProposal): {
	instructions: string;
	criteria: Record<string, string>;
} {
	switch (proposalLane(proposal)) {
		case "static-topology":
			return {
				instructions: "What kind of static-topology correction is this?",
				criteria: {
					module_augment: "Confirming an intentional module grouping",
					module_fix: "Correcting a component's module",
				},
			};
		case "dynamic-topology":
			return {
				instructions: "What kind of dynamic-topology correction is this?",
				criteria: {
					process_fix: "Correcting a component's process (deployment unit)",
				},
			};
		case "trail":
			return {
				instructions: "What kind of trail correction is this?",
				criteria: {
					trail_fix:
						"Correcting a trail step (file, line, symbol, from/to, mechanism)",
					callsite_confirm:
						"Verifying a trail step's call site (a callSite augmentation)",
				},
			};
		default:
			return {
				instructions: "What kind of construct correction is this?",
				criteria: {
					signature_augment: "Confirming parameter or return types",
					construct_augment: "Confirming a component construct classification",
					identity_fix: "Correcting file, symbol, name, or purl",
					construct_fix: "Correcting the model's construct",
					declaration_field: "Authoring a declaration field (e.g. a store's valueType)",
					declaration_ref: "Re-pinning a declaration anchor",
				},
			};
	}
}

function asRecord(v: unknown): Record<string, unknown> | null {
	if (!v || typeof v !== "object" || Array.isArray(v)) return null;
	return v as Record<string, unknown>;
}

function num(v: unknown): number | null {
	return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
	return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Map raw Jev answers to a display verdict. The `accurate` noul is
 * authoritative; choice/score echoes are informational.
 */
export function verdictFromAnswers(answers: JevAnswers): {
	verdict: SubsystemModelSecondOpinion["verdict"];
	confidence: number;
	changeKind?: string;
	risk?: string;
} {
	const accRaw = asRecord(answers["accurate"]);
	const kindRaw = asRecord(answers["change_kind"]);
	const riskRaw = asRecord(answers["risk"]);

	const noul = accRaw ? num(accRaw["noul"]) : null;
	const choiceConf = kindRaw ? num(kindRaw["confidence"]) : null;
	const changeKind = kindRaw ? str(kindRaw["choice"]) : null;

	const riskScore = riskRaw ? num(riskRaw["score"]) : null;
	const riskConf = riskRaw ? num(riskRaw["confidence"]) : null;
	const risk =
		riskScore == null
			? undefined
			: riskScore <= 0.33
				? "Safe"
				: riskScore <= 0.66
					? "Needs human"
					: "Unsafe";

	const confidence = clamp01(noul ?? choiceConf ?? riskConf ?? 0);
	const verdict =
		noul == null
			? "uncertain"
			: noul >= 0.85
				? "accurate"
				: noul >= 0.5
					? "uncertain"
					: "inaccurate";

	return {
		verdict,
		confidence,
		changeKind: changeKind ?? undefined,
		risk,
	};
}

/** How a caller selects the judge: a resolved instance, or settings to resolve one from. */
export interface JudgeSelection {
	/** Pre-built judge; wins over `settings`. */
	judge?: Judge;
	/** Viewer settings to pick the judge from (provider, key, Ollama model). */
	settings?: Partial<JudgeSettings>;
	/** Jev model override (TypeSafe provider only). */
	model?: string;
	/** Jev endpoint override (TypeSafe provider only). */
	endpoint?: string;
	/** Explicit TypeSafe key; wins over settings and env. */
	apiKey?: string;
}

function selectJudge(opts: JudgeSelection | undefined): ReturnType<typeof resolveJudge> {
	if (opts?.judge) return { ok: true, judge: opts.judge };
	return resolveJudge(opts?.settings, {
		apiKey: opts?.apiKey,
		model: opts?.model,
		endpoint: opts?.endpoint,
	});
}

/** The three questions every proposal is asked, in Jev's question format. */
export function proposalQuestions(
	proposal: SubsystemModelProposal,
	opts?: { sourceContext?: string },
): JudgeQuestions {
	return {
		accurate: {
			type: "noul",
			instructions: accuracyInstruction(proposal),
		},
		change_kind: {
			type: "choice",
			...changeKindQuestion(proposal),
		},
		risk: {
			type: "score",
			instructions: riskInstruction(proposal, {
				hasSourceContext: Boolean(opts?.sourceContext?.trim()),
			}),
			criteria: ["Safe", "Needs human", "Unsafe"],
		},
	};
}

export async function evaluateProposalSecondOpinion(
	proposal: SubsystemModelProposal,
	opts?: JudgeSelection & { sourceContext?: string },
): Promise<SubsystemModelSecondOpinion> {
	const selected = selectJudge(opts);
	if (!selected.ok) {
		return {
			source: selected.source,
			checkedAt: new Date().toISOString(),
			verdict: "uncertain",
			confidence: 0,
			error: selected.error,
		};
	}
	const judge = selected.judge;
	const source = judge.source as SubsystemModelSecondOpinion["source"];
	// Compose the exact body sent to the judge. Kept in a local so it can be
	// both sent and persisted on the opinion (`request`) — the state is
	// otherwise discarded after the call, leaving a score unexplainable after
	// the fact.
	const state = buildProposalState(proposal, {
		sourceContext: opts?.sourceContext,
	});
	const questions = proposalQuestions(proposal, { sourceContext: opts?.sourceContext });
	const request: SubsystemModelSecondOpinionRequest = {
		model: source,
		state,
		questions,
	};
	const res = await judge.ask({ state, questions });
	if (!res.ok) {
		return {
			source,
			checkedAt: new Date().toISOString(),
			verdict: "uncertain",
			confidence: 0,
			error: describeJudgeFailure(judge.name, res),
		};
	}
	const mapped = verdictFromAnswers(res.answers);
	return {
		source,
		checkedAt: new Date().toISOString(),
		...mapped,
		request,
	};
}

const PROBE_STATE = [
	"Proposal rationale: Source declares `export function add(a: number, b: number): number` at src/math.ts lines 1-3; declared return type is number.",
	"Finding (signature_unconfirmed): Graphify has no signature edges.",
	"Author: construct-verifier",
	"Changes (1):",
	'signature: undefined -> {"parameters":[{"name":"a","type":"number"},{"name":"b","type":"number"}],"returnType":"number"}',
	"",
	"Source under review:",
	"export function add(a: number, b: number): number {",
	"\treturn a + b;",
	"}",
].join("\n");

/**
 * Ask the configured judge one canned, unambiguous question so Settings can
 * show whether it answers at all and how long it takes. Never persisted.
 */
export async function probeJudge(
	settings: Partial<JudgeSettings>,
): Promise<JudgeProbeResult> {
	const selected = resolveJudge(settings);
	if (!selected.ok) {
		return { ok: false, error: selected.error, source: selected.source, provider: selected.provider, elapsedMs: 0 };
	}
	const judge = selected.judge;
	const started = Date.now();
	const res = await judge.ask({
		state: PROBE_STATE,
		questions: {
			accurate: {
				type: "noul",
				instructions: "The proposed signature is an accurate, complete extraction of the function declaration in the source under review. Judge only whether the source supports it.",
			},
			risk: {
				type: "score",
				instructions: "Risk of auto-accepting this correction. Score Safe when the proposed signature matches the source.",
				criteria: ["Safe", "Needs human", "Unsafe"],
			},
		},
	});
	const elapsedMs = Date.now() - started;
	if (!res.ok) {
		return { ok: false, error: describeJudgeFailure(judge.name, res), source: judge.source, provider: judge.provider, elapsedMs };
	}
	const mapped = verdictFromAnswers(res.answers);
	return {
		ok: true,
		source: judge.source,
		provider: judge.provider,
		elapsedMs,
		verdict: mapped.verdict,
		confidence: mapped.confidence,
		risk: mapped.risk,
	};
}

/**
 * Pure gate predicate: an opinion qualifies only when it scored without error
 * and its calibrated confidence is at or above the threshold. Missing opinions
 * never qualify (the caller scores first).
 */
export function shouldAutoAcceptOnConfidence(
	opinion: SubsystemModelSecondOpinion | undefined,
	threshold: number,
): boolean {
	if (!opinion || opinion.error) return false;
	return opinion.confidence >= threshold;
}

/**
 * Phase 2 gate: score a fresh proposal with Jev and auto-accept only when the
 * calibrated confidence clears `threshold`. Scoring errors and missing keys
 * leave the proposal pending (never fail open into an auto-accept). The
 * opinion is persisted either way so the modal can show why it was held back.
 */
export async function autoAcceptProposalIfConfident(
	graphId: string,
	proposal: SubsystemModelProposal,
	opts: JudgeSelection & {
		enabled: boolean;
		threshold: number;
		sourceContext?: string;
	},
): Promise<{
	accepted: boolean;
	proposal: SubsystemModelProposal;
	error?: string;
}> {
	if (!opts.enabled) return { accepted: false, proposal };
	let current = proposal;
	let opinion = current.secondOpinion;
	if (!opinion || opinion.error) {
		opinion = await evaluateProposalSecondOpinion(current, {
			judge: opts.judge,
			settings: opts.settings,
			apiKey: opts.apiKey,
			sourceContext: opts.sourceContext,
		});
		const stored = await setProposalSecondOpinion(graphId, current.id, opinion);
		if (stored.ok) current = stored.proposal;
	}
	if (opinion.error) return { accepted: false, proposal: current, error: opinion.error };
	if (!shouldAutoAcceptOnConfidence(opinion, opts.threshold)) {
		return { accepted: false, proposal: current };
	}
	const accepted = await acceptSubsystemModelProposal(graphId, current.id);
	if (!accepted.ok) return { accepted: false, proposal: current, error: accepted.error };
	return { accepted: true, proposal: accepted.proposal };
}

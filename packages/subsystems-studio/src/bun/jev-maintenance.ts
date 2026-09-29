/**
 * Jev second-opinion gate for subsystem proposals.
 *
 * Calls the TypeSafe AI SystemOne endpoint with the proposal as state and
 * three atomic questions (accurate:noul, change_kind:choice, risk:score).
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
	SubsystemModelProposal,
	SubsystemModelProposalChange,
	SubsystemModelSecondOpinion,
	SubsystemModelSecondOpinionRequest,
	SubsystemVerificationLane,
} from "../shared/contract";
import { deriveProposalLane } from "./proposal-lane";
import {
	acceptSubsystemModelProposal,
	setProposalSecondOpinion,
} from "./proposal-store";

export const JEV_SYSTEMONE_URL = "https://api.typesafe.ai/v1/systemone";
/** Override with PRINCIPAL_JEV_MODEL (e.g. `jev-1.13.0`, `jev-preview`). */
export const JEV_MODEL =
	process.env["PRINCIPAL_JEV_MODEL"]?.trim() || "jev-latest";
const JEV_TIMEOUT_MS = 15000;

export const TYPESAFE_KEY_HELP =
	"Missing Jev API key — add your TypeSafe AI key in Settings → Jev, set TYPESAFE_API_KEY, or get one at https://console.typesafe.ai/keys.";

/** Env fallback for the TypeSafe AI key. */
function envTypesafeKey(): string | null {
	const key =
		process.env["TYPESAFE_API_KEY"]?.trim() ||
		process.env["PRINCIPAL_JEV_API_KEY"]?.trim() ||
		"";
	return key || null;
}

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
	walkthrough:
		"The proposed walkthrough step is accurate given the source under review.",
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
		if (c.field === "declarationRef") {
			return "The proposed declaration anchor (file + line) is correct for the source under review.";
		}
		return "The proposed component identity or field value is correct given the source under review.";
	}
	return LANE_SUBJECT.construct;
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
		lane === "construct" ? constructSubject(proposal) : LANE_SUBJECT[lane];
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
	if (!isSourceBackedSignatureAugment) return base;
	return `${base}. This is a signature augmentation verified against the declaration in the source under review; it records a confirmation and does not rewrite the model JSON. Score Safe when the proposed signature matches the source, Needs human only when the source is ambiguous, and Unsafe only when the source contradicts it.`;
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
		case "walkthrough":
			return {
				instructions: "What kind of walkthrough correction is this?",
				criteria: {
					walkthrough_fix:
						"Correcting a walkthrough step (file, line, symbol, from/to, mechanism)",
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

export async function evaluateProposalSecondOpinion(
	proposal: SubsystemModelProposal,
	opts?: {
		model?: string;
		endpoint?: string;
		apiKey?: string;
		sourceContext?: string;
	},
): Promise<SubsystemModelSecondOpinion> {
	const source = (opts?.model ?? JEV_MODEL) as SubsystemModelSecondOpinion["source"];
	const apiKey = opts?.apiKey?.trim() || envTypesafeKey();
	if (!apiKey) {
		return {
			source,
			checkedAt: new Date().toISOString(),
			verdict: "uncertain",
			confidence: 0,
			error: TYPESAFE_KEY_HELP,
		};
	}
	// Compose the exact body sent to Jev. Kept in a local so it can be both
	// sent and persisted on the opinion (`request`) — the state is otherwise
	// discarded after the call, leaving a score unexplainable after the fact.
	const state = buildProposalState(proposal, {
		sourceContext: opts?.sourceContext,
	});
	const questions = {
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
	const request: SubsystemModelSecondOpinionRequest = {
		model: source,
		state,
		questions,
	};
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), JEV_TIMEOUT_MS);
	try {
		const res = await fetch(opts?.endpoint ?? JEV_SYSTEMONE_URL, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			signal: ctrl.signal,
			body: JSON.stringify(request),
		});
		if (!res.ok) {
			let detail = "";
			try {
				detail = ` — ${(await res.text()).slice(0, 200)}`;
			} catch {
				/* body unreadable */
			}
			return {
				source,
				checkedAt: new Date().toISOString(),
				verdict: "uncertain",
				confidence: 0,
				error: `Jev HTTP ${res.status}${detail}`,
			};
		}
		const body = (await res.json()) as { answers?: JevAnswers };
		const answers = body.answers && typeof body.answers === "object" ? body.answers : null;
		if (!answers) {
			return {
				source,
				checkedAt: new Date().toISOString(),
				verdict: "uncertain",
				confidence: 0,
				error: "Jev response had no answers",
			};
		}
		const mapped = verdictFromAnswers(answers);
		return {
			source,
			checkedAt: new Date().toISOString(),
			...mapped,
			request,
		};
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return {
			source,
			checkedAt: new Date().toISOString(),
			verdict: "uncertain",
			confidence: 0,
			error: msg.includes("abort") ? "Jev request timed out" : msg,
		};
	} finally {
		clearTimeout(timer);
	}
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
	opts: {
		enabled: boolean;
		threshold: number;
		apiKey?: string;
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

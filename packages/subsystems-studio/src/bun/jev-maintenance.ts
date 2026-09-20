/**
 * Jev second-opinion gate for subsystem proposals (Phase 1: display-only).
 *
 * Calls the OpenCode Zen SystemOne endpoint with the proposal as state and
 * three atomic questions (safe_to_auto_accept:noul, change_kind:choice,
 * risk:score). Fail-open: transport or parse errors are returned as an
 * opinion with `verdict: "needs-human"` plus `error`, never thrown, so the
 * caller can persist and display without blocking accept/reject.
 */

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
	SubsystemModelProposal,
	SubsystemModelSecondOpinion,
} from "../shared/contract";

export const JEV_SYSTEMONE_URL = "https://opencode.ai/zen/v1/systemone";
/** Free by default; set PRINCIPAL_JEV_MODEL=jev-1.13 for the paid tier. */
export const JEV_MODEL =
	process.env["PRINCIPAL_JEV_MODEL"]?.trim() || "jev-1.13-free";
const JEV_TIMEOUT_MS = 15000;

export const ZEN_KEY_HELP =
	"Missing Zen API key — run /connect in opencode, choose OpenCode Zen (sign in at https://opencode.ai/auth), or set OPENCODE_API_KEY and restart Studio. Scoring uses jev-1.13-free, which is free.";

function envZenKey(): string | null {
	const key =
		process.env["OPENCODE_API_KEY"]?.trim() ||
		process.env["PRINCIPAL_ZEN_API_KEY"]?.trim() ||
		"";
	return key || null;
}

/**
 * Best-effort read of the Zen key opencode stores after `/connect` →
 * OpenCode Zen (`~/.local/share/opencode/auth.json`). Shapes vary by
 * opencode version, so probe defensively; never throws.
 */
async function storedZenKey(): Promise<string | null> {
	try {
		const base =
			process.env["XDG_DATA_HOME"]?.trim() ||
			join(homedir(), ".local", "share");
		const raw = await fs.readFile(join(base, "opencode", "auth.json"), "utf8");
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		for (const provider of ["opencode", "opencode-zen", "zen"]) {
			const entry = parsed[provider];
			if (typeof entry === "string" && entry.trim()) return entry.trim();
			if (entry && typeof entry === "object") {
				const rec = entry as Record<string, unknown>;
				for (const field of ["apiKey", "token", "key", "api_key"]) {
					const v = rec[field];
					if (typeof v === "string" && v.trim()) return v.trim();
				}
			}
		}
	} catch {
		/* absent or unreadable — caller reports missing key */
	}
	return null;
}

async function zenApiKey(): Promise<string | null> {
	return envZenKey() ?? (await storedZenKey());
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

export function buildProposalState(p: SubsystemModelProposal): string {
	const finding = p.finding
		? `Finding (${p.finding.kind ?? "unknown"}): ${p.finding.message ?? ""}`
		: "Finding: none linked";
	return [
		`Proposal rationale: ${p.rationale}`,
		finding,
		`Author: ${p.author ?? "unknown"}`,
		`Changes (${p.changes.length}):`,
		previewText(p),
	].join("\n");
}

type JevAnswers = Record<string, unknown>;

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
 * Map raw Jev answers to a display verdict. `safe_to_auto_accept` noul is
 * authoritative; choice/score echoes are informational.
 */
export function verdictFromAnswers(answers: JevAnswers): {
	verdict: SubsystemModelSecondOpinion["verdict"];
	confidence: number;
	changeKind?: string;
	risk?: string;
} {
	const safeRaw = asRecord(answers["safe_to_auto_accept"]);
	const kindRaw = asRecord(answers["change_kind"]);
	const riskRaw = asRecord(answers["risk"]);

	const noul = safeRaw ? num(safeRaw["noul"]) : null;
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
			? "needs-human"
			: noul >= 0.85
				? "safe"
				: noul >= 0.5
					? "needs-human"
					: "unsafe";

	return {
		verdict,
		confidence,
		changeKind: changeKind ?? undefined,
		risk,
	};
}

export async function evaluateProposalSecondOpinion(
	proposal: SubsystemModelProposal,
	opts?: { model?: string; endpoint?: string; apiKey?: string },
): Promise<SubsystemModelSecondOpinion> {
	const source = (opts?.model ?? JEV_MODEL) as SubsystemModelSecondOpinion["source"];
	const apiKey = opts?.apiKey ?? (await zenApiKey());
	if (!apiKey) {
		return {
			source,
			checkedAt: new Date().toISOString(),
			verdict: "needs-human",
			confidence: 0,
			error: ZEN_KEY_HELP,
		};
	}
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
			body: JSON.stringify({
				model: source,
				state: buildProposalState(proposal),
				questions: {
					safe_to_auto_accept: {
						type: "noul",
						instructions:
							"This subsystem-model correction is supported by its rationale, finding, and before/after preview, and is safe to auto-accept without human review.",
					},
					change_kind: {
						type: "choice",
						instructions: "What kind of correction is this?",
						criteria: {
							construct_augment: "Confirming a component construct classification",
							signature_augment: "Confirming parameter or return types",
							relation_augment: "Confirming a topology relation claim",
							module_augment: "Confirming an intentional module grouping",
							field_fix: "Fixing a component field value",
							relation_fix: "Retargeting, retyping, or deleting a relation",
						},
					},
					risk: {
						type: "score",
						instructions: "Risk of auto-accepting this correction",
						criteria: ["Safe", "Needs human", "Unsafe"],
					},
				},
			}),
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
				verdict: "needs-human",
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
				verdict: "needs-human",
				confidence: 0,
				error: "Jev response had no answers",
			};
		}
		const mapped = verdictFromAnswers(answers);
		return {
			source,
			checkedAt: new Date().toISOString(),
			...mapped,
		};
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return {
			source,
			checkedAt: new Date().toISOString(),
			verdict: "needs-human",
			confidence: 0,
			error: msg.includes("abort") ? "Jev request timed out" : msg,
		};
	} finally {
		clearTimeout(timer);
	}
}

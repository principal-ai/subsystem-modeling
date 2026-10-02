/**
 * Persist dry-run subsystem model audit reports so list badges and the
 * results modal survive relaunches without re-running the full audit.
 *
 * Layout: `~/.principal/subsystem-model-audits/<graphId>.json`
 *
 * Invalidation: each saved report carries a fingerprint of the model claim
 * surface + current HEAD(+dirty) graphify slot identity. When the live
 * fingerprint differs, the report is treated as stale (still readable,
 * needs re-audit).
 */

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
	SubsystemGraphifyReadiness,
	SubsystemModelAuditBoundaryCheck,
	SubsystemModelAuditCheck,
	SubsystemModelAuditReport,
	SubsystemModelVerification,
	SubsystemModelVerificationLayer,
	SubsystemVerificationLane,
	VerificationLaneStatus,
} from "../shared/contract";
import { resolveCurrentGraphifySlot } from "./graphify-store";
import { purlRepoKey } from "./subsystem-model-store";

const ROOT = join(homedir(), ".principal", "subsystem-model-audits");

export interface PersistedSubsystemModelAudit {
	version: 1;
	graphId: string;
	/** Inputs that produced this report — compared on load. */
	fingerprint: string;
	savedAt: string;
	report: SubsystemModelAuditReport;
}

export interface AuditFingerprintSource {
	updatedAt: string;
	components: Array<{
		alias: string;
		file?: string;
		symbol?: string;
		construct?: string;
		purl?: string;
	}>;
	graphify?: SubsystemGraphifyReadiness;
	/** Override graphify store root (tests). */
	storeRoot?: string;
}

/** Slim row for Subsystems list badges. */
export type SubsystemModelAuditVerdict =
	| "fully_verified"
	| "partially_verified"
	| "issues";

export interface SubsystemModelAuditListSummary {
	checkedAt: string;
	needsUpdate: boolean;
	issueCount: number;
	verdict: SubsystemModelAuditVerdict;
	/** Claim-based progress ledger — see SubsystemModelVerification. */
	verification: SubsystemModelVerification;
	/** Coarse per-lane status for lane badges. */
	lanes: Record<SubsystemVerificationLane, VerificationLaneStatus>;
	/** True when live inputs no longer match the saved fingerprint. */
	stale: boolean;
	fingerprint: string;
}

export function auditIssueCount(report: SubsystemModelAuditReport): number {
	const fromFindings = report.findings.filter(
		(f) => f.severity === "error",
	).length;
	if (fromFindings > 0) return fromFindings;
	return report.checks.filter((c) => c.verdict === "issue").length;
}

export function auditHasIssues(report: SubsystemModelAuditReport): boolean {
	if (report.needsUpdate) return true;
	if (report.checks.some((c) => c.verdict === "issue")) return true;
	return report.findings.some((f) => f.severity === "error");
}

/** Gaps that are not failures — some checks confirmed, some still need follow-up. */
export function auditHasPartialGaps(report: SubsystemModelAuditReport): boolean {
	// Any info-severity finding is a gap: unconfirmed claim, or unavailable input
	// (repo/cache). Errors are handled earlier by auditHasIssues.
	if (report.findings.some((f) => f.severity === "info")) return true;
	// Check-level gaps that may not have emitted a finding on their own.
	for (const c of report.checks) {
		if (c.verdict === "issue") continue;
		if (c.constructInferred === "unknown" && c.constructMatch !== true) return true;
		if (c.signature === "skipped") return true;
	}
	if (report.boundaryChecks?.some((c) => c.verdict === "gap")) return true;
	return false;
}

export function classifyAuditReport(
	report: SubsystemModelAuditReport,
): SubsystemModelAuditVerdict {
	if (auditHasIssues(report)) return "issues";
	if (auditHasPartialGaps(report)) return "partially_verified";
	return "fully_verified";
}

interface VerificationTally {
	verified: number;
	open: number;
	blocked: number;
	na: number;
	blocking: number;
}

function emptyTally(): VerificationTally {
	return { verified: 0, open: 0, blocked: 0, na: 0, blocking: 0 };
}

function finalizeLayer(tally: VerificationTally): SubsystemModelVerificationLayer {
	const adjudicable = tally.verified + tally.open;
	const coverage =
		adjudicable > 0
			? tally.verified / adjudicable
			: tally.blocked > 0
				? 0
				: 1;
	return {
		verified: tally.verified,
		open: tally.open,
		blocked: tally.blocked,
		na: tally.na,
		coverage,
		blocking: tally.blocking,
	};
}

function mergeTallies(...tallies: VerificationTally[]): VerificationTally {
	const merged = emptyTally();
	for (const t of tallies) {
		merged.verified += t.verified;
		merged.open += t.open;
		merged.blocked += t.blocked;
		merged.na += t.na;
		merged.blocking += t.blocking;
	}
	return merged;
}

/**
 * Bucket one construct-layer component check.
 *
 * `graphify: "skipped"` marks external / custom-entity / proposed components —
 * no source claim to verify, so n/a. A missing repo root or an unbuilt cache is
 * `blocked` (environment fix, not a proposal). Everything that is neither
 * confirmed nor environment-blocked is `open`, i.e. the agent's work queue.
 */
function classifyConstructCheck(
	c: SubsystemModelAuditCheck,
	tally: VerificationTally,
): void {
	if (c.graphify === "skipped") {
		tally.na++;
		return;
	}
	if (c.verdict === "issue" || c.fileExists === false) {
		tally.open++;
		tally.blocking++;
		return;
	}
	if (c.fileExists === null) {
		tally.blocked++;
		return;
	}
	if (c.graphify === "unavailable") {
		tally.blocked++;
		return;
	}
	if (
		c.verdict === "ok" &&
		c.graphify === "confirmed" &&
		// Exact anchor is not enough: an unclassified construct (`null`) is a
		// gap (`construct_unconfirmed`), not a confirmed claim.
		c.constructMatch === true &&
		c.signature !== "mismatch" &&
		c.signature !== "skipped" &&
		c.declarationFreshness !== "stale" &&
		c.declarationFreshness !== "missing"
	) {
		tally.verified++;
		return;
	}
	tally.open++;
}

function classifyBoundaryCheck(
	c: SubsystemModelAuditBoundaryCheck,
	tally: VerificationTally,
): void {
	if (c.kind === "skipped" || c.verdict === "skipped") {
		tally.na++;
		return;
	}
	if (c.verdict === "issue") {
		tally.open++;
		tally.blocking++;
		return;
	}
	if (c.verdict === "ok") {
		tally.verified++;
		return;
	}
	tally.open++;
}

/**
 * Derive the claim-based verification ledger from an audit report. Pure — the
 * same report always yields the same ledger, so it can be recomputed on load
 * instead of persisted.
 */
export function summarizeVerification(
	report: SubsystemModelAuditReport,
): SubsystemModelVerification {
	const construct = emptyTally();
	const boundary = emptyTally();
	const topology = emptyTally();

	for (const c of report.checks) classifyConstructCheck(c, construct);
	for (const c of report.boundaryChecks ?? [])
		classifyBoundaryCheck(c, boundary);

	const total = finalizeLayer(mergeTallies(construct, boundary, topology));
	return {
		...total,
		byLayer: {
			construct: finalizeLayer(construct),
			boundary: finalizeLayer(boundary),
			topology: finalizeLayer(topology),
		},
	};
}

function laneStatus(t: VerificationTally): VerificationLaneStatus {
	if (t.blocking > 0) return "issues";
	if (t.open > 0) return "partial";
	if (t.verified > 0) return "verified";
	if (t.blocked > 0) return "blocked";
	return "none";
}

/**
 * Coarse per-lane status mapped onto the four model layers: construct (L1),
 * static topology (L2 = package/module containment), dynamic topology
 * (L3 = process runtime), trail (L4).
 *
 * Dynamic topology tallies both `process_nest` (members of a multi-member
 * module agree) and `process_claim` (a runtime-executing component states a
 * deployment unit). The second is what lets the lane go green without a
 * `module` claim, and what keeps "process stated, nothing wrong" distinct from
 * "no process information at all" — the latter tallies zero and stays grey.
 */
export function summarizeLanes(
	report: SubsystemModelAuditReport,
	opts: { hasTrails: boolean },
): Record<SubsystemVerificationLane, VerificationLaneStatus> {
	const construct = emptyTally();
	for (const c of report.checks) classifyConstructCheck(c, construct);

	const staticTopology = emptyTally();
	const dynamicTopology = emptyTally();
	for (const c of report.boundaryChecks ?? []) {
		if (c.kind === "module_file") classifyBoundaryCheck(c, staticTopology);
		if (c.kind === "process_nest" || c.kind === "process_claim") {
			classifyBoundaryCheck(c, dynamicTopology);
		}
	}

	const trail: VerificationLaneStatus = !opts.hasTrails
		? "none"
		: report.summary.trailFailures > 0
			? "issues"
			: "verified";

	// Every component carries a construct claim, so a model with components can
	// never be "none" on the construct lane — an unchecked claim is open work.
	const constructStatus: VerificationLaneStatus =
		report.summary.components > 0 && laneStatus(construct) === "none"
			? "partial"
			: laneStatus(construct);

	return {
		construct: constructStatus,
		"static-topology": laneStatus(staticTopology),
		"dynamic-topology": laneStatus(dynamicTopology),
		trail,
	};
}

function auditPath(graphId: string): string {
	return join(ROOT, `${graphId}.json`);
}

async function ensureDir(): Promise<void> {
	await fs.mkdir(ROOT, { recursive: true });
}

/**
 * Stable fingerprint of model claims + current checkout graphify slot.
 * Changes when the model is edited, HEAD/dirty moves, or the exact slot rebuilds.
 */
export async function buildAuditFingerprint(
	source: AuditFingerprintSource,
): Promise<string> {
	const claims = [...source.components]
		.map((c) =>
			[
				c.alias,
				c.file ?? "",
				c.symbol ?? "",
				c.construct ?? "",
				purlRepoKey(c.purl) ?? "",
			].join("\t"),
		)
		.sort()
		.join("\n");

	const graphifyParts = (
		await Promise.all(
			(source.graphify?.purls ?? []).map(async (p) => {
				const current = await resolveCurrentGraphifySlot(p.purl, {
					repoRoot: p.repoRoot,
					storeRoot: source.storeRoot,
				});
				if (!current) {
					return `${p.purl}:${p.status}:`;
				}
				const builtAt = current.cached?.meta.builtAt ?? "";
				return `${p.purl}:${p.status}:${current.slotKey}:${builtAt}`;
			}),
		)
	)
		.sort()
		.join("|");

	return [
		`updatedAt=${source.updatedAt}`,
		`components=${source.components.length}`,
		`claims=${claims}`,
		`graphify=${graphifyParts}`,
	].join("\n");
}

export async function saveSubsystemModelAudit(
	graphId: string,
	report: SubsystemModelAuditReport,
	fingerprint: string,
): Promise<PersistedSubsystemModelAudit> {
	await ensureDir();
	const record: PersistedSubsystemModelAudit = {
		version: 1,
		graphId,
		fingerprint,
		savedAt: new Date().toISOString(),
		report,
	};
	await fs.writeFile(auditPath(graphId), `${JSON.stringify(record, null, 2)}\n`, "utf8");
	return record;
}

export async function loadSubsystemModelAudit(
	graphId: string,
): Promise<PersistedSubsystemModelAudit | null> {
	try {
		const raw = await fs.readFile(auditPath(graphId), "utf8");
		const parsed = JSON.parse(raw) as PersistedSubsystemModelAudit;
		if (!parsed || parsed.version !== 1 || !parsed.report) return null;
		return parsed;
	} catch {
		return null;
	}
}

export async function deleteSubsystemModelAudit(graphId: string): Promise<void> {
	try {
		await fs.unlink(auditPath(graphId));
	} catch {
		/* missing is fine */
	}
}

export async function getSubsystemModelAuditListSummary(
	graphId: string,
	liveFingerprint: string,
	opts?: { hasTrails?: boolean },
): Promise<SubsystemModelAuditListSummary | null> {
	const saved = await loadSubsystemModelAudit(graphId);
	if (!saved) return null;
	return {
		checkedAt: saved.report.checkedAt,
		needsUpdate: saved.report.needsUpdate,
		issueCount: auditIssueCount(saved.report),
		verdict: classifyAuditReport(saved.report),
		verification: summarizeVerification(saved.report),
		lanes: summarizeLanes(saved.report, {
			hasTrails: opts?.hasTrails === true,
		}),
		stale: saved.fingerprint !== liveFingerprint,
		fingerprint: saved.fingerprint,
	};
}

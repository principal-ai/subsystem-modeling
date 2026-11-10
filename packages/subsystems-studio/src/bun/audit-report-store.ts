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
	SubsystemModelAuditFixGroup,
	SubsystemModelAuditReport,
	SubsystemModelVerification,
	SubsystemVerificationLane,
	VerificationLaneStatus,
} from "../shared/contract";
import { resolveCurrentGraphifySlot } from "./graphify-store";
import {
	auditFixGroups,
	auditIssueCount,
	auditHasIssues,
	auditHasPartialGaps,
	classifyAuditReport,
	isVerifiedConstructCheck,
	summarizeLanes,
	summarizeVerification,
	type SubsystemModelAuditVerdict,
} from "../../../subsystems-core/src/audit/report-logic";
export {
	auditFixGroups,
	auditIssueCount,
	auditHasIssues,
	auditHasPartialGaps,
	classifyAuditReport,
	isVerifiedConstructCheck,
	summarizeLanes,
	summarizeVerification,
};
export type { SubsystemModelAuditVerdict };
import { purlRepoKey } from "./subsystem-model-store";

function auditRoot(): string {
	return join(
		process.env["PRINCIPAL_SUBSYSTEM_MODELS_HOME"]?.trim() || homedir(),
		".principal", "subsystem-model-audits",
	);
}

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
export interface SubsystemModelAuditListSummary {
	checkedAt: string;
	needsUpdate: boolean;
	issueCount: number;
	verdict: SubsystemModelAuditVerdict;
	/** Claim-based progress ledger — see SubsystemModelVerification. */
	verification: SubsystemModelVerification;
	/** Coarse per-lane status for lane badges. */
	lanes: Record<SubsystemVerificationLane, VerificationLaneStatus>;
	/**
	 * One-click deterministic fixes this report offers, grouped by kind. Empty
	 * when every finding needs an agent. Drives the Maintain model card's
	 * fixable badge, so the offer is visible without opening the model.
	 */
	fixGroups: SubsystemModelAuditFixGroup[];
	/** True when live inputs no longer match the saved fingerprint. */
	stale: boolean;
	fingerprint: string;
}

function auditPath(graphId: string): string {
	return join(auditRoot(), `${graphId}.json`);
}

async function ensureDir(): Promise<void> {
	await fs.mkdir(auditRoot(), { recursive: true });
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
		fixGroups: auditFixGroups(saved.report),
		stale: saved.fingerprint !== liveFingerprint,
		fingerprint: saved.fingerprint,
	};
}

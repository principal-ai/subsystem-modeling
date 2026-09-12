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
	SubsystemModelAuditReport,
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
		id: string;
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
	/** True when live inputs no longer match the saved fingerprint. */
	stale: boolean;
	fingerprint: string;
}

export function auditIssueCount(report: SubsystemModelAuditReport): number {
	const fromFindings = report.findings.filter(
		(f) => f.severity === "error" || f.severity === "warn",
	).length;
	if (fromFindings > 0) return fromFindings;
	return report.checks.filter((c) => c.verdict === "issue").length;
}

export function auditHasIssues(report: SubsystemModelAuditReport): boolean {
	if (report.needsUpdate) return true;
	if (report.checks.some((c) => c.verdict === "issue")) return true;
	return report.findings.some((f) => f.severity === "error" || f.severity === "warn");
}

/** Gaps that are not failures — some checks confirmed, some still need follow-up. */
export function auditHasPartialGaps(report: SubsystemModelAuditReport): boolean {
	if (report.findings.some((f) => f.kind === "construct_unconfirmed")) return true;
	if (report.findings.some((f) => f.kind === "signature_unconfirmed")) return true;
	for (const c of report.checks) {
		if (c.constructInferred === "unknown" && c.constructMatch !== true) return true;
		if (c.signature === "skipped") return true;
	}
	return false;
}

export function classifyAuditReport(
	report: SubsystemModelAuditReport,
): SubsystemModelAuditVerdict {
	if (auditHasIssues(report)) return "issues";
	if (auditHasPartialGaps(report)) return "partially_verified";
	return "fully_verified";
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
export function buildAuditFingerprint(source: AuditFingerprintSource): string {
	const claims = [...source.components]
		.map((c) =>
			[
				c.id,
				c.file ?? "",
				c.symbol ?? "",
				c.construct ?? "",
				purlRepoKey(c.purl) ?? "",
			].join("\t"),
		)
		.sort()
		.join("\n");

	const graphifyParts = (source.graphify?.purls ?? [])
		.map((p) => {
			const current = resolveCurrentGraphifySlot(p.purl, {
				repoRoot: p.repoRoot,
				storeRoot: source.storeRoot,
			});
			if (!current) {
				return `${p.purl}:${p.status}:`;
			}
			const builtAt = current.cached?.meta.builtAt ?? "";
			return `${p.purl}:${p.status}:${current.slotKey}:${builtAt}`;
		})
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
): Promise<SubsystemModelAuditListSummary | null> {
	const saved = await loadSubsystemModelAudit(graphId);
	if (!saved) return null;
	return {
		checkedAt: saved.report.checkedAt,
		needsUpdate: saved.report.needsUpdate,
		issueCount: auditIssueCount(saved.report),
		verdict: classifyAuditReport(saved.report),
		stale: saved.fingerprint !== liveFingerprint,
		fingerprint: saved.fingerprint,
	};
}

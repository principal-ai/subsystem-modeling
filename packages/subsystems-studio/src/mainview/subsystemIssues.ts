/**
 * Map a persisted audit report into the presentational `SubsystemIssue[]` the
 * diagnostics list renders. Targets are resolved against the model so cards
 * read `cartStore` / `checkoutApi → cartStore` instead of raw ids.
 */

import type {
	SubsystemDiagnosticStatus,
	SubsystemIssue,
	SubsystemIssueTarget,
} from "@principal-ai/subsystems-react";
import type {
	StoredSubsystemModel,
	SubsystemModelAuditReport,
	SubsystemModelAuditFinding,
} from "../shared/contract";

function shortPurl(purl: string): string {
	const m = purl.match(/pkg:github\/([^/#]+\/[^/#]+)/i);
	return m ? m[1] : purl.replace(/^pkg:[^/]+\//, "");
}

/** Verdict → chip status. Mirrors `classifyAuditReport` on the host. */
export function diagnosticStatus(
	report: SubsystemModelAuditReport | null,
): SubsystemDiagnosticStatus {
	if (!report) return "unknown";
	const hasIssue =
		report.needsUpdate ||
		report.checks.some((c) => c.verdict === "issue") ||
		report.findings.some((f) => f.severity === "error");
	if (hasIssue) return "issues";
	const hasGap =
		report.findings.some((f) => f.severity === "info") ||
		report.boundaryChecks?.some((c) => c.verdict === "gap") ||
		report.checks.some(
			(c) =>
				c.verdict !== "issue" &&
				((c.constructInferred === "unknown" && c.constructMatch !== true) ||
					c.signature === "skipped"),
		);
	return hasGap ? "gaps" : "ok";
}

/** Error-finding count shown on the chip (falls back to failing checks). */
export function diagnosticIssueCount(
	report: SubsystemModelAuditReport | null,
): number {
	if (!report) return 0;
	const fromFindings = report.findings.filter(
		(f) => f.severity === "error",
	).length;
	return fromFindings > 0
		? fromFindings
		: report.checks.filter((c) => c.verdict === "issue").length;
}

function componentLabel(
	graph: StoredSubsystemModel,
	alias: string,
	fallback?: string,
): string {
	return graph.components.find((c) => c.alias === alias)?.name ?? fallback ?? alias;
}

function targetFor(
	graph: StoredSubsystemModel,
	finding: SubsystemModelAuditFinding,
): SubsystemIssueTarget | undefined {
	if (finding.componentAlias) {
		return {
			kind: "component",
			id: finding.componentAlias,
			label: componentLabel(graph, finding.componentAlias, finding.componentName),
		};
	}
	if (finding.moduleKey) {
		return { kind: "module", id: finding.moduleKey, label: finding.moduleKey };
	}
	if (finding.walkthroughId) {
		const wt = graph.walkthroughs?.find((w) => w.id === finding.walkthroughId);
		return {
			kind: "walkthrough",
			id: finding.walkthroughId,
			label: wt?.title ?? finding.walkthroughId,
			detail: finding.step != null ? `step ${finding.step}` : undefined,
		};
	}
	if (finding.purl) {
		return { kind: "repo", id: finding.purl, label: shortPurl(finding.purl) };
	}
	return undefined;
}

export interface MappedIssues {
	issues: SubsystemIssue[];
	/** Original finding per issue id — needed to apply a deterministic fix. */
	byId: Map<string, SubsystemModelAuditFinding>;
}

export function auditReportToIssues(
	report: SubsystemModelAuditReport | null,
	graph: StoredSubsystemModel,
): MappedIssues {
	const issues: SubsystemIssue[] = [];
	const byId = new Map<string, SubsystemModelAuditFinding>();
	if (!report) return { issues, byId };
	report.findings.forEach((finding, i) => {
		const id = `${finding.kind}:${finding.componentAlias ?? finding.moduleKey ?? finding.walkthroughId ?? finding.purl ?? "graph"}:${i}`;
		byId.set(id, finding);
		issues.push({
			id,
			severity: finding.severity,
			kind: finding.kind,
			message: finding.message,
			target: targetFor(graph, finding),
			fix: finding.fix ? { label: finding.fix.label } : undefined,
		});
	});
	return { issues, byId };
}

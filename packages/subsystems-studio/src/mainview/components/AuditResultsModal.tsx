/**
 * Audit modal — dry-run deterministic audit for an open subsystem model.
 * Shows graphify precursor progress, then audit progress, then findings.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import type { SubsystemModelAuditReport } from "../../shared/contract";
import { electrobun } from "../rpc";

export type AuditGraphifyPurlProgress = {
	purl: string;
	status: "pending" | "building" | "ready" | "error";
	detail?: string;
};

export type AuditModalState =
	| {
			phase: "graphify";
			title: string;
			purls: AuditGraphifyPurlProgress[];
	  }
	| { phase: "auditing"; title: string }
	| { phase: "done"; report: SubsystemModelAuditReport }
	| { phase: "error"; title?: string; error: string };

function formatCheckedAt(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return date.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

function severityColor(
	severity: "error" | "warn" | "info",
	colors: {
		error?: string;
		warning?: string;
		textMuted?: string;
		textSecondary?: string;
	},
): string {
	if (severity === "error") return colors.error ?? "#e5534b";
	if (severity === "warn") return colors.warning ?? "#d4a017";
	return colors.textMuted ?? colors.textSecondary ?? "#888";
}

function shortPurl(purl: string): string {
	const m = purl.match(/pkg:github\/([^/#]+\/[^/#]+)/i);
	return m ? m[1] : purl.replace(/^pkg:[^/]+\//, "");
}

type AuditTone = "good" | "issue" | "neutral";

function toneColors(
	tone: AuditTone,
	colors: {
		error?: string;
		warning?: string;
		success?: string;
		border?: string;
		text?: string;
		textMuted?: string;
		textSecondary?: string;
		background?: string;
	},
): { border: string; text: string; background: string } {
	if (tone === "issue") {
		const text = colors.error ?? "#e5534b";
		return {
			border: text,
			text,
			background: "rgba(229, 83, 75, 0.10)",
		};
	}
	if (tone === "good") {
		const text = colors.success ?? "#2da44e";
		return {
			border: text,
			text,
			background: "rgba(45, 164, 78, 0.10)",
		};
	}
	return {
		border: colors.border ?? "#444",
		text: colors.textMuted ?? colors.textSecondary ?? colors.text ?? "#888",
		background: colors.background ?? "transparent",
	};
}

type AuditTheme = {
	colors: {
		error?: string;
		warning?: string;
		success?: string;
		border?: string;
		text?: string;
		textMuted?: string;
		textSecondary?: string;
		background?: string;
		surface?: string;
		primary?: string;
	};
	fonts: { monospace: string; body: string };
	fontSizes: Record<number, number>;
};

function statusPill(
	label: string,
	tone: AuditTone,
	theme: AuditTheme,
	opts?: { active?: boolean; interactive?: boolean },
) {
	const colors = toneColors(tone, theme.colors);
	const active = opts?.active === true;
	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				padding: "1px 7px",
				borderRadius: 999,
				border: `1px solid ${active ? colors.text : colors.border}`,
				background: active ? colors.background : colors.background,
				color: colors.text,
				fontFamily: theme.fonts.monospace,
				fontSize: theme.fontSizes[0] * 0.92,
				lineHeight: 1.5,
				boxShadow: active ? `0 0 0 1px ${colors.text}` : undefined,
				cursor: opts?.interactive ? "pointer" : undefined,
				opacity: opts?.interactive && opts.active === false ? 0.72 : 1,
			}}
		>
			{label}
		</span>
	);
}

type CheckKind =
	| "file_on_disk"
	| "file_missing"
	| "no_source_check"
	| "exact_node"
	| "construct_match"
	| "construct_mismatch"
	| "construct_unconfirmed"
	| "signature_match"
	| "signature_mismatch"
	| "signature_skipped"
	| "declaration_fresh"
	| "declaration_stale"
	| "no_symbol_node"
	| "cache_unavailable"
	| "graphify_skipped";

type CheckPart = { kind: CheckKind; label: string; tone: AuditTone };

const CHECK_KIND_META: Record<
	CheckKind,
	{ section: "Source" | "Graphify"; example: string; meaning: string }
> = {
	file_on_disk: {
		section: "Source",
		example: "file on disk",
		meaning: "Claimed file path exists under the component's repo root.",
	},
	file_missing: {
		section: "Source",
		example: "file missing",
		meaning: "Claimed file path was not found on disk.",
	},
	no_source_check: {
		section: "Source",
		example: "no source check",
		meaning: "External / custom entity — no on-disk source check.",
	},
	exact_node: {
		section: "Graphify",
		example: "exact node match",
		meaning: "Found the symbol's definition node in the graphify cache.",
	},
	construct_match: {
		section: "Graphify",
		example: "construct … matches",
		meaning:
			"Claimed construct agrees with graphify, or an accepted augmentation confirmed it when graphify left it unknown.",
	},
	construct_mismatch: {
		section: "Graphify",
		example: "construct claimed ≠ inferred",
		meaning:
			"Graph structure implies a different construct than claimed. Inferred is a weak hint — issue-fixer judges from source, never one-click adopt.",
	},
	construct_unconfirmed: {
		section: "Graphify",
		example: "construct … unclassified",
		meaning:
			"Exact node found, but graphify did not classify construct — gap-filler may propose an augmentation.",
	},
	signature_match: {
		section: "Graphify",
		example: "signature matches",
		meaning: "Claimed params/return types match graphify type edges.",
	},
	signature_mismatch: {
		section: "Graphify",
		example: "signature mismatch",
		meaning:
			"Claimed params/return types differ from graphify. Same judgment as construct mismatch when the model already has types — trust source, do not auto-adopt.",
	},
	signature_skipped: {
		section: "Graphify",
		example: "signature not in cache",
		meaning:
			"No usable signature edges in Graphify — gap-filler may propose a signature augmentation from source.",
	},
	declaration_fresh: {
		section: "Graphify",
		example: "declaration line matches",
		meaning: "Stored declaration line hash still matches the live file.",
	},
	declaration_stale: {
		section: "Graphify",
		example: "declaration line drifted",
		meaning: "Declaration line moved or changed since last capture.",
	},
	no_symbol_node: {
		section: "Graphify",
		example: "no symbol node match…",
		meaning: "Cache is ready, but no exact symbol definition node was found.",
	},
	cache_unavailable: {
		section: "Graphify",
		example: "cache unavailable…",
		meaning: "No usable graphify cache; symbol / construct / signature checks are skipped.",
	},
	graphify_skipped: {
		section: "Graphify",
		example: "skipped …",
		meaning: "Graphify anchoring not applicable (external, no symbol, etc.).",
	},
};

function buildCheckParts(c: SubsystemModelAuditReport["checks"][number]): {
	source: CheckPart[];
	graphify: CheckPart[];
} {
	const source: CheckPart[] = [];
	if (c.fileExists === true)
		source.push({ kind: "file_on_disk", label: "file on disk", tone: "good" });
	else if (c.fileExists === false)
		source.push({ kind: "file_missing", label: "file missing", tone: "issue" });
	else if (c.verdict === "skipped" && c.graphify === "skipped")
		source.push({
			kind: "no_source_check",
			label: "no source check",
			tone: "neutral",
		});
	// Symbol presence is graphify exact-node only — do not mirror it under source.

	const graphify: CheckPart[] = [];
	if (c.graphify === "confirmed") {
		graphify.push({
			kind: "exact_node",
			label: "exact node match",
			tone: "good",
		});
		if (c.constructMatch === true)
			graphify.push({
				kind: "construct_match",
				label: c.constructEvidence?.some((e) =>
					e.startsWith("augmented construct"),
				)
					? c.construct
						? `construct ${c.construct} confirmed (augmented)`
						: "construct confirmed (augmented)"
					: c.construct
						? `construct ${c.construct} matches`
						: "construct matches",
				tone: "good",
			});
		else if (c.constructInferred === "unknown")
			graphify.push({
				kind: "construct_unconfirmed",
				label: c.constructClaimed
					? `construct ${c.constructClaimed} unclassified`
					: "construct unclassified",
				tone: "neutral",
			});
		else if (c.constructMatch === false)
			graphify.push({
				kind: "construct_mismatch",
				label:
					c.constructClaimed || c.constructInferred
						? `construct ${c.constructClaimed ?? "?"} ≠ ${c.constructInferred ?? "?"}`
						: "construct mismatch",
				tone: "issue",
			});
		if (c.signature === "match")
			graphify.push({
				kind: "signature_match",
				label: "signature matches",
				tone: "good",
			});
		else if (c.signature === "mismatch")
			graphify.push({
				kind: "signature_mismatch",
				label: "signature mismatch",
				tone: "issue",
			});
		else if (c.signature === "skipped")
			graphify.push({
				kind: "signature_skipped",
				label: "signature not in cache",
				tone: "neutral",
			});
		if (c.declarationFreshness === "valid")
			graphify.push({
				kind: "declaration_fresh",
				label: "declaration line matches",
				tone: "good",
			});
		else if (c.declarationFreshness === "stale")
			graphify.push({
				kind: "declaration_stale",
				label: "declaration line drifted",
				tone: "issue",
			});
	} else if (c.graphify === "weak") {
		graphify.push({
			kind: "no_symbol_node",
			label:
				c.anchor && c.anchor !== "n/a"
					? `no symbol node match - anchor ${c.anchor} only`
					: "no symbol node match - cache hit only",
			tone: "issue",
		});
	} else if (c.graphify === "unavailable") {
		graphify.push({
			kind: "cache_unavailable",
			label: c.note?.startsWith("Graphify")
				? c.note
				: c.note?.startsWith("graphify")
					? c.note
					: "cache unavailable - source-only",
			tone: "neutral",
		});
	} else if (c.graphify === "skipped") {
		graphify.push({
			kind: "graphify_skipped",
			label: c.note?.startsWith("graphify") ? c.note : "skipped (external)",
			tone: "neutral",
		});
	}

	return { source, graphify };
}

function findingKindToCheckKind(
	kind: SubsystemModelAuditReport["findings"][number]["kind"],
): CheckKind | null {
	switch (kind) {
		case "missing_file":
			return "file_missing";
		case "missing_symbol":
			return "no_symbol_node";
		case "stale_declaration":
			return "declaration_stale";
		case "construct_mismatch":
			return "construct_mismatch";
		case "construct_unconfirmed":
			return "construct_unconfirmed";
		case "signature_mismatch":
			return "signature_mismatch";
		case "signature_unconfirmed":
			return "signature_skipped";
		case "anchor":
			return "no_symbol_node";
		case "unresolved":
			return "cache_unavailable";
		default:
			return null;
	}
}

function collectPresentKinds(
	report: SubsystemModelAuditReport,
): Map<CheckKind, { count: number; tone: AuditTone }> {
	const present = new Map<CheckKind, { count: number; tone: AuditTone }>();
	for (const c of report.checks) {
		const built = buildCheckParts(c);
		const parts = [...built.source, ...built.graphify];
		const seen = new Set<CheckKind>();
		for (const part of parts) {
			if (seen.has(part.kind)) continue;
			seen.add(part.kind);
			const prev = present.get(part.kind);
			present.set(part.kind, {
				count: (prev?.count ?? 0) + 1,
				tone: part.tone,
			});
		}
	}
	return present;
}

function AuditLegend({
	theme,
	present,
	activeKind,
	onSelectKind,
}: {
	theme: AuditTheme;
	present: Map<CheckKind, { count: number; tone: AuditTone }>;
	activeKind: CheckKind | null;
	onSelectKind: (kind: CheckKind | null) => void;
}) {
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const sections: Array<"Source" | "Graphify"> = ["Source", "Graphify"];
	const kindsInOrder = (Object.keys(CHECK_KIND_META) as CheckKind[]).filter((k) =>
		present.has(k),
	);

	return (
		<aside
			onClick={(e) => e.stopPropagation()}
			aria-label="Audit check legend"
			style={{
				width: "min(280px, calc(100vw - 48px))",
				maxHeight: "min(75vh, 680px)",
				display: "flex",
				flexDirection: "column",
				background: theme.colors.surface,
				border: `1px solid ${theme.colors.border}`,
				borderRadius: 12,
				overflow: "hidden",
				boxShadow: "0 12px 48px rgba(0,0,0,0.4)",
				color: theme.colors.text,
				flexShrink: 0,
			}}
		>
			<div
				style={{
					padding: "14px 16px",
					borderBottom: `1px solid ${theme.colors.border}`,
					background: theme.colors.background,
				}}
			>
				<div style={{ fontSize: theme.fontSizes[2], fontWeight: 600 }}>Legend</div>
				<div style={{ fontSize: theme.fontSizes[0], color: muted, marginTop: 2 }}>
					Click a check to filter results
				</div>
				{activeKind && (
					<button
						type="button"
						onClick={() => onSelectKind(null)}
						style={{
							marginTop: 8,
							padding: "2px 8px",
							borderRadius: 4,
							border: `1px solid ${theme.colors.border}`,
							background: "transparent",
							color: muted,
							fontSize: theme.fontSizes[0],
							fontFamily: theme.fonts.body,
							cursor: "pointer",
						}}
					>
						Clear filter
					</button>
				)}
			</div>
			<div
				style={{
					flex: 1,
					minHeight: 0,
					overflowY: "auto",
					padding: "12px 14px",
					display: "flex",
					flexDirection: "column",
					gap: 16,
				}}
			>
				{kindsInOrder.length === 0 ? (
					<div style={{ fontSize: theme.fontSizes[0], color: muted }}>
						No check pills in this audit.
					</div>
				) : (
					sections.map((section) => {
						const items = kindsInOrder.filter(
							(k) => CHECK_KIND_META[k].section === section,
						);
						if (items.length === 0) return null;
						return (
							<div key={section}>
								<div
									style={{
										fontSize: theme.fontSizes[0] * 0.85,
										fontFamily: theme.fonts.monospace,
										textTransform: "uppercase",
										letterSpacing: "0.04em",
										color: muted,
										fontWeight: 600,
										marginBottom: 8,
									}}
								>
									{section}
								</div>
								<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
									{items.map((kind) => {
										const meta = CHECK_KIND_META[kind];
										const info = present.get(kind)!;
										const selected = activeKind === kind;
										return (
											<button
												key={kind}
												type="button"
												onClick={() =>
													onSelectKind(selected ? null : kind)
												}
												aria-pressed={selected}
												title={
													selected
														? "Clear filter"
														: `Filter to ${info.count} component${info.count === 1 ? "" : "s"} with this check`
												}
												style={{
													display: "block",
													width: "100%",
													textAlign: "left",
													padding: "8px 10px",
													borderRadius: 8,
													border: `1px solid ${
														selected
															? toneColors(info.tone, theme.colors).text
															: theme.colors.border
													}`,
													background: selected
														? toneColors(info.tone, theme.colors).background
														: theme.colors.background,
													color: theme.colors.text,
													cursor: "pointer",
													fontFamily: theme.fonts.body,
												}}
											>
												<div
													style={{
														display: "flex",
														alignItems: "center",
														justifyContent: "space-between",
														gap: 8,
														marginBottom: 4,
													}}
												>
													{statusPill(meta.example, info.tone, theme, {
														active: selected,
														interactive: true,
													})}
													<span
														style={{
															fontSize: theme.fontSizes[0],
															fontFamily: theme.fonts.monospace,
															color: muted,
															flexShrink: 0,
														}}
													>
														×{info.count}
													</span>
												</div>
												<div
													style={{
														fontSize: theme.fontSizes[0],
														color: muted,
														lineHeight: 1.4,
													}}
												>
													{meta.meaning}
												</div>
											</button>
										);
									})}
								</div>
							</div>
						);
					})
				)}
				<div
					style={{
						borderTop: `1px solid ${theme.colors.border}`,
						paddingTop: 12,
						fontSize: theme.fontSizes[0],
						color: muted,
						lineHeight: 1.45,
					}}
				>
					Green = confirmed · Red = issue · Muted = skipped / n/a
				</div>
			</div>
		</aside>
	);
}

function AuditDoneBody({
	report,
	theme,
	muted,
	filterKind,
	applying,
	applyError,
	onApplyFix,
}: {
	report: SubsystemModelAuditReport;
	theme: AuditTheme & {
		colors: AuditTheme["colors"] & {
			text?: string;
			primary?: string;
			background?: string;
		};
	};
	muted: string;
	filterKind: CheckKind | null;
	applying: string | null;
	applyError: string | null;
	onApplyFix: (
		fixId:
			| "adopt_graphify_signature"
			| "adopt_graphify_file"
			| "adopt_graphify_declaration_ref",
		componentId?: string,
	) => void;
}) {
	const s = report.summary;
	const workBits: string[] = [];
	workBits.push(`${s.components} component${s.components === 1 ? "" : "s"}`);
	if (s.filesVerified)
		workBits.push(
			`${s.filesVerified} file${s.filesVerified === 1 ? "" : "s"} on disk`,
		);
	if (s.declarationsValid)
		workBits.push(
			`${s.declarationsValid} declaration${s.declarationsValid === 1 ? "" : "s"} fresh`,
		);
	if (s.constructsMatched)
		workBits.push(`${s.constructsMatched} construct match`);
	if (s.signaturesMatched)
		workBits.push(`${s.signaturesMatched} signature match`);
	if (s.anchorsExact)
		workBits.push(`${s.anchorsExact} exact anchor${s.anchorsExact === 1 ? "" : "s"}`);
	if (s.graphifyConfirmed)
		workBits.push(`${s.graphifyConfirmed} matched in graphify`);
	if (s.externalsSkipped)
		workBits.push(`${s.externalsSkipped} external skipped`);

	const issueBits: string[] = [];
	if (s.missingFiles)
		issueBits.push(
			`${s.missingFiles} missing file${s.missingFiles === 1 ? "" : "s"}`,
		);
	if (s.staleDeclarations)
		issueBits.push(
			`${s.staleDeclarations} declaration drift${s.staleDeclarations === 1 ? "" : "s"}`,
		);
	if (s.constructMismatches)
		issueBits.push(`${s.constructMismatches} construct`);
	if (s.signatureMismatches)
		issueBits.push(`${s.signatureMismatches} signature`);
	if (s.weakAnchors)
		issueBits.push(
			`${s.weakAnchors} weak anchor${s.weakAnchors === 1 ? "" : "s"}`,
		);
	if (s.unresolved) issueBits.push(`${s.unresolved} unresolved`);

	const checksWithParts = report.checks.map((c) => ({
		check: c,
		parts: buildCheckParts(c),
	}));
	const visibleChecks = filterKind
		? checksWithParts.filter(({ parts }) =>
				[...parts.source, ...parts.graphify].some((p) => p.kind === filterKind),
			)
		: checksWithParts;

	const errorFindings = report.findings.filter((f) => f.severity === "error");
	const otherFindings = report.findings.filter((f) => f.severity !== "error");
	const ordered = [...errorFindings, ...otherFindings].filter((f) => {
		if (!filterKind) return true;
		const mapped = findingKindToCheckKind(f.kind);
		if (mapped === filterKind) return true;
		if (!f.componentId) return false;
		return visibleChecks.some(({ check }) => check.componentId === f.componentId);
	});

	return (
		<>
			<div
				style={{
					fontSize: theme.fontSizes[0],
					color: muted,
					marginBottom: 14,
					lineHeight: 1.5,
				}}
			>
				<div style={{ marginBottom: 4 }}>
					<span style={{ fontWeight: 600, color: theme.colors.text }}>Checked</span>
					{": "}
					{workBits.join(" · ")}
				</div>
				{issueBits.length > 0 && (
					<div>
						<span style={{ fontWeight: 600, color: theme.colors.text }}>Issues</span>
						{": "}
						{issueBits.join(" · ")}
					</div>
				)}
				{report.findings.some((f) => f.fix?.id === "adopt_graphify_signature") && (
					<div
						style={{
							marginTop: 10,
							display: "flex",
							flexWrap: "wrap",
							alignItems: "center",
							gap: 8,
						}}
					>
						<button
							type="button"
							disabled={applying != null}
							onClick={() => onApplyFix("adopt_graphify_signature")}
							style={{
								padding: "4px 10px",
								borderRadius: 6,
								border: `1px solid ${theme.colors.primary ?? theme.colors.border}`,
								background: theme.colors.primary ?? theme.colors.text,
								color: theme.colors.background ?? "#fff",
								fontSize: theme.fontSizes[0],
								fontFamily: theme.fonts.body,
								cursor: applying != null ? "default" : "pointer",
								opacity: applying != null ? 0.7 : 1,
								display: "inline-flex",
								alignItems: "center",
								gap: 6,
							}}
						>
							{applying === "all:adopt_graphify_signature" && (
								<Loader2 size={12} className="principal-studio-spin" />
							)}
							Apply all graphify signature fills
						</button>
						<span style={{ fontSize: theme.fontSizes[0], color: muted }}>
							Copies graphify named-type bags into model declaration where claims are empty.
						</span>
					</div>
				)}
				{report.findings.some((f) => f.fix?.id === "adopt_graphify_file") && (
					<div
						style={{
							marginTop: 10,
							display: "flex",
							flexWrap: "wrap",
							alignItems: "center",
							gap: 8,
						}}
					>
						<button
							type="button"
							disabled={applying != null}
							onClick={() => onApplyFix("adopt_graphify_file")}
							style={{
								padding: "4px 10px",
								borderRadius: 6,
								border: `1px solid ${theme.colors.primary ?? theme.colors.border}`,
								background: theme.colors.primary ?? theme.colors.text,
								color: theme.colors.background ?? "#fff",
								fontSize: theme.fontSizes[0],
								fontFamily: theme.fonts.body,
								cursor: applying != null ? "default" : "pointer",
								opacity: applying != null ? 0.7 : 1,
								display: "inline-flex",
								alignItems: "center",
								gap: 6,
							}}
						>
							{applying === "all:adopt_graphify_file" && (
								<Loader2 size={12} className="principal-studio-spin" />
							)}
							Apply all Graphify file updates
						</button>
						<span style={{ fontSize: theme.fontSizes[0], color: muted }}>
							Updates missing file paths when Graphify has a unique symbol definition elsewhere.
						</span>
					</div>
				)}
				{report.findings.some(
					(f) => f.fix?.id === "adopt_graphify_declaration_ref",
				) && (
					<div
						style={{
							marginTop: 10,
							display: "flex",
							flexWrap: "wrap",
							alignItems: "center",
							gap: 8,
						}}
					>
						<button
							type="button"
							disabled={applying != null}
							onClick={() => onApplyFix("adopt_graphify_declaration_ref")}
							style={{
								padding: "4px 10px",
								borderRadius: 6,
								border: `1px solid ${theme.colors.primary ?? theme.colors.border}`,
								background: theme.colors.primary ?? theme.colors.text,
								color: theme.colors.background ?? "#fff",
								fontSize: theme.fontSizes[0],
								fontFamily: theme.fonts.body,
								cursor: applying != null ? "default" : "pointer",
								opacity: applying != null ? 0.7 : 1,
								display: "inline-flex",
								alignItems: "center",
								gap: 6,
							}}
						>
							{applying === "all:adopt_graphify_declaration_ref" && (
								<Loader2 size={12} className="principal-studio-spin" />
							)}
							Apply all Graphify declaration re-pins
						</button>
						<span style={{ fontSize: theme.fontSizes[0], color: muted }}>
							Updates drifted declaration pins from Graphify’s current source location.
						</span>
					</div>
				)}
				{applyError && (
					<div
						style={{
							marginTop: 8,
							fontSize: theme.fontSizes[0],
							color: theme.colors.error ?? "#e5534b",
						}}
					>
						{applyError}
					</div>
				)}
				{filterKind && (
					<div style={{ marginTop: 6 }}>
						Filtering to{" "}
						<span style={{ fontWeight: 600, color: theme.colors.text }}>
							{CHECK_KIND_META[filterKind].example}
						</span>
						{" · "}
						{visibleChecks.length} component
						{visibleChecks.length === 1 ? "" : "s"}
					</div>
				)}
			</div>

			{visibleChecks.map(({ check: c, parts }) => {
				const sourceParts = parts.source;
				const graphifyParts = parts.graphify;
				const accent =
					c.verdict === "issue" ? (theme.colors.error ?? "#e5534b") : muted;

				return (
					<div
						key={c.componentId}
						style={{
							display: "flex",
							alignItems: "flex-start",
							gap: 12,
							padding: "10px 14px",
							marginBottom: 8,
							borderRadius: 8,
							background: theme.colors.background,
							border: `1px solid ${theme.colors.border}`,
						}}
					>
						<span
							style={{
								fontSize: theme.fontSizes[0] * 0.85,
								fontFamily: theme.fonts.monospace,
								textTransform: "uppercase",
								letterSpacing: "0.03em",
								color: accent,
								paddingTop: 2,
								flexShrink: 0,
								minWidth: 52,
							}}
						>
							{c.verdict}
						</span>
						<div style={{ minWidth: 0, flex: 1 }}>
							<div
								style={{
									display: "flex",
									alignItems: "baseline",
									gap: 8,
									flexWrap: "wrap",
									marginBottom: 6,
								}}
							>
								<span
									style={{
										fontWeight: 600,
										fontSize: theme.fontSizes[1],
									}}
								>
									{c.componentName ?? c.componentId}
								</span>
								{c.symbol ? (
									<span
										style={{
											fontWeight: 400,
											fontFamily: theme.fonts.monospace,
											color: muted,
											fontSize: theme.fontSizes[0],
										}}
									>
										{c.symbol}
									</span>
								) : null}
							</div>
							{c.file && (
								<div
									style={{
										fontSize: theme.fontSizes[0],
										fontFamily: theme.fonts.monospace,
										color: muted,
										marginBottom: 6,
										wordBreak: "break-word",
									}}
								>
									{c.file}
								</div>
							)}
							<div
								style={{
									fontSize: theme.fontSizes[0],
									lineHeight: 1.45,
									color: theme.colors.text,
								}}
							>
								<div>
									<span
										style={{
											fontFamily: theme.fonts.monospace,
											textTransform: "uppercase",
											letterSpacing: "0.03em",
											fontSize: theme.fontSizes[0] * 0.85,
											color: muted,
											marginRight: 6,
										}}
									>
										source
									</span>
									{sourceParts.length > 0 ? (
										<span
											style={{
												display: "inline-flex",
												flexWrap: "wrap",
												gap: 6,
												verticalAlign: "top",
											}}
										>
											{sourceParts.map((part) => (
												<span key={`source-${c.componentId}-${part.kind}`}>
													{statusPill(part.label, part.tone, theme, {
														active: filterKind === part.kind,
													})}
												</span>
											))}
										</span>
									) : (
										"—"
									)}
								</div>
								<div style={{ marginTop: 3 }}>
									<span
										style={{
											fontFamily: theme.fonts.monospace,
											textTransform: "uppercase",
											letterSpacing: "0.03em",
											fontSize: theme.fontSizes[0] * 0.85,
											color: muted,
											marginRight: 6,
										}}
									>
										graphify
									</span>
									<span
										style={{
											display: "inline-flex",
											flexWrap: "wrap",
											gap: 6,
											verticalAlign: "top",
										}}
									>
										{graphifyParts.map((part) => (
											<span key={`graphify-${c.componentId}-${part.kind}`}>
												{statusPill(part.label, part.tone, theme, {
													active: filterKind === part.kind,
												})}
											</span>
										))}
									</span>
								</div>
							</div>
							{c.note &&
								c.graphify !== "unavailable" &&
								c.graphify !== "skipped" && (
									<div
										style={{
											fontSize: theme.fontSizes[0],
											fontFamily: theme.fonts.monospace,
											color: muted,
											marginTop: 4,
										}}
									>
										{c.note}
									</div>
								)}
							{c.constructInferred === "unknown" && (
									<div
										style={{
											fontSize: theme.fontSizes[0],
											fontFamily: theme.fonts.monospace,
											color: muted,
											marginTop: 4,
											lineHeight: 1.45,
										}}
									>
										claimed {c.constructClaimed ?? "?"} · inferred unknown
										{c.constructEvidence?.length
											? ` · ${c.constructEvidence.join("; ")}`
											: ""}
									</div>
								)}
							{c.constructMatch === false &&
								c.constructInferred !== "unknown" &&
								(c.constructClaimed || c.constructInferred) && (
									<div
										style={{
											fontSize: theme.fontSizes[0],
											fontFamily: theme.fonts.monospace,
											color: theme.colors.error ?? "#e5534b",
											marginTop: 4,
											lineHeight: 1.45,
										}}
									>
										claimed {c.constructClaimed ?? "?"} · inferred{" "}
										{c.constructInferred ?? "?"}
										{c.constructEvidence?.length
											? ` · ${c.constructEvidence.join("; ")}`
											: ""}
									</div>
								)}
						</div>
					</div>
				);
			})}

			{visibleChecks.length === 0 && (
				<div style={{ fontSize: theme.fontSizes[1], color: muted, padding: "8px 0" }}>
					No components match this filter.
				</div>
			)}

			{ordered.length > 0 && (
				<>
					<div
						style={{
							fontSize: theme.fontSizes[0],
							fontFamily: theme.fonts.monospace,
							textTransform: "uppercase",
							letterSpacing: "0.04em",
							color: muted,
							fontWeight: 600,
							marginTop: 16,
							marginBottom: 8,
						}}
					>
						Findings
					</div>
					{ordered.map((f, i) => {
						const label =
							f.componentName ??
							f.componentId ??
							(f.walkthroughId != null
								? `${f.walkthroughId}${f.step != null ? ` #${f.step}` : ""}`
								: f.kind);
						const accent = severityColor(f.severity, theme.colors);
						return (
							<div
								key={`${f.kind}-${f.componentId ?? f.walkthroughId ?? i}-${i}`}
								style={{
									display: "flex",
									alignItems: "flex-start",
									gap: 12,
									padding: "12px 14px",
									marginBottom: 10,
									borderRadius: 8,
									background: theme.colors.background,
									border: `1px solid ${theme.colors.border}`,
								}}
							>
								<span
									style={{
										fontSize: theme.fontSizes[0] * 0.85,
										fontFamily: theme.fonts.monospace,
										textTransform: "uppercase",
										letterSpacing: "0.03em",
										color: accent,
										paddingTop: 2,
										flexShrink: 0,
										minWidth: 52,
									}}
								>
									{f.severity}
								</span>
								<div style={{ minWidth: 0, flex: 1 }}>
									<div
										style={{
											fontWeight: 600,
											fontSize: theme.fontSizes[1],
											marginBottom: 2,
										}}
									>
										{label}
									</div>
									<div
										style={{
											fontSize: theme.fontSizes[0],
											fontFamily: theme.fonts.monospace,
											color: muted,
											marginBottom: 4,
										}}
									>
										{f.kind}
									</div>
									<div
										style={{
											fontSize: theme.fontSizes[0],
											fontFamily: theme.fonts.monospace,
											color: theme.colors.text,
											lineHeight: 1.5,
											wordBreak: "break-word",
										}}
									>
										{f.message}
									</div>
									{f.fix && f.componentId && (
										<button
											type="button"
											disabled={applying != null}
											onClick={() => onApplyFix(f.fix!.id, f.componentId)}
											style={{
												marginTop: 8,
												padding: "3px 8px",
												borderRadius: 5,
												border: `1px solid ${theme.colors.border}`,
												background: "transparent",
												color: theme.colors.text,
												fontSize: theme.fontSizes[0],
												fontFamily: theme.fonts.body,
												cursor: applying != null ? "default" : "pointer",
												opacity: applying != null ? 0.7 : 1,
												display: "inline-flex",
												alignItems: "center",
												gap: 6,
											}}
										>
											{applying === `${f.fix.id}:${f.componentId}` && (
												<Loader2 size={11} className="principal-studio-spin" />
											)}
											{f.fix.label}
										</button>
									)}
								</div>
							</div>
						);
					})}
				</>
			)}
		</>
	);
}

export function AuditResultsModal({
	state,
	onClose,
	onReportChange,
}: {
	state: AuditModalState;
	onClose: () => void;
	/** Called when a deterministic fix rewrites the model and returns a fresh report. */
	onReportChange?: (report: SubsystemModelAuditReport) => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const canDismiss = state.phase === "done" || state.phase === "error";
	const [filterKind, setFilterKind] = useState<CheckKind | null>(null);
	const [applying, setApplying] = useState<string | null>(null);
	const [applyError, setApplyError] = useState<string | null>(null);
	const [localReport, setLocalReport] = useState<SubsystemModelAuditReport | null>(
		null,
	);
	const reportKey =
		state.phase === "done"
			? `${state.report.graphId}:${state.report.checkedAt}`
			: state.phase;

	useEffect(() => {
		setFilterKind(null);
		setLocalReport(null);
		setApplyError(null);
		setApplying(null);
	}, [reportKey]);

	const doneReport =
		state.phase === "done" ? (localReport ?? state.report) : null;

	const presentKinds = useMemo(
		() =>
			doneReport
				? collectPresentKinds(doneReport)
				: new Map<CheckKind, { count: number; tone: AuditTone }>(),
		[doneReport],
	);

	const onApplyFix = async (
		fixId:
			| "adopt_graphify_signature"
			| "adopt_graphify_file"
			| "adopt_graphify_declaration_ref",
		componentId?: string,
	) => {
		if (state.phase !== "done" || applying) return;
		const graphId = (localReport ?? state.report).graphId;
		setApplying(componentId ? `${fixId}:${componentId}` : `all:${fixId}`);
		setApplyError(null);
		try {
			const res = await electrobun.rpc!.request.applySubsystemModelAuditFix({
				graphId,
				fixId,
				componentId,
			});
			if (!res.ok || !res.report) {
				setApplyError(res.error ?? "Failed to apply fix");
				return;
			}
			setLocalReport(res.report);
			onReportChange?.(res.report);
		} catch (err) {
			setApplyError(err instanceof Error ? err.message : String(err));
		} finally {
			setApplying(null);
		}
	};

	const headerTitle =
		state.phase === "done" && doneReport
			? `Audit — ${doneReport.title}`
			: state.phase === "error"
				? `Audit — ${state.title ?? "failed"}`
				: state.phase === "graphify"
					? `Audit — ${state.title}`
					: `Audit — ${state.title}`;

	return (
		<div
			role="dialog"
			aria-modal
			aria-label="Subsystem model audit"
			onClick={canDismiss ? onClose : undefined}
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 2147483000,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				gap: 14,
				padding: 24,
				background: "rgba(0,0,0,0.55)",
				fontFamily: theme.fonts.body,
			}}
		>
			<div
				onClick={(e) => e.stopPropagation()}
				style={{
					width: "min(640px, calc(100vw - 48px))",
					maxHeight: "min(75vh, 680px)",
					display: "flex",
					flexDirection: "column",
					background: theme.colors.surface,
					border: `1px solid ${theme.colors.border}`,
					borderRadius: 12,
					overflow: "hidden",
					boxShadow: "0 12px 48px rgba(0,0,0,0.4)",
					color: theme.colors.text,
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "flex-start",
						justifyContent: "space-between",
						gap: 12,
						padding: "14px 20px",
						borderBottom: `1px solid ${theme.colors.border}`,
						background: theme.colors.background,
					}}
				>
					<div style={{ minWidth: 0, flex: 1 }}>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 10,
								flexWrap: "wrap",
								marginBottom: 4,
							}}
						>
							<span style={{ fontSize: theme.fontSizes[3], fontWeight: 600 }}>
								{headerTitle}
							</span>
							{state.phase === "done" && doneReport && (() => {
								const verdict = doneReport.needsUpdate
									? "verification failed"
									: doneReport.findings.some((f) => f.kind === "construct_unconfirmed") ||
										  doneReport.checks.some(
												(c) =>
													c.constructInferred === "unknown" ||
													c.signature === "skipped",
										  )
										? "partially verified"
										: "fully verified";
								const accent =
									verdict === "verification failed"
										? (theme.colors.error ?? "#e5534b")
										: verdict === "partially verified"
											? muted
											: (theme.colors.success ?? "#2da44e");
								return (
								<span
									style={{
										fontSize: theme.fontSizes[0],
										fontFamily: theme.fonts.monospace,
										textTransform: "uppercase",
										letterSpacing: "0.04em",
										padding: "2px 8px",
										borderRadius: 4,
										border: `1px solid ${accent}`,
										color: accent,
									}}
								>
									{verdict}
								</span>
								);
							})()}
							{(state.phase === "graphify" || state.phase === "auditing") && (
								<span
									style={{
										fontSize: theme.fontSizes[0],
										fontFamily: theme.fonts.monospace,
										textTransform: "uppercase",
										letterSpacing: "0.04em",
										padding: "2px 8px",
										borderRadius: 4,
										border: `1px solid ${theme.colors.border}`,
										color: muted,
										display: "inline-flex",
										alignItems: "center",
										gap: 6,
									}}
								>
									<Loader2 size={12} className="principal-studio-spin" />
									{state.phase === "graphify" ? "preparing" : "auditing"}
								</span>
							)}
						</div>
						<div style={{ fontSize: theme.fontSizes[0], color: muted }}>
							{state.phase === "graphify" &&
								"Ensuring graphify cache for component repos before the audit…"}
							{state.phase === "auditing" &&
								"Running deterministic checks against the checkout…"}
							{state.phase === "done" &&
								doneReport &&
								`${formatCheckedAt(doneReport.checkedAt)} · dry run`}
							{state.phase === "error" && "Dry-run audit stopped"}
						</div>
					</div>
					{canDismiss && (
						<button
							type="button"
							onClick={onClose}
							style={{
								width: 28,
								height: 28,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								borderRadius: 6,
								border: `1px solid ${theme.colors.border}`,
								background: theme.colors.background,
								color: theme.colors.textSecondary,
								fontSize: theme.fontSizes[2],
								cursor: "pointer",
								lineHeight: 1,
								flexShrink: 0,
							}}
							title="Close"
						>
							×
						</button>
					)}
				</div>

				<div
					style={{
						flex: 1,
						minHeight: 0,
						overflowY: "auto",
						padding: 16,
					}}
				>
					{state.phase === "graphify" && (
						<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
							{state.purls.map((p) => (
								<div
									key={p.purl}
									style={{
										display: "flex",
										alignItems: "flex-start",
										gap: 12,
										padding: "12px 14px",
										borderRadius: 8,
										background: theme.colors.background,
										border: `1px solid ${theme.colors.border}`,
									}}
								>
									<span
										style={{
											width: 18,
											display: "flex",
											justifyContent: "center",
											paddingTop: 2,
											flexShrink: 0,
										}}
									>
										{p.status === "building" || p.status === "pending" ? (
											<Loader2 size={14} className="principal-studio-spin" />
										) : p.status === "ready" ? (
											<span style={{ color: muted }}>✓</span>
										) : (
											<span style={{ color: theme.colors.error ?? "#e5534b" }}>!</span>
										)}
									</span>
									<div style={{ minWidth: 0, flex: 1 }}>
										<div
											style={{
												fontWeight: 600,
												fontSize: theme.fontSizes[1],
												marginBottom: 2,
											}}
										>
											{shortPurl(p.purl)}
										</div>
										<div
											style={{
												fontSize: theme.fontSizes[0],
												fontFamily: theme.fonts.monospace,
												color:
													p.status === "error"
														? (theme.colors.error ?? "#e5534b")
														: muted,
												wordBreak: "break-word",
											}}
										>
											{p.detail ??
												(p.status === "pending"
													? "queued"
													: p.status === "building"
														? "running graphify…"
														: p.status === "ready"
															? "cache ready"
															: "failed")}
										</div>
									</div>
								</div>
							))}
							{state.purls.length === 0 && (
								<div style={{ fontSize: theme.fontSizes[1], color: muted }}>
									No component purls need a graphify cache.
								</div>
							)}
						</div>
					)}

					{state.phase === "auditing" && (
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 10,
								padding: "16px 4px",
								color: muted,
								fontSize: theme.fontSizes[1],
							}}
						>
							<Loader2 size={16} className="principal-studio-spin" />
							Checking files, symbols, and declarations…
						</div>
					)}

					{state.phase === "error" && (
						<div
							style={{
								padding: "12px 14px",
								borderRadius: 8,
								background: theme.colors.background,
								border: `1px solid ${theme.colors.border}`,
								fontSize: theme.fontSizes[1],
								fontFamily: theme.fonts.monospace,
								color: theme.colors.error ?? "#e5534b",
								lineHeight: 1.5,
								wordBreak: "break-word",
							}}
						>
							{state.error}
						</div>
					)}

					{state.phase === "done" && doneReport && (
						<AuditDoneBody
							report={doneReport}
							theme={theme}
							muted={muted}
							filterKind={filterKind}
							applying={applying}
							applyError={applyError}
							onApplyFix={(fixId, id) => void onApplyFix(fixId, id)}
						/>
					)}
				</div>

				{canDismiss && (
					<div
						style={{
							display: "flex",
							justifyContent: "flex-end",
							padding: "12px 16px",
							borderTop: `1px solid ${theme.colors.border}`,
							background: theme.colors.background,
						}}
					>
						<button
							type="button"
							onClick={onClose}
							style={{
								padding: "6px 14px",
								borderRadius: 6,
								border: `1px solid ${theme.colors.border}`,
								background:
									theme.colors.backgroundSecondary ?? theme.colors.background,
								color: theme.colors.text,
								fontSize: theme.fontSizes[1],
								fontFamily: theme.fonts.body,
								cursor: "pointer",
							}}
						>
							Close
						</button>
					</div>
				)}
			</div>
			{state.phase === "done" && (
				<AuditLegend
					theme={theme}
					present={presentKinds}
					activeKind={filterKind}
					onSelectKind={setFilterKind}
				/>
			)}
		</div>
	);
}

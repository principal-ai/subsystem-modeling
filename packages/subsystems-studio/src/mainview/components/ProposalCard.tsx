/**
 * ProposalCard — one agent-proposed subsystem model correction: lane + author,
 * the before/after preview, the audit finding, why the agent wants it, its Jev
 * second opinion, and the accept / reject / score / copy actions.
 *
 * Presentational and self-contained: it owns no RPC and no list state. The
 * modal (`ProposalsModal`) owns the collection, the per-card busy map, and the
 * copy feedback, and passes them in as props. Extracted so a single card can be
 * rendered in isolation (see `ProposalCard.stories.tsx`).
 */

import { useState } from "react";
import {
	Check,
	ChevronDown,
	ChevronRight,
	Component,
	Copy,
	Loader2,
	Network,
	Route,
	Server,
	type LucideIcon,
} from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import { IndustryMarkdownSlide } from "themed-markdown";
import {
	ReactFlowProvider,
	type Node,
	type NodeProps,
} from "@xyflow/react";
import {
	C4NodeCard,
	SubsystemComponentNode,
	SubsystemCallbacksProvider,
	type C4Container,
	type SubsystemComponent,
	type SubsystemGraphNodeData,
} from "@principal-ai/subsystems-react";
import type {
	SubsystemModelProposal,
	SubsystemModelProposalChange,
	SubsystemVerificationLane,
} from "../../shared/contract";

export const LANE_LABEL: Record<SubsystemVerificationLane, string> = {
	construct: "Construct",
	"static-topology": "Static topology",
	"dynamic-topology": "Dynamic topology",
	trail: "Trail",
};

/** Lane icons — mirrors MaintenancePanel's LANE_META (layer → mark). */
export const LANE_ICON: Record<SubsystemVerificationLane, LucideIcon> = {
	construct: Component,
	"static-topology": Network,
	"dynamic-topology": Server,
	trail: Route,
};

/** Display label for the agent that produced a proposal (its `author` tag).
 *  Legacy ids (pre-rename) are aliased so persisted proposals still read. */
export const AGENT_LABEL: Record<string, string> = {
	"construct-verifier": "Construct Verifier",
	"package-module-verifier": "Package/Module Verifier",
	"runtime-topology-verifier": "Runtime Topology Verifier",
	"container-verifier": "Container Verifier",
	"trail-verifier": "Trail Verifier",
	"construct-fixer": "Construct Fixer",
	"package-module-fixer": "Package/Module Fixer",
	// Legacy (pre-rename) ids.
	"gap-filler": "Construct Verifier",
	"topology-gap-filler": "Package/Module Verifier",
	"boundary-gap-filler": "Runtime Topology Verifier",
	"issue-fixer": "Construct Fixer",
	"topology-fixer": "Package/Module Fixer",
};

export function agentLabel(author?: string): string | null {
	if (!author) return null;
	return AGENT_LABEL[author] ?? author;
}

/** First component alias a proposal touches, if any. */
export function proposalComponentAlias(
	p: SubsystemModelProposal,
): string | null {
	for (const ch of p.changes) {
		if ("componentAlias" in ch && ch.componentAlias) return ch.componentAlias;
	}
	return p.finding?.componentAlias ?? null;
}

const NODE_PREVIEW_WIDTH = 230;
const NODE_PREVIEW_HEIGHT = 84;
/** Neutral callbacks so a previewed node never dispatches into a mounted graph. */
const PREVIEW_CALLBACKS = {};

/**
 * Standalone component node — the same renderer the graph uses, mounted outside
 * the canvas. `ReactFlowProvider` satisfies the node's invisible <Handle>s;
 * `SubsystemCallbacksProvider` keeps clicks/hover from reaching the live graph.
 */
export function ComponentNodePreview({
	component,
}: {
	component: SubsystemComponent;
}) {
	const props = {
		data: { component } as SubsystemGraphNodeData,
		selected: false,
		width: NODE_PREVIEW_WIDTH,
		height: NODE_PREVIEW_HEIGHT,
	} as unknown as NodeProps<Node<SubsystemGraphNodeData, "subsystem-component">>;
	return (
		<ReactFlowProvider>
			<SubsystemCallbacksProvider value={PREVIEW_CALLBACKS}>
				<SubsystemComponentNode {...props} />
			</SubsystemCallbacksProvider>
		</ReactFlowProvider>
	);
}

/**
 * The container a `c4-container` proposal is proposing, drawn with the same
 * card the C4 graph renders. Pinned to `accepted` so it draws solid: the
 * dashed state is the graph's pending-mark, and here the card previews what
 * accepting will produce. Self-contained: the payload rides the proposal's
 * own change, no graph or store lookup.
 */
export function ContainerNodePreview({
	container,
}: {
	container: Omit<C4Container, "state" | "kind">;
}) {
	const node: C4Container = {
		kind: "container",
		state: "accepted",
		...container,
	};
	return (
		<div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
			<C4NodeCard node={node} />
		</div>
	);
}

/** The `c4-container` change a proposal carries, if any. */
export function proposalContainerChange(
	p: SubsystemModelProposal,
): Extract<SubsystemModelProposalChange, { target: "c4-container" }> | null {
	for (const ch of p.changes) {
		if (ch.target === "c4-container") return ch;
	}
	return null;
}

export function formatValue(v: unknown): string {
	if (v === undefined) return "—";
	if (v === null) return "null";
	if (typeof v === "string") return v;
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	try {
		return JSON.stringify(v);
	} catch {
		return String(v);
	}
}

/** Whether the change at `index` records a confirmation rather than editing the model. */
export function isConfirmation(
	p: SubsystemModelProposal,
	index: number,
): boolean {
	return p.changes[index]?.target === "augmentation";
}

/** Audit gap kinds an augmentation can close → the "now" state label. */
const UNCONFIRMED_LABEL: Record<string, string> = {
	construct_unconfirmed: "Construct unconfirmed",
	signature_unconfirmed: "Signature unconfirmed",
	boundary_module_file_mismatch: "Module unconfirmed",
};

/** Fallback label from the augmentation's field when no finding kind is linked. */
function unconfirmedLabel(field: string): string {
	switch (field) {
		case "construct":
			return "Construct unconfirmed";
		case "signature":
			return "Signature unconfirmed";
		case "module":
			return "Module unconfirmed";
		default:
			return "Unconfirmed";
	}
}

/** The state a change moves from. */
export function nowState(
	p: SubsystemModelProposal,
	index: number,
): string {
	const ch = p.changes[index];
	if (ch?.target === "augmentation") {
		const kind = p.finding?.kind;
		return (kind && UNCONFIRMED_LABEL[kind]) || unconfirmedLabel(ch.field);
	}
	return formatValue(p.preview[index]?.before);
}

/** The state a change moves to. */
export function afterState(
	p: SubsystemModelProposal,
	index: number,
): string {
	const row = p.preview[index];
	if (p.changes[index]?.target === "augmentation") {
		return `Verified${row?.after ? ` as ${formatValue(row.after)}` : ""}`;
	}
	return formatValue(row?.after);
}

/**
 * Build a paste-ready brief for an agent explaining a proposal and why its
 * Jev second opinion came back low (uncertain / inaccurate / errored).
 */
export function buildAgentPrompt(
	p: SubsystemModelProposal,
	title?: string,
): string {
	const lines: string[] = [];
	lines.push(
		"You are reviewing a correction proposal for a subsystem model. Its Jev second opinion scored low, and I need to understand why.",
	);
	lines.push("");
	lines.push("## Proposal");
	if (title) lines.push(`Model: ${title}`);
	lines.push(`Model id: ${p.graphId}`);
	lines.push(`Proposal id: ${p.id}`);
	if (p.author) lines.push(`Author: ${p.author}`);
	if (p.lane) lines.push(`Lane: ${LANE_LABEL[p.lane]}`);
	lines.push(`Created: ${p.createdAt}`);
	lines.push("");
	lines.push("### Rationale (why the agent wants this change)");
	lines.push(p.rationale || "(none)");
	if (p.finding?.message) {
		lines.push("");
		lines.push("### Audit finding");
		if (p.finding.kind) lines.push(`Kind: ${p.finding.kind}`);
		if (p.finding.severity) lines.push(`Severity: ${p.finding.severity}`);
		if (p.finding.componentName || p.finding.componentAlias) {
			lines.push(
				`Component: ${p.finding.componentName ?? p.finding.componentAlias}`,
			);
		}
		if (p.finding.trailId) {
			lines.push(
				`Trail: ${p.finding.trailId}${
					p.finding.step != null ? ` step ${p.finding.step}` : ""
				}`,
			);
		}
		lines.push(p.finding.message);
	}
	if (p.preview.length > 0) {
		lines.push("");
		lines.push("### Proposed changes");
		for (const row of p.preview) {
			lines.push(
				`- ${row.label}: ${formatValue(row.before)} -> ${formatValue(row.after)}`,
			);
		}
	}
	lines.push("");
	lines.push("### Raw proposal JSON");
	lines.push("```json");
	lines.push(JSON.stringify(p, null, 2));
	lines.push("```");
	lines.push("");
	lines.push("## Second opinion (Jev)");
	if (!p.secondOpinion) {
		lines.push("Not scored yet.");
	} else {
		const o = p.secondOpinion;
		lines.push(`Source: ${o.source}`);
		lines.push(`Checked at: ${o.checkedAt}`);
		lines.push(`Verdict: ${o.verdict}`);
		lines.push(`Confidence: ${Math.round(o.confidence * 100)}%`);
		if (o.changeKind) lines.push(`Change kind: ${o.changeKind}`);
		if (o.risk) lines.push(`Risk: ${o.risk}`);
		if (o.error) lines.push(`Error: ${o.error}`);
	}
	lines.push("");
	lines.push("## What I need from you");
	lines.push(
		"Explain why the second opinion scored as it did. Is Jev right or wrong? Point at the specific files, symbols, and lines that support or refute the change, and say what the proposal should have claimed instead.",
	);
	return lines.join("\n");
}

export function opinionBadge(
	opinion: NonNullable<SubsystemModelProposal["secondOpinion"]>,
	colors: { success?: string; error?: string; textSecondary?: string },
	muted: string,
): { text: string; color: string } {
	if (opinion.error) {
		return {
			text: `Second opinion unavailable — ${opinion.error}`,
			color: colors.error ?? "#e5534b",
		};
	}
	const pct = Math.round(opinion.confidence * 100);
	const label =
		opinion.verdict === "accurate"
			? "Accurate"
			: opinion.verdict === "inaccurate"
				? "Inaccurate"
				: "Uncertain";
	const color =
		opinion.verdict === "accurate"
			? (colors.success ?? "#2da44e")
			: opinion.verdict === "inaccurate"
				? (colors.error ?? "#e5534b")
				: muted;
	return { text: `Second opinion · ${label} ${pct}%`, color };
}

/**
 * Collapsible record of the exact payload sent to Jev — the `state` string
 * (rationale + finding + preview + source-context block) and the three
 * questions. Collapsed by default; the state can be up to ~24KB of source.
 */
export function JevRequestDisclosure({
	request,
}: {
	request: NonNullable<
		NonNullable<SubsystemModelProposal["secondOpinion"]>["request"]
	>;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [open, setOpen] = useState(false);
	const monospace = theme.fonts.monospace ?? "ui-monospace, monospace";
	return (
		<div style={{ margin: "0 0 12px" }}>
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
				style={{
					display: "inline-flex",
					alignItems: "center",
					gap: 4,
					padding: 0,
					background: "transparent",
					border: "none",
					color: muted,
					fontSize: theme.fontSizes[1],
					fontFamily: theme.fonts.body,
					cursor: "pointer",
				}}
			>
				{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
				{open ? "Hide what was sent to Jev" : "What was sent to Jev"}
			</button>
			{open && (
				<div style={{ marginTop: 8 }}>
					<div
						style={{
							fontSize: theme.fontSizes[1],
							color: muted,
							marginBottom: 4,
						}}
					>
						Model: <code style={{ fontFamily: monospace }}>{request.model}</code>
					</div>
					<pre
						style={{
							margin: "0 0 8px",
							padding: 10,
							borderRadius: 6,
							border: `1px solid ${theme.colors.border}`,
							background: theme.colors.background,
							color: theme.colors.text,
							fontSize: theme.fontSizes[0],
							fontFamily: monospace,
							lineHeight: 1.4,
							whiteSpace: "pre-wrap",
							wordBreak: "break-word",
							maxHeight: 320,
							overflow: "auto",
						}}
					>
						{request.state}
					</pre>
					<div
						style={{
							fontSize: theme.fontSizes[1],
							color: muted,
							marginBottom: 4,
						}}
					>
						Questions
					</div>
					<pre
						style={{
							margin: 0,
							padding: 10,
							borderRadius: 6,
							border: `1px solid ${theme.colors.border}`,
							background: theme.colors.background,
							color: theme.colors.text,
							fontSize: theme.fontSizes[0],
							fontFamily: monospace,
							lineHeight: 1.4,
							whiteSpace: "pre-wrap",
							wordBreak: "break-word",
							maxHeight: 320,
							overflow: "auto",
						}}
					>
						{JSON.stringify(request.questions, null, 2)}
					</pre>
				</div>
			)}
		</div>
	);
}

/** Per-card in-flight state. `scoring` is the only Jev action shown. */
export type ProposalCardAction = "accept" | "reject" | "scoring";

export function ProposalCard({
	proposal,
	previewComponent,
	action,
	copied = false,
	onAccept,
	onReject,
	onScore,
	onCopyForAgent,
}: {
	proposal: SubsystemModelProposal;
	/** Resolved model component to draw beside a construct proposal, if any. */
	previewComponent?: SubsystemComponent | null;
	/** Which action is in flight for this card, if any. */
	action?: ProposalCardAction;
	/** Whether this card's "Copy for agent" prompt was just copied. */
	copied?: boolean;
	onAccept: (proposalId: string) => void;
	onReject: (proposalId: string) => void;
	onScore: (proposalId: string, force?: boolean) => void;
	onCopyForAgent: (proposal: SubsystemModelProposal) => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const p = proposal;
	const cardBusy = action != null;
	const accepting = action === "accept";
	const rejecting = action === "reject";
	const LaneIcon = p.lane ? LANE_ICON[p.lane] : null;
	const showNode = p.lane === "construct" && previewComponent != null;
	const containerChange = proposalContainerChange(p);

	return (
		<article
			style={{
				padding: 14,
				borderRadius: 8,
				border: `1px solid ${theme.colors.border}`,
				background: theme.colors.background,
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 6,
					marginBottom: 10,
					fontSize: theme.fontSizes[1],
					color: theme.colors.primary,
				}}
			>
				{LaneIcon && <LaneIcon size={14} style={{ flexShrink: 0 }} />}
				<span style={{ whiteSpace: "nowrap" }}>{agentLabel(p.author)}</span>
			</div>

			{showNode && previewComponent && (
				<div
					style={{
						display: "flex",
						justifyContent: "center",
						marginBottom: 12,
					}}
				>
					<ComponentNodePreview component={previewComponent} />
				</div>
			)}

			{containerChange && (
				<div style={{ marginBottom: 12 }}>
					<ContainerNodePreview container={containerChange.container} />
				</div>
			)}

			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 8,
					marginBottom: 12,
				}}
			>
				{p.preview.map((row, i) => (
					<div
						key={`${row.label}-${i}`}
						style={{
							display: "grid",
							gridTemplateColumns: "auto 1fr",
							alignItems: "baseline",
							gap: "4px 10px",
							fontSize: theme.fontSizes[1],
							lineHeight: 1.4,
						}}
					>
						{p.preview.length > 1 && (
							<span
								style={{
									gridColumn: "1 / -1",
									color: muted,
									fontSize: theme.fontSizes[1],
									fontFamily:
										theme.fonts.monospace ?? "ui-monospace, monospace",
								}}
							>
								{row.label}
							</span>
						)}
						<span style={{ color: muted }}>Now</span>
						<span
							style={{
								fontFamily:
									theme.fonts.monospace ?? "ui-monospace, monospace",
							}}
						>
							{nowState(p, i)}
						</span>
						<span style={{ color: muted }}>After</span>
						<span
							style={{
								fontFamily:
									theme.fonts.monospace ?? "ui-monospace, monospace",
								color: isConfirmation(p, i)
									? theme.colors.text
									: (theme.colors.success ?? "#2da44e"),
							}}
						>
							{afterState(p, i)}
						</span>
					</div>
				))}
			</div>

			<div style={{ margin: "0 0 10px" }}>
				<div
					style={{
						fontSize: theme.fontSizes[1],
						fontWeight: 600,
						marginBottom: 4,
					}}
				>
					Reasoning
				</div>
				<IndustryMarkdownSlide
					content={p.rationale || "_(none)_"}
					slideIdPrefix={`proposal-rationale-${p.id}`}
					slideIndex={0}
					isVisible
					theme={theme}
					transparentBackground
					disableBasePadding
					disableScroll
					enableKeyboardScrolling={false}
					autoFocusOnVisible={false}
				/>
			</div>

			{p.secondOpinion ? (
				<p
					title={`Jev ${p.secondOpinion.source} · ${p.secondOpinion.checkedAt}${p.secondOpinion.risk ? ` · risk ${p.secondOpinion.risk}` : ""}${p.secondOpinion.error ? ` · ${p.secondOpinion.error}` : ""}`}
					style={{
						margin: "0 0 12px",
						fontSize: theme.fontSizes[1],
						color: opinionBadge(p.secondOpinion, theme.colors, muted).color,
						lineHeight: 1.45,
					}}
				>
					{opinionBadge(p.secondOpinion, theme.colors, muted).text}
				</p>
			) : null}

			{p.secondOpinion?.request ? (
				<JevRequestDisclosure request={p.secondOpinion.request} />
			) : null}

			<div
				style={{
					display: "flex",
					gap: 8,
					justifyContent: "flex-end",
					flexWrap: "wrap",
				}}
			>
				<button
					type="button"
					onClick={() => onCopyForAgent(p)}
					title="Copy a prompt asking an agent why this second opinion was low"
					style={{
						padding: "0 12px",
						height: 32,
						borderRadius: 6,
						fontSize: theme.fontSizes[1],
						fontFamily: theme.fonts.body,
						background: "transparent",
						color: muted,
						border: `1px solid ${theme.colors.border}`,
						cursor: "pointer",
						display: "inline-flex",
						alignItems: "center",
						gap: 6,
						marginRight: "auto",
					}}
				>
					{copied ? <Check size={12} /> : <Copy size={12} />}
					{copied ? "Copied" : "Copy for agent"}
				</button>
				<button
					type="button"
					disabled={cardBusy}
					onClick={() => onScore(p.id, Boolean(p.secondOpinion))}
					title={
						p.secondOpinion
							? "Ask Jev to score this proposal again, replacing the current opinion"
							: "Ask Jev for a second opinion without accepting"
					}
					style={{
						padding: "0 12px",
						height: 32,
						borderRadius: 6,
						fontSize: theme.fontSizes[1],
						fontFamily: theme.fonts.body,
						background: "transparent",
						color: theme.colors.primary,
						border: `1px solid ${theme.colors.primary}`,
						cursor: cardBusy ? "default" : "pointer",
						opacity: cardBusy ? 0.6 : 1,
						display: "inline-flex",
						alignItems: "center",
						gap: 6,
					}}
				>
					{action === "scoring" && (
						<Loader2 size={12} className="principal-studio-spin" />
					)}
					{action === "scoring"
						? "Scoring…"
						: !p.secondOpinion
							? "Get second opinion"
							: p.secondOpinion.error
								? "Retry scoring"
								: "Re-score"}
				</button>
				<button
					type="button"
					disabled={cardBusy}
					onClick={() => onReject(p.id)}
					style={{
						padding: "0 12px",
						height: 32,
						borderRadius: 6,
						fontSize: theme.fontSizes[1],
						fontFamily: theme.fonts.body,
						background: "transparent",
						color: theme.colors.text,
						border: `1px solid ${theme.colors.border}`,
						cursor: cardBusy ? "default" : "pointer",
						opacity: cardBusy ? 0.6 : 1,
						display: "inline-flex",
						alignItems: "center",
						gap: 6,
					}}
				>
					{rejecting && (
						<Loader2 size={12} className="principal-studio-spin" />
					)}
					{rejecting ? "Rejecting…" : "Reject"}
				</button>
				<button
					type="button"
					disabled={cardBusy}
					onClick={() => onAccept(p.id)}
					style={{
						padding: "0 12px",
						height: 32,
						borderRadius: 6,
						fontSize: theme.fontSizes[1],
						fontWeight: 500,
						fontFamily: theme.fonts.body,
						background: theme.colors.primary,
						color: theme.colors.background,
						border: `1px solid ${theme.colors.primary}`,
						cursor: cardBusy ? "default" : "pointer",
						opacity: cardBusy ? 0.6 : 1,
						display: "inline-flex",
						alignItems: "center",
						gap: 6,
					}}
				>
					{accepting && (
						<Loader2 size={12} className="principal-studio-spin" />
					)}
					{accepting ? "Accepting…" : "Accept"}
				</button>
			</div>
		</article>
	);
}

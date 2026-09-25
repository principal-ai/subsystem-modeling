/**
 * Review agent-proposed subsystem model corrections (before/after + why).
 * Accept applies the patch; reject leaves the model unchanged.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
	Check,
	Component,
	Copy,
	Loader2,
	Network,
	Route,
	Server,
	type LucideIcon,
} from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import { DocumentView } from "themed-markdown";
import type {
	SubsystemModelProposal,
	SubsystemVerificationLane,
} from "../../shared/contract";
import {
	ReactFlowProvider,
	type Node,
	type NodeProps,
} from "@xyflow/react";
import {
	SubsystemComponentNode,
	SubsystemCallbacksProvider,
	type SubsystemComponent,
	type SubsystemGraphNodeData,
} from "@principal-ai/subsystems-react";
import { electrobun } from "../rpc";
import { Modal, ModalBody, ModalHeader } from "./Modal";

const LANE_LABEL: Record<SubsystemVerificationLane, string> = {
	construct: "Construct",
	"static-topology": "Static topology",
	"dynamic-topology": "Dynamic topology",
	walkthrough: "Walkthrough",
};

/** Lane icons — mirrors MaintenancePanel's LANE_META (layer → mark). */
const LANE_ICON: Record<SubsystemVerificationLane, LucideIcon> = {
	construct: Component,
	"static-topology": Network,
	"dynamic-topology": Server,
	walkthrough: Route,
};

/** Display label for the agent that produced a proposal (its `author` tag).
 *  Legacy ids (pre-rename) are aliased so persisted proposals still read. */
const AGENT_LABEL: Record<string, string> = {
	"construct-verifier": "Construct Verifier",
	"static-topology-verifier": "Static Topology Verifier",
	"package-module-verifier": "Package/Module Verifier",
	"runtime-topology-verifier": "Runtime Topology Verifier",
	"construct-fixer": "Construct Fixer",
	"static-topology-fixer": "Static Topology Fixer",
	"package-module-fixer": "Package/Module Fixer",
	// Legacy (pre-rename) ids.
	"gap-filler": "Construct Verifier",
	"topology-gap-filler": "Static Topology Verifier",
	"boundary-gap-filler": "Dynamic Topology Verifier",
	"issue-fixer": "Construct Fixer",
	"topology-fixer": "Static Topology Fixer",
};

function agentLabel(author?: string): string | null {
	if (!author) return null;
	return AGENT_LABEL[author] ?? author;
}

/** First component alias a proposal touches, if any. */
function proposalComponentAlias(p: SubsystemModelProposal): string | null {
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
function ComponentNodePreview({ component }: { component: SubsystemComponent }) {
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

function formatValue(v: unknown): string {
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

/** True when at least one change rewrites the model (vs only recording a confirmation). */
function updatesModel(p: SubsystemModelProposal): boolean {
	return p.changes.some((c) => c.target !== "augmentation");
}

/** Whether the change at `index` records a confirmation rather than editing the model. */
function isConfirmation(p: SubsystemModelProposal, index: number): boolean {
	return p.changes[index]?.target === "augmentation";
}

/** Human heading for the change — `<symbol>.<field>` for the common cases. */
function changeHeading(p: SubsystemModelProposal): string {
	const ch = p.changes[0];
	if (!ch) return "Change";
	if (ch.target === "augmentation") {
		if (ch.field === "relation") return `relation ${ch.relationId}`;
		const name = p.finding?.componentName ?? ch.componentAlias;
		return `${name}.${ch.field}`;
	}
	if (ch.target === "walkthrough-step") {
		return `walkthrough ${ch.walkthroughId} step ${ch.stepIndex}.${ch.field}`;
	}
	if (ch.target === "relation") return `relation ${ch.relationId}.${ch.field}`;
	const name = p.finding?.componentName ?? ch.componentAlias;
	return `${name}.${ch.field}`;
}

/** Audit gap kinds an augmentation can close → the "now" state label. */
const UNCONFIRMED_LABEL: Record<string, string> = {
	construct_unconfirmed: "Construct unconfirmed",
	signature_unconfirmed: "Signature unconfirmed",
	topology_relation_unconfirmed: "Relation unconfirmed",
	topology_import_unconfirmed: "Import unconfirmed",
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
		case "relation":
			return "Relation unconfirmed";
		default:
			return "Unconfirmed";
	}
}

/** The state a change moves from. */
function nowState(p: SubsystemModelProposal, index: number): string {
	const ch = p.changes[index];
	if (ch?.target === "augmentation") {
		const kind = p.finding?.kind;
		return (kind && UNCONFIRMED_LABEL[kind]) || unconfirmedLabel(ch.field);
	}
	return formatValue(p.preview[index]?.before);
}

/** The state a change moves to. */
function afterState(p: SubsystemModelProposal, index: number): string {
	const row = p.preview[index];
	if (p.changes[index]?.target === "augmentation") {
		return `Verified${row?.after ? ` as ${formatValue(row.after)}` : ""}`;
	}
	return formatValue(row?.after);
}

const COPY_FEEDBACK_MS = 1500;

/**
 * Build a paste-ready brief for an agent explaining a proposal and why its
 * Jev second opinion came back low (uncertain / inaccurate / errored).
 */
function buildAgentPrompt(p: SubsystemModelProposal, title?: string): string {
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
		if (p.finding.relationId) lines.push(`Relation: ${p.finding.relationId}`);
		if (p.finding.walkthroughId) {
			lines.push(
				`Walkthrough: ${p.finding.walkthroughId}${
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

function opinionBadge(
	opinion: NonNullable<SubsystemModelProposal["secondOpinion"]>,
	colors: { success?: string; error?: string; textSecondary?: string },
	muted: string,
): { text: string; color: string } {
	if (opinion.error) {
		return { text: `Second opinion unavailable — ${opinion.error}`, color: colors.error ?? "#e5534b" };
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
	const extra = opinion.changeKind ? ` · ${opinion.changeKind}` : "";
	return { text: `Second opinion · ${label} ${pct}%${extra}`, color };
}

export function ProposalsModal({
	graphId,
	title,
	lane,
	onClose,
}: {
	graphId: string;
	title?: string;
	/** Show only proposals in this verification lane (all lanes when unset). */
	lane?: SubsystemVerificationLane;
	onClose: () => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [proposals, setProposals] = useState<SubsystemModelProposal[] | null>(
		null,
	);
	const [error, setError] = useState<string | null>(null);
	// Model components by alias — powers the node preview next to a proposal.
	const [componentsByAlias, setComponentsByAlias] = useState<
		Map<string, SubsystemComponent> | null
	>(null);
	// Per-card busy state so acting on one proposal never clears another's
	// in-flight indicator.
	const [busy, setBusy] = useState<Record<string, "accept" | "reject" | "scoring">>({});
	const [notice, setNotice] = useState<
		{ kind: "accepted" | "rejected"; changeCount: number } | null
	>(null);
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Escape dismisses the modal.
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onClose();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onClose]);

	const onCopyForAgent = useCallback(
		async (p: SubsystemModelProposal) => {
			try {
				await navigator.clipboard.writeText(buildAgentPrompt(p, title));
				setCopiedId(p.id);
				if (copyTimer.current) clearTimeout(copyTimer.current);
				copyTimer.current = setTimeout(
					() => setCopiedId(null),
					COPY_FEEDBACK_MS,
				);
			} catch {
				// clipboard may be denied — fail quietly
			}
		},
		[title],
	);


	const refresh = useCallback(async () => {
		try {
			const res = await electrobun.rpc!.request.listSubsystemModelProposals({
				graphId,
				includeResolved: false,
			});
			if (!res.ok) {
				setError(res.error ?? "Failed to load proposals");
				setProposals([]);
				return [];
			}
			setError(null);
			const next = res.proposals ?? [];
			setProposals(next);
			return next;
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setProposals([]);
			return [];
		}
	}, [graphId]);

	/** Load the model once so a construct proposal can render its node. */
	const loadModel = useCallback(async () => {
		try {
			const res = await electrobun.rpc!.request.getSubsystemModel({ graphId });
			if (!res.ok || !res.graph) return;
			const map = new Map<string, SubsystemComponent>();
			for (const c of res.graph.components ?? []) map.set(c.alias, c);
			setComponentsByAlias(map);
		} catch {
			// Preview only — a missing model just hides the node.
		}
	}, [graphId]);

	useEffect(() => {
		void refresh();
		void loadModel();
	}, [refresh, loadModel]);

	useEffect(() => {
		return () => {
			if (closeTimer.current) clearTimeout(closeTimer.current);
			if (copyTimer.current) clearTimeout(copyTimer.current);
		};
	}, []);

	const scheduleClose = useCallback(
		(delayMs: number) => {
			if (closeTimer.current) clearTimeout(closeTimer.current);
			closeTimer.current = setTimeout(onClose, delayMs);
		},
		[onClose],
	);

	const onAccept = useCallback(
		async (proposalId: string) => {
			const target = proposals?.find((p) => p.id === proposalId);
			const changeCount =
				target?.changes.length ?? target?.preview.length ?? 0;
setBusy((prev) => ({ ...prev, [proposalId]: "accept" }));
			setNotice(null);
			setProposals((prev) =>
				(prev ?? []).filter((p) => p.id !== proposalId),
			);
			try {
				const res = await electrobun.rpc!.request.acceptSubsystemModelProposal({
					graphId,
					proposalId,
				});
				if (!res.ok) {
					const alreadyResolved =
						typeof res.error === "string" &&
						res.error.startsWith("proposal is already ");
					if (!alreadyResolved) {
						setError(res.error ?? "Accept failed");
						setProposals((prev) => {
							if (!target) return prev;
							const next = (prev ?? []).filter((p) => p.id !== proposalId);
							return [target, ...next];
						});
						return;
					}
				}
				const applied = res.proposal?.changes.length ?? changeCount;
				setNotice({ kind: "accepted", changeCount: applied });
				const remaining = await refresh();
				if (remaining.length === 0) scheduleClose(1600);
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
				setProposals((prev) => {
					if (!target) return prev;
					const next = (prev ?? []).filter((p) => p.id !== proposalId);
					return [target, ...next];
				});
			} finally {
				setBusy((prev) => {
					const next = { ...prev };
					delete next[proposalId];
					return next;
				});
			}
		},
		[graphId, proposals, refresh, scheduleClose],
	);

	const onReject = useCallback(
		async (proposalId: string) => {
			const target = proposals?.find((p) => p.id === proposalId);
			const changeCount =
				target?.changes.length ?? target?.preview.length ?? 0;
			setBusy((prev) => ({ ...prev, [proposalId]: "reject" }));
			setNotice(null);
			try {
				const res = await electrobun.rpc!.request.rejectSubsystemModelProposal({
					graphId,
					proposalId,
				});
				if (!res.ok) {
					const alreadyResolved =
						typeof res.error === "string" &&
						res.error.startsWith("proposal is already ");
					if (!alreadyResolved) {
						setError(res.error ?? "Reject failed");
						return;
					}
				}
				const discarded = res.proposal?.changes.length ?? changeCount;
				setNotice({ kind: "rejected", changeCount: discarded });
				const remaining = await refresh();
				if (remaining.length === 0) scheduleClose(1600);
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			} finally {
				setBusy((prev) => {
					const next = { ...prev };
					delete next[proposalId];
					return next;
				});
			}
		},
		[graphId, proposals, refresh, scheduleClose],
	);

	const onScore = useCallback(
		async (proposalId: string) => {
			setBusy((prev) => ({ ...prev, [proposalId]: "scoring" }));
			setError(null);
			try {
				const res = await electrobun.rpc!.request.scoreSubsystemModelProposal({
					graphId,
					proposalId,
				});
				if (!res.ok) {
					setError(res.error ?? "Second-opinion scoring failed");
					return;
				}
				await refresh();
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			} finally {
				setBusy((prev) => {
					const next = { ...prev };
					delete next[proposalId];
					return next;
				});
			}
		},
		[graphId, refresh],
	);

	// Lane-scoped view (when opened from a lane badge), otherwise all proposals.
	const shown = (proposals ?? []).filter((p) => !lane || p.lane === lane);

	return (
		<Modal
			ariaLabel="Correction proposals"
			width={640}
			onClose={onClose}
		>
			<ModalHeader title="Proposed corrections" onClose={onClose} />
			<ModalBody>
				{error && (
					<p
						style={{
							margin: "0 0 12px",
							color: theme.colors.error ?? "#e5534b",
							fontSize: theme.fontSizes[0],
						}}
					>
						{error}
					</p>
				)}

				{notice && (
					<p
						role="status"
						style={{
							margin: "0 0 12px",
							padding: "8px 12px",
							borderRadius: 8,
							border: `1px solid ${
								notice.kind === "accepted"
									? (theme.colors.success ?? "#2da44e")
									: theme.colors.border
							}`,
							background:
								notice.kind === "accepted"
									? "rgba(45, 164, 78, 0.10)"
									: theme.colors.background,
							color:
								notice.kind === "accepted"
									? (theme.colors.success ?? "#2da44e")
									: muted,
							fontSize: theme.fontSizes[1],
							lineHeight: 1.5,
						}}
					>
						{notice.kind === "accepted"
							? `Accepted — applied ${notice.changeCount} change${notice.changeCount === 1 ? "" : "s"}. Closing…`
							: `Rejected — discarded ${notice.changeCount} change${notice.changeCount === 1 ? "" : "s"}. Closing…`}
					</p>
				)}

				{proposals === null && (
					<p style={{ color: muted, fontSize: theme.fontSizes[1] }}>Loading…</p>
				)}

				{proposals && shown.length === 0 && (
					<p style={{ color: muted, fontSize: theme.fontSizes[1] }}>
						{lane ? "No pending proposals in this lane." : "No pending proposals."}
					</p>
				)}

				<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
					{shown.map((p) => {
						const cardAction = busy[p.id];
						const cardBusy = cardAction != null;
						const accepting = cardAction === "accept";
						const rejecting = cardAction === "reject";
						const LaneIcon = p.lane ? LANE_ICON[p.lane] : null;
						const previewAlias = proposalComponentAlias(p);
						const previewComponent =
							componentsByAlias && previewAlias
								? (componentsByAlias.get(previewAlias) ?? null)
								: null;
						const showNode = p.lane === "construct" && previewComponent != null;
						return (
							<article
								key={p.id}
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
										gap: 12,
										alignItems: "flex-start",
										marginBottom: 10,
									}}
								>
									<div style={{ flex: 1, minWidth: 0 }}>
										<div
											style={{
												display: "flex",
												alignItems: "center",
												gap: 6,
												marginBottom: 3,
												fontSize: theme.fontSizes[0],
												color: muted,
											}}
										>
											{LaneIcon && (
												<LaneIcon size={12} style={{ flexShrink: 0 }} />
											)}
											<span style={{ whiteSpace: "nowrap" }}>
												{[
													p.lane ? LANE_LABEL[p.lane] : null,
													agentLabel(p.author),
												]
													.filter(Boolean)
													.join(" · ")}
											</span>
											<span
												title={
													updatesModel(p)
														? "Accepting rewrites this model's JSON."
														: "Accepting writes a verification record to the augmentation store. The model JSON is not changed."
												}
												style={{
													flexShrink: 0,
													padding: "1px 6px",
													borderRadius: 4,
													border: `1px solid ${
														updatesModel(p)
															? theme.colors.primary
															: theme.colors.border
													}`,
													color: updatesModel(p)
														? theme.colors.primary
														: muted,
													fontSize: theme.fontSizes[0],
													whiteSpace: "nowrap",
												}}
											>
												{updatesModel(p) ? "Model Change" : "Augmentation"}
											</span>
										</div>
										<div style={{ display: "flex", minWidth: 0 }}>
											<span
												title={p.id}
												style={{
													fontSize: theme.fontSizes[2],
													fontWeight: 600,
													minWidth: 0,
													overflow: "hidden",
													textOverflow: "ellipsis",
													whiteSpace: "nowrap",
												}}
											>
												{changeHeading(p)}
											</span>
										</div>
									</div>
									{showNode && previewComponent && (
										<div style={{ flexShrink: 0 }}>
											<ComponentNodePreview component={previewComponent} />
										</div>
									)}
								</div>

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
														fontSize: theme.fontSizes[0],
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

								{p.finding?.message && (
									<p
										style={{
											margin: "0 0 10px",
											fontSize: theme.fontSizes[0],
											color: muted,
											lineHeight: 1.45,
										}}
									>
										Audit · {p.finding.message}
									</p>
								)}

								<div style={{ margin: "0 0 10px" }}>
									<div
										style={{
											fontSize: theme.fontSizes[1],
											fontWeight: 600,
											marginBottom: 4,
										}}
									>
										Why
									</div>
									<DocumentView
										content={p.rationale || "_(none)_"}
										theme={theme}
										transparentBackground
										maxWidth="100%"
										enableKeyboardScrolling={false}
										autoFocusOnVisible={false}
									/>
								</div>

								{p.secondOpinion ? (
									<p
										title={`Jev ${p.secondOpinion.source} · ${p.secondOpinion.checkedAt}${p.secondOpinion.risk ? ` · risk ${p.secondOpinion.risk}` : ""}${p.secondOpinion.error ? ` · ${p.secondOpinion.error}` : ""}`}
										style={{
											margin: "0 0 12px",
											fontSize: theme.fontSizes[0],
											color: opinionBadge(p.secondOpinion, theme.colors, muted).color,
											lineHeight: 1.45,
										}}
									>
										{opinionBadge(p.secondOpinion, theme.colors, muted).text}
									</p>
								) : null}

								<div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
									<button
										type="button"
										onClick={() => void onCopyForAgent(p)}
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
										{copiedId === p.id ? (
											<Check size={12} />
										) : (
											<Copy size={12} />
										)}
										{copiedId === p.id ? "Copied" : "Copy for agent"}
									</button>
									{(!p.secondOpinion || p.secondOpinion.error) && (
										<button
											type="button"
											disabled={cardBusy}
											onClick={() => void onScore(p.id)}
											title="Ask Jev for a second opinion without accepting"
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
											{cardAction === "scoring" && (
												<Loader2 size={12} className="principal-studio-spin" />
											)}
											{cardAction === "scoring" ? "Scoring…" : p.secondOpinion?.error ? "Retry scoring" : "Get second opinion"}
										</button>
									)}
									<button
										type="button"
										disabled={cardBusy}
										onClick={() => void onReject(p.id)}
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
										onClick={() => void onAccept(p.id)}
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
					})}
				</div>
			</ModalBody>
		</Modal>
	);
}

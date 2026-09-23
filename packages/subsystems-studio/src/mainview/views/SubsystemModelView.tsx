/**
 * SubsystemModelView — renders a persisted subsystem component graph in a tab.
 *
 * Fetches the graph from the host via `getSubsystemModel` RPC and renders it
 * using `SubsystemComponentGraph` from @principal-ai/subsystems-react.
 * Reloads when the host pushes `subsystemModelChanged` for this graphId
 * (store write or disk watch) and when `tabsChanged` fires.
 * "Edit in Excalidraw" fades an editable drawing over the same pane.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { PenTool, X } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import {
	SubsystemComponentGraph,
	deriveGraphEdges,
	PierreFileView,
	PierreSnippetView,
	PierreWalkthroughCodeView,
	type SubsystemDiagnostic,
	type SubsystemIssue,
	type SubsystemIssueCategory,
	type SubsystemOpenFileOptions,
	type WalkthroughViewerContext,
} from "@principal-ai/subsystems-react";
import { electrobun, reloadSubscribers, subsystemModelChangeSubscribers } from "../rpc";
import { CenteredMessage } from "../ui";
import {
	auditReportToIssues,
	diagnosticIssueCount,
	diagnosticStatus,
} from "../subsystemIssues";
import { SubsystemExcalidrawOverlay } from "../components/SubsystemExcalidrawOverlay";
import type { ExcalidrawSelectionInfo } from "../excalidraw/excalidrawToSubsystem";
import type {
	StoredSubsystemModel,
	StudioMessages,
	SubsystemModelAuditReport,
	SubsystemWalkthrough,
} from "../../shared/contract";

// Disabled for now — Excalidraw edits don't save back to the store yet
// (excalidrawSceneToSubsystemModel exists but nothing wires it up), so the
// editor is a dead end. Flip this on once save-back lands.
const SHOW_EXCALIDRAW_EDIT = false;

/** Placeholder graph for mapping before the model loads (never rendered). */
const EMPTY_MODEL = {
	components: [],
	relations: [],
} as unknown as StoredSubsystemModel;

export function SubsystemModelView({
	tabId,
	graphId,
	focusWalkthroughId,
	showIssues: showIssuesOnOpen,
	focusIssueCategory,
}: {
	tabId: string;
	graphId: string;
	/** Walkthrough to select on mount (opened from a row in the list). */
	focusWalkthroughId?: string;
	/** Open the sidebar's issues view on mount (opened from a row in the list). */
	showIssues?: boolean;
	/** With `showIssues`, land focused on this verification layer. */
	focusIssueCategory?: string;
}) {
	const { theme } = useTheme();
	const [graph, setGraph] = useState<StoredSubsystemModel | null | undefined>(undefined);
	const [excalidrawOpen, setExcalidrawOpen] = useState(false);
	const [selection, setSelection] = useState<ExcalidrawSelectionInfo | null>(null);
	const [auditReport, setAuditReport] = useState<SubsystemModelAuditReport | null>(null);
	const [auditStale, setAuditStale] = useState(false);
	/** Diagnostics list shown in the sidebar (toggled by the header chip).
	 *  Seeded open when the tab was opened with the issues view requested. */
	const [showIssues, setShowIssues] = useState(showIssuesOnOpen === true);

	const loadGraph = useCallback(() => {
		void electrobun.rpc!.request
			.getSubsystemModel({ graphId })
			.then((res) => {
				setGraph(res.ok && res.graph ? res.graph : null);
			})
			.catch(() => setGraph(null));
	}, [graphId]);

	// Flows panel drag-reorder: apply the new order optimistically so the panel
	// updates on drop, then persist. A failed write reloads the stored order;
	// a successful one also pushes a change event that reloads every surface.
	const onReorderWalkthroughs = useCallback(
		(next: SubsystemWalkthrough[]) => {
			setGraph((g) => (g ? { ...g, walkthroughs: next } : g));
			void electrobun.rpc!.request
				.updateSubsystemModel({ graphId, patch: { walkthroughs: next } })
				.then((res: { ok: boolean; error?: string }) => {
					if (!res.ok) loadGraph();
				})
				.catch(() => loadGraph());
		},
		[graphId, loadGraph],
	);

	const loadAudit = useCallback(() => {
		void electrobun.rpc!.request
			.getSubsystemModelAudit({ graphId })
			.then((res) => {
				setAuditReport(res.ok && res.report ? res.report : null);
				setAuditStale(res.stale === true);
			})
			.catch(() => {
				setAuditReport(null);
				setAuditStale(false);
			});
	}, [graphId]);

	useEffect(() => {
		loadGraph();
		loadAudit();
		reloadSubscribers.add(loadGraph);
		return () => {
			reloadSubscribers.delete(loadGraph);
		};
	}, [loadGraph, loadAudit]);

	useEffect(() => {
		const onPush = (payload: StudioMessages["subsystemModelChanged"]) => {
			if (payload.graphId === graphId) {
				loadGraph();
				loadAudit();
			}
		};
		subsystemModelChangeSubscribers.add(onPush);
		return () => {
			subsystemModelChangeSubscribers.delete(onPush);
		};
	}, [graphId, loadGraph, loadAudit]);

	// A reopen of an already-mounted tab (fast path in the host) updates the
	// tab's focus fields and re-broadcasts, but the mount-time seeds above
	// don't re-run. Apply a requested issues focus when the props change so
	// clicking a lane badge on an open model actually moves the sidebar.
	useEffect(() => {
		if (showIssuesOnOpen) setShowIssues(true);
	}, [showIssuesOnOpen, focusIssueCategory]);

	const readFile = useCallback(
		(path: string, purl?: string) =>
			electrobun.rpc!.request
				.readFile({ tabId, path, ...(purl ? { repo: purl } : {}) })
				.then((res) => {
					if (res.ok && res.content != null) return res.content;
					throw new Error(res.error ?? "Failed to read file");
				}),
		[tabId],
	);

	const renderFileViewer = useCallback(
		(file: string, opts?: SubsystemOpenFileOptions) => {
			const startLine = opts?.startLine;
			if (startLine != null && !opts?.fullFile) {
				return (
					<PierreSnippetView
						filePath={file}
						fileName={file.split("/").pop() ?? file}
						startLine={startLine}
						endLine={startLine}
						focusLine={startLine}
						contextLines={40}
						readFile={readFile}
					/>
				);
			}
			return (
				<PierreFileView
					filePath={file}
					fileName={file.split("/").pop() ?? file}
					readFile={readFile}
					focusLine={opts?.fullFile ? startLine : undefined}
				/>
			);
		},
		[readFile],
	);

	const renderWalkthroughViewer = useCallback(
		({
			walkthrough,
			stepIndex,
			onOpenFile,
			proposedAliases,
		}: WalkthroughViewerContext) => (
			<PierreWalkthroughCodeView
				walkthrough={walkthrough}
				stepIndex={stepIndex}
				readFile={readFile}
				contextLines={8}
				onOpenFile={onOpenFile}
				proposedAliases={proposedAliases}
			/>
		),
		[readFile],
	);

	// Chip: toggle the diagnostics list. Findings come from the persisted audit
	// report (kept fresh by the regular-audit pass and model-change broadcasts);
	// there is no separate on-demand audit here — Run maintenance audits.
	const onDiagnosticToggle = useCallback(() => {
		setShowIssues((v) => !v);
	}, []);

	const { issues: auditIssues, byId: auditFindingById } = useMemo(
		() => auditReportToIssues(auditReport, graph ?? EMPTY_MODEL),
		[auditReport, graph],
	);

	const diagnostic: SubsystemDiagnostic = {
		status: diagnosticStatus(auditReport),
		issueCount: diagnosticIssueCount(auditReport),
		stale: auditStale,
		onToggle: onDiagnosticToggle,
	};

	const onApplyIssueFix = useCallback(
		(issue: SubsystemIssue) => {
			const finding = auditFindingById.get(issue.id);
			const fixId = finding?.fix?.id;
			if (!fixId) return;
			void electrobun.rpc!.request
				.applySubsystemModelAuditFix({
					graphId,
					fixId,
					componentAlias: finding?.componentAlias,
				})
				.then((res) => {
					if (res.ok && res.report) setAuditReport(res.report);
				})
				.catch(() => {
					/* best-effort — the next audit refresh reconciles */
				});
		},
		[auditFindingById, graphId],
	);

	if (graph === undefined) {
		return <CenteredMessage title="Loading subsystem graph..." />;
	}

	if (graph === null) {
		return <CenteredMessage title="Graph not found" detail={graphId} />;
	}

	return (
		<div
			style={{
				position: "relative",
				width: "100%",
				height: "100%",
				background: theme.colors.background,
			}}
		>
			<SubsystemComponentGraph
				components={graph.components}
				relations={graph.relations}
				walkthroughs={graph.walkthroughs}
				persistKey={graphId}
				onReorderWalkthroughs={onReorderWalkthroughs}
				initialWalkthroughId={focusWalkthroughId}
				title={graph.title}
				description={graph.description}
				renderFileViewer={renderFileViewer}
				renderWalkthroughViewer={renderWalkthroughViewer}
				diagnostic={diagnostic}
				issues={auditIssues}
				showIssues={showIssues}
				focusIssueCategory={focusIssueCategory as SubsystemIssueCategory | undefined}
				onApplyIssueFix={onApplyIssueFix}
				sidebarAfterDescription={
					excalidrawOpen ? <SelectionInspector selection={selection} /> : undefined
				}
				sidebarExtra={
					excalidrawOpen ? (
						<button
							type="button"
							onClick={() => setExcalidrawOpen(false)}
							style={{
								display: "inline-flex",
								alignItems: "center",
								gap: 6,
								padding: "6px 12px",
								borderRadius: 6,
								border: `1px solid ${theme.colors.border ?? "#333"}`,
								background: theme.colors.background,
								color: theme.colors.text,
								fontSize: theme.fontSizes[1],
								fontFamily: theme.fonts.monospace,
								cursor: "pointer",
								alignSelf: "flex-start",
							}}
						>
							<X size={14} />
							Back to graph
						</button>
					) : undefined
				}
				canvasOverlay={
					<>
						{SHOW_EXCALIDRAW_EDIT && !excalidrawOpen && (
							<button
								type="button"
								onClick={() => setExcalidrawOpen(true)}
								style={{
									position: "absolute",
									top: 12,
									right: 12,
									zIndex: 10,
									display: "inline-flex",
									alignItems: "center",
									gap: 6,
									padding: "6px 12px",
									borderRadius: 6,
									border: `1px solid ${theme.colors.border ?? "#333"}`,
									background: theme.colors.background,
									color: theme.colors.text,
									fontSize: theme.fontSizes[1],
									fontFamily: theme.fonts.monospace,
									cursor: "pointer",
									boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
								}}
							>
								<PenTool size={14} />
								Edit in Excalidraw
							</button>
						)}
						<SubsystemExcalidrawOverlay
							open={excalidrawOpen}
							title={graph.title}
							components={graph.components}
							edges={deriveGraphEdges({
								relations: graph.relations,
								walkthroughs: graph.walkthroughs,
							})}
							onSelectionChange={setSelection}
						/>
					</>
				}
			/>
		</div>
	);
}

const INSPECTOR_KEYS = [
	"construct",
	"symbol",
	"file",
	"purl",
	"purpose",
	"role",
	"proposed",
	"layer",
	"mechanism",
	"from",
	"to",
	"refs",
	"id",
] as const;

function formatValue(value: unknown): string {
	if (Array.isArray(value)) return value.map((v) => String(v)).join(", ");
	if (value === undefined || value === null || value === "") return "";
	return String(value);
}

function SelectionInspector({ selection }: { selection: ExcalidrawSelectionInfo | null }) {
	const { theme } = useTheme();
	if (!selection) return null;

	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const principal = selection.principal;
	const kind =
		principal?.["type"] === "subsystem-edge"
			? "edge"
			: principal?.["type"] === "subsystem-component"
				? "component"
				: selection.elementType;

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
			<span
				style={{
					fontSize: theme.fontSizes[0],
					fontFamily: theme.fonts.monospace,
					textTransform: "uppercase",
					color: muted,
					fontWeight: 600,
				}}
			>
				Selected
			</span>
			{selection.count > 1 ? (
				<span style={{ fontSize: theme.fontSizes[1], color: theme.colors.text }}>
					{selection.count} shapes
				</span>
			) : (
				<>
					<div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
						<span
							style={{
								fontSize: theme.fontSizes[2],
								fontWeight: 600,
								color: theme.colors.text,
								wordBreak: "break-word",
							}}
						>
							{selection.label}
						</span>
						<span
							style={{
								fontSize: theme.fontSizes[0],
								fontFamily: theme.fonts.monospace,
								textTransform: "uppercase",
								color: muted,
							}}
						>
							{kind}
						</span>
					</div>
					{principal ? (
						<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
							{INSPECTOR_KEYS.map((key) => {
								const raw = principal[key];
								const text = formatValue(raw);
								if (!text) return null;
								if (key === "symbol" && text === selection.label) return null;
								return (
									<div
										key={key}
										style={{
											display: "flex",
											flexDirection: "column",
											gap: 1,
										}}
									>
										<span
											style={{
												fontSize: theme.fontSizes[0],
												fontFamily: theme.fonts.monospace,
												textTransform: "uppercase",
												color: muted,
											}}
										>
											{key}
										</span>
										<span
											style={{
												fontSize: theme.fontSizes[0],
												fontFamily: theme.fonts.monospace,
												color: theme.colors.text,
												wordBreak: "break-word",
											}}
										>
											{text}
										</span>
									</div>
								);
							})}
						</div>
					) : (
						<span style={{ fontSize: theme.fontSizes[0], color: muted }}>
							No hidden properties on this shape.
						</span>
					)}
				</>
			)}
		</div>
	);
}

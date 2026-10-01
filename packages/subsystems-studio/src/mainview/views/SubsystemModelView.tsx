/**
 * SubsystemModelView — renders a persisted subsystem component graph in a tab.
 *
 * Fetches the graph from the host via `getSubsystemModel` RPC and renders it
 * using `SubsystemComponentGraph` from @principal-ai/subsystems-react.
 * Reloads when the host pushes `subsystemModelChanged` for this graphId
 * (store write or disk watch) and when `tabsChanged` fires.
 * "Edit in Excalidraw" fades an editable drawing over the same pane.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PenTool, X } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import {
	SubsystemComponentGraph,
	deriveGraphEdges,
	PierreFileView,
	PierreSnippetView,
	PierreTrailCodeView,
	type DeclarationSymbolRef,
	type SubsystemDiagnostic,
	type SubsystemIssue,
	type SubsystemIssueCategory,
	type SubsystemOpenFileOptions,
	type SubsystemAgent,
	type SymbolInspection,
	type TrailViewerContext,
} from "@principal-ai/subsystems-react";
import { electrobun, maintainLivePanelSubscribers, opencodeLiveFeedSubscribers, reloadSubscribers, subsystemModelChangeSubscribers, subsystemModelMaintainChangeSubscribers } from "../rpc";
import { CenteredMessage } from "../ui";
import {
	auditReportToIssues,
	diagnosticIssueCount,
	diagnosticStatus,
} from "../subsystemIssues";
import { SubsystemExcalidrawOverlay } from "../components/SubsystemExcalidrawOverlay";
import { useMaintainLiveFeed } from "../useMaintainLiveFeed";
import type { ExcalidrawSelectionInfo } from "../excalidraw/excalidrawToSubsystem";
import type {
	StoredSubsystemModel,
	StudioMessages,
	SubsystemModelAuditReport,
	SubsystemTrail,
} from "../../shared/contract";

// Disabled for now — Excalidraw edits don't save back to the store yet
// (excalidrawSceneToSubsystemModel exists but nothing wires it up), so the
// editor is a dead end. Flip this on once save-back lands.
const SHOW_EXCALIDRAW_EDIT = false;

/** Placeholder graph for mapping before the model loads (never rendered). */
const EMPTY_MODEL = {
	components: [],
} as unknown as StoredSubsystemModel;

/**
 * The Maintain pipeline, in routing-priority order (hard failures before
 * unconfirmed claims; construct → static topology → dynamic topology within
 * each tier). Static topology is package/module containment (the
 * `package-module-*` agents); dynamic topology is process runtime (the
 * `runtime-topology-verifier`). The sidebar's Agents tab lists these and lets
 * the router's next stage run.
 */
const MAINTAIN_AGENTS: SubsystemAgent[] = [
	{ id: "construct-fixer", label: "construct-fixer", lane: "construct", mode: "issues" },
	{ id: "package-module-fixer", label: "package-module-fixer", lane: "static-topology", mode: "issues" },
	{ id: "construct-verifier", label: "construct-verifier", lane: "construct", mode: "verify" },
	{ id: "package-module-verifier", label: "package-module-verifier", lane: "static-topology", mode: "verify" },
	{ id: "runtime-topology-verifier", label: "runtime-topology-verifier", lane: "dynamic-topology", mode: "verify" },
];

export function SubsystemModelView({
	tabId,
	graphId,
	focusTrailId,
	showIssues: showIssuesOnOpen,
	focusIssueCategory,
	liveSessionId,
	liveTitle,
	liveAgent,
}: {
	tabId: string;
	graphId: string;
	/** Trail to select on mount (opened from a row in the list). */
	focusTrailId?: string;
	/** Open the sidebar's issues view on mount (opened from a row in the list). */
	showIssues?: boolean;
	/** With `showIssues`, land focused on this verification layer. */
	focusIssueCategory?: string;
	/** Live Maintain session whose collapsible event panel overlays the graph. */
	liveSessionId?: string;
	liveTitle?: string;
	liveAgent?: string;
}) {
	const { theme } = useTheme();
	const [graph, setGraph] = useState<StoredSubsystemModel | null | undefined>(undefined);
	const [excalidrawOpen, setExcalidrawOpen] = useState(false);
	const [selection, setSelection] = useState<ExcalidrawSelectionInfo | null>(null);
	const [auditReport, setAuditReport] = useState<SubsystemModelAuditReport | null>(null);
	const [auditStale, setAuditStale] = useState(false);
	/** Diagnostics list shown in the sidebar (toggled by the header chip).
	 *  Seeded open when the tab was opened with the issues view requested, else
	 *  restored from the last state for this model (survives tab away/back). */
	const issuesViewKey = `principal.studio.modelIssuesView.${graphId}`;
	const [showIssues, setShowIssues] = useState(() => {
		if (showIssuesOnOpen) return true;
		try {
			return window.localStorage.getItem(issuesViewKey) === "1";
		} catch {
			return false;
		}
	});
	/** Live Maintain events panel over the graph (opened from the live strip). */
	const [livePanel, setLivePanel] = useState<{
		sessionId: string;
		title?: string;
		agent?: string;
	} | null>(null);
	const liveFeed = useMaintainLiveFeed(livePanel?.sessionId);
	/** Latest panel target, readable from the feed broadcasts without restaling. */
	const livePanelRef = useRef(livePanel);
	livePanelRef.current = livePanel;
	/** Router's next Maintain stage (Agents tab) + whether a run is in flight. */
	const [nextAgentId, setNextAgentId] = useState<string | null>(null);
	const [runBusy, setRunBusy] = useState(false);
	/** A run was started from the sidebar; open the panel on its first feed. */
	const awaitingRunRef = useRef(false);

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
	const onReorderTrails = useCallback(
		(next: SubsystemTrail[]) => {
			setGraph((g) => (g ? { ...g, trails: next } : g));
			void electrobun.rpc!.request
				.updateSubsystemModel({ graphId, patch: { trails: next } })
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

	const loadNextAgent = useCallback(() => {
		void electrobun.rpc!.request
			.getSubsystemModelNextRoute({ graphId })
			.then((res) => setNextAgentId(res.ok && res.next ? res.next.agent : null))
			.catch(() => setNextAgentId(null));
	}, [graphId]);

	/** Run the router's next Maintain stage for this model. */
	const runNextAgent = useCallback(() => {
		setRunBusy(true);
		awaitingRunRef.current = true;
		void electrobun.rpc!.request
			.maintainSubsystemModel({ graphId })
			.then((res) => {
				if (!res.ok || res.started === false) {
					awaitingRunRef.current = false;
					if (!res.alreadyRunning) setRunBusy(false);
				}
			})
			.catch(() => {
				awaitingRunRef.current = false;
				setRunBusy(false);
			});
	}, [graphId]);

	useEffect(() => {
		loadGraph();
		loadAudit();
		loadNextAgent();
		reloadSubscribers.add(loadGraph);
		return () => {
			reloadSubscribers.delete(loadGraph);
		};
	}, [loadGraph, loadAudit, loadNextAgent]);

	useEffect(() => {
		const onPush = (payload: StudioMessages["subsystemModelChanged"]) => {
			if (payload.graphId === graphId) {
				loadGraph();
				loadAudit();
				loadNextAgent();
			}
		};
		subsystemModelChangeSubscribers.add(onPush);
		return () => {
			subsystemModelChangeSubscribers.delete(onPush);
		};
	}, [graphId, loadGraph, loadAudit, loadNextAgent]);

	// Maintain run lifecycle: reflect busy state; when it finishes, the audit and
	// the router's next stage change — refresh both.
	useEffect(() => {
		const onPush = (payload: StudioMessages["subsystemModelMaintainChanged"]) => {
			if (payload.graphId !== graphId) return;
			if (payload.status === "running") {
				setRunBusy(true);
				return;
			}
			setRunBusy(false);
			loadAudit();
			loadNextAgent();
		};
		subsystemModelMaintainChangeSubscribers.add(onPush);
		return () => {
			subsystemModelMaintainChangeSubscribers.delete(onPush);
		};
	}, [graphId, loadAudit, loadNextAgent]);

	// Open / retarget the live panel from the graph's feed. A run starts on a
	// placeholder session id (`pending-…`) and only gets the real id once the
	// server session exists, so a panel latched onto the placeholder must follow
	// it to the real session (otherwise no events ever arrive until remount).
	useEffect(() => {
		const onPush = (payload: StudioMessages["opencodeLiveFeedChanged"]) => {
			if (payload.graphId !== graphId) return;
			const isActive = payload.status === "running" || payload.status === "starting";
			const current = livePanelRef.current;
			const followingPlaceholder =
				current?.sessionId.startsWith("pending-") === true;
			if (!awaitingRunRef.current && !followingPlaceholder) return;
			if (!isActive) return;
			const isPlaceholder = payload.sessionId.startsWith("pending-");
			if (!isPlaceholder) awaitingRunRef.current = false;
			setLivePanel({
				sessionId: payload.sessionId,
				title: payload.title,
				agent: payload.agent,
			});
		};
		opencodeLiveFeedSubscribers.add(onPush);
		return () => {
			opencodeLiveFeedSubscribers.delete(onPush);
		};
	}, [graphId]);

	// Restore run state when the tab remounts (payload tabs unmount when you
	// switch away): if a Maintain run is still in flight, re-mark busy and
	// reopen the live panel for its session.
	useEffect(() => {
		let cancelled = false;
		void electrobun.rpc!.request
			.getMaintainRunState({ graphId })
			.then((res) => {
				if (cancelled || !res.ok) return;
				setRunBusy(res.running);
				if (res.running && res.sessionId) {
					setLivePanel({
						sessionId: res.sessionId,
						title: res.title,
						agent: res.agent,
					});
				}
			})
			.catch(() => {
				/* best-effort — the live push will correct it */
			});
		return () => {
			cancelled = true;
		};
	}, [graphId]);

	// A reopen of an already-mounted tab (fast path in the host) updates the
	// tab's focus fields and re-broadcasts, but the mount-time seeds above
	// don't re-run. Apply a requested issues focus when the props change so
	// clicking a lane badge on an open model actually moves the sidebar.
	useEffect(() => {
		if (showIssuesOnOpen) setShowIssues(true);
	}, [showIssuesOnOpen, focusIssueCategory]);

	// Persist the diagnostics open state per model so returning to the tab
	// lands back on the Issues/Agents view instead of the files tree.
	useEffect(() => {
		try {
			window.localStorage.setItem(issuesViewKey, showIssues ? "1" : "0");
		} catch {
			/* best-effort */
		}
	}, [issuesViewKey, showIssues]);

	// Live Maintain panel: seed from the tab fields (covers a fresh mount) …
	useEffect(() => {
		if (!liveSessionId) return;
		setLivePanel({
			sessionId: liveSessionId,
			title: liveTitle,
			agent: liveAgent,
		});
	}, [liveSessionId, liveTitle, liveAgent]);

	// … and update in place when the live strip retargets an already-mounted tab
	// (the host pushes `maintainLivePanelChanged`, which the tab field can't
	// deliver without a getTab round-trip).
	useEffect(() => {
		const onPush = (payload: StudioMessages["maintainLivePanelChanged"]) => {
			if (payload.graphId !== graphId) return;
			setLivePanel({
				sessionId: payload.sessionId,
				title: payload.title,
				agent: payload.agent,
			});
		};
		maintainLivePanelSubscribers.add(onPush);
		return () => {
			maintainLivePanelSubscribers.delete(onPush);
		};
	}, [graphId]);

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

	// Referenced-symbol click in the declaration panel → resolve it against the
	// host's graphify cache for the component's repo (display-only).
	const onInspectSymbol = useCallback(
		(req: {
			purl: string;
			file: string;
			symbol: string;
			ref: DeclarationSymbolRef;
		}): Promise<SymbolInspection> =>
			electrobun.rpc!.request.inspectSubsystemSymbol({
				purl: req.purl,
				file: req.file,
				symbol: req.symbol,
				nodeId: req.ref.nodeId,
			}),
		[],
	);

	const renderTrailViewer = useCallback(
		({
			trail,
			stepIndex,
			onOpenFile,
			proposedAliases,
			resolveSymbol,
			onSymbolClick,
			onVisibleStepChange,
		}: TrailViewerContext) => (
			<PierreTrailCodeView
				trail={trail}
				stepIndex={stepIndex}
				readFile={readFile}
				contextLines={8}
				onOpenFile={onOpenFile}
				proposedAliases={proposedAliases}
				resolveSymbol={resolveSymbol}
				onSymbolClick={onSymbolClick}
				onVisibleStepChange={onVisibleStepChange}
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
				trails={graph.trails}
				persistKey={graphId}
				onReorderTrails={onReorderTrails}
				initialTrailId={focusTrailId}
				title={graph.title}
				description={graph.description}
				renderFileViewer={renderFileViewer}
				renderTrailViewer={renderTrailViewer}
				onInspectSymbol={onInspectSymbol}
				diagnostic={diagnostic}
				issues={auditIssues}
				showIssues={showIssues}
				focusIssueCategory={focusIssueCategory as SubsystemIssueCategory | undefined}
				onApplyIssueFix={onApplyIssueFix}
				liveEvents={
					livePanel
						? {
								title: livePanel.title,
								agent: livePanel.agent,
								sessionId: livePanel.sessionId,
								status: liveFeed.status,
								events: liveFeed.events,
								total: liveFeed.total,
								error: liveFeed.error,
							}
						: null
				}
				agentsPanel={{
					agents: MAINTAIN_AGENTS,
					nextAgentId,
					running: runBusy,
					onRun: runNextAgent,
				}}
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
								trails: graph.trails,
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

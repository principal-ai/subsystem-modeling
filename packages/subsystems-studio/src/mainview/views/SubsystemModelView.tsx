/**
 * SubsystemModelView — renders a persisted subsystem component graph in a tab.
 *
 * Fetches the graph from the host via `getSubsystemModel` RPC and renders it
 * using `SubsystemComponentGraph` from @principal-ai/subsystems-react.
 * Reloads when the host pushes `subsystemModelChanged` for this graphId
 * (store write or disk watch) and when `tabsChanged` fires.
 * "Edit in Excalidraw" fades an editable drawing over the same pane.
 */

import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, Loader2, PenTool, X } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import {
	SubsystemComponentGraph,
	deriveGraphEdges,
	PierreFileView,
	PierreSnippetView,
	PierreWalkthroughCodeView,
	type ComponentVerificationState,
	type SubsystemOpenFileOptions,
	type WalkthroughViewerContext,
} from "@principal-ai/subsystems-react";
import { electrobun, reloadSubscribers, subsystemModelChangeSubscribers } from "../rpc";
import { CenteredMessage } from "../ui";
import {
	AuditResultsModal,
	type AuditModalState,
} from "../components/AuditResultsModal";
import { runSubsystemModelAuditFlow } from "../auditSubsystemModelFlow";
import { SubsystemExcalidrawOverlay } from "../components/SubsystemExcalidrawOverlay";
import type { ExcalidrawSelectionInfo } from "../excalidraw/excalidrawToSubsystem";
import type {
	StoredSubsystemModel,
	StudioMessages,
} from "../../shared/contract";

// Disabled for now — Excalidraw edits don't save back to the store yet
// (excalidrawSceneToSubsystemModel exists but nothing wires it up), so the
// editor is a dead end. Flip this on once save-back lands.
const SHOW_EXCALIDRAW_EDIT = false;

export function SubsystemModelView({
	tabId,
	graphId,
}: {
	tabId: string;
	graphId: string;
}) {
	const { theme } = useTheme();
	const [graph, setGraph] = useState<StoredSubsystemModel | null | undefined>(undefined);
	const [excalidrawOpen, setExcalidrawOpen] = useState(false);
	const [selection, setSelection] = useState<ExcalidrawSelectionInfo | null>(null);
	const [verification, setVerification] = useState<ComponentVerificationState | null>(null);
	const [verifyComponentId, setVerifyComponentId] = useState<string | null>(null);
	const [auditBusy, setAuditBusy] = useState(false);
	const [auditModal, setAuditModal] = useState<AuditModalState | null>(null);

	const loadGraph = useCallback(() => {
		void electrobun.rpc!.request
			.getSubsystemModel({ graphId })
			.then((res) => {
				setGraph(res.ok && res.graph ? res.graph : null);
			})
			.catch(() => setGraph(null));
	}, [graphId]);

	useEffect(() => {
		loadGraph();
		reloadSubscribers.add(loadGraph);
		return () => {
			reloadSubscribers.delete(loadGraph);
		};
	}, [loadGraph]);

	useEffect(() => {
		const onPush = (payload: StudioMessages["subsystemModelChanged"]) => {
			if (payload.graphId === graphId) loadGraph();
		};
		subsystemModelChangeSubscribers.add(onPush);
		return () => {
			subsystemModelChangeSubscribers.delete(onPush);
		};
	}, [graphId, loadGraph]);

	const readFile = useCallback(
		(path: string) =>
			electrobun.rpc!.request
				.readFile({ tabId, path })
				.then((res) => {
					if (res.ok && res.content != null) return res.content;
					throw new Error(res.error ?? "Failed to read file");
				}),
		[tabId],
	);

	const renderFileViewer = useCallback(
		(file: string, opts?: SubsystemOpenFileOptions) => {
			const startLine = opts?.startLine;
			if (startLine != null) {
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
				/>
			);
		},
		[readFile],
	);

	const renderWalkthroughViewer = useCallback(
		({ walkthrough, stepIndex }: WalkthroughViewerContext) => (
			<PierreWalkthroughCodeView
				walkthrough={walkthrough}
				stepIndex={stepIndex}
				readFile={readFile}
				contextLines={8}
			/>
		),
		[readFile],
	);

	const onVerifyComponent = useCallback(
		async (componentId: string) => {
			setVerifyComponentId(componentId);
			setVerification({
				phase: "checking",
				message: "Checking filesystem + graphify cache…",
			});
			try {
				const result = await electrobun.rpc!.request.verifySubsystemComponent({
					graphId,
					componentId,
				});
				const structured =
					result.file != null ||
					result.cache != null ||
					result.anchor != null ||
					result.construct != null ||
					result.signature != null;
				if (!result.ok && !structured) {
					setVerification({
						phase: "error",
						ok: false,
						message: result.error ?? "Verification failed",
						code: result.code,
					});
					return;
				}
				setVerification({
					phase: "done",
					ok: result.ok,
					code: result.code,
					message: result.error,
					file: result.file
						? {
								exists: result.file.exists,
								symbolDeclared: result.file.symbolDeclared,
							}
						: undefined,
					cache: result.cache
						? { status: result.cache.status, purl: result.cache.purl }
						: undefined,
					anchor: result.anchor
						? {
								resolution: result.anchor.resolution,
								nodeId: result.anchor.nodeId,
								label: result.anchor.label,
								source_file: result.anchor.source_file,
								source_location: result.anchor.source_location,
								candidates: result.anchor.candidates,
							}
						: undefined,
					construct: result.construct
						? {
								claimed: result.construct.claimed,
								inferred: result.construct.inferred,
								match: result.construct.match,
								evidence: result.construct.evidence,
							}
						: undefined,
					signature: result.signature
						? {
								match: result.signature.match,
								skipped: result.signature.skipped,
								skipCode: result.signature.skipCode,
								reason: result.signature.reason,
								claimed: result.signature.claimed,
								inferred: result.signature.inferred,
								inlineParameters: result.signature.inferred.inlineParameters,
							}
						: undefined,
					declaration: result.declaration
						? {
								freshness: result.declaration.freshness,
								ref: result.declaration.ref
									? {
											startLine: result.declaration.ref.startLine,
											lineHash: result.declaration.ref.lineHash,
										}
									: undefined,
							}
						: undefined,
				});
				if (result.declaration?.ref) {
					setGraph((g) =>
						g
							? {
									...g,
									components: g.components.map((c) =>
										c.id === componentId
											? { ...c, declarationRef: result.declaration!.ref }
											: c,
									),
								}
							: g,
					);
				}
			} catch (err) {
				setVerification({
					phase: "error",
					ok: false,
					message: err instanceof Error ? err.message : String(err),
				});
			}
		},
		[graphId],
	);

	const onSelect = useCallback(
		(componentId: string) => {
			if (verifyComponentId && verifyComponentId !== componentId) {
				setVerifyComponentId(null);
				setVerification(null);
			}
		},
		[verifyComponentId],
	);

	const onAudit = useCallback(async () => {
		if (!graph || auditBusy) return;
		setAuditBusy(true);
		try {
			await runSubsystemModelAuditFlow(graphId, {
				graph,
				onModal: setAuditModal,
			});
		} finally {
			setAuditBusy(false);
		}
	}, [graph, graphId, auditBusy]);

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
				title={graph.title}
				description={graph.description}
				renderFileViewer={renderFileViewer}
				renderWalkthroughViewer={renderWalkthroughViewer}
				onSelect={onSelect}
				onVerifyComponent={(id) => void onVerifyComponent(id)}
				componentVerification={verification}
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
					) : (
						<button
							type="button"
							disabled={auditBusy}
							onClick={() => void onAudit()}
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
								cursor: auditBusy ? "default" : "pointer",
								opacity: auditBusy ? 0.7 : 1,
								alignSelf: "flex-start",
							}}
							title="Ensure graphify cache if needed, then run a dry-run audit"
						>
							{auditBusy ? (
								<Loader2 size={14} className="principal-studio-spin" />
							) : (
								<ClipboardCheck size={14} />
							)}
							{auditBusy ? "Auditing…" : "Audit"}
						</button>
					)
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
			{auditModal && (
				<AuditResultsModal
					state={auditModal}
					onClose={() => setAuditModal(null)}
					onReportChange={(report) => {
						setAuditModal({ phase: "done", report });
					}}
				/>
			)}
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
					fontSize: theme.fontSizes[0] * 0.8,
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
								fontSize: theme.fontSizes[0] * 0.8,
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
												fontSize: theme.fontSizes[0] * 0.8,
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

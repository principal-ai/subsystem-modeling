/**
 * SubsystemC4View — a stored subsystem model drawn as a C4 container diagram.
 *
 * The host does the projection (`getSubsystemC4Model`): accepted containers
 * when one claims a process key this model uses, otherwise provisional
 * containers derived from `process` keys. The React `C4ProjectionView` owns the
 * canvas, the trails sidebar, the construct drill-down, and open-container
 * state; this view only loads the projection and supplies the source chrome.
 *
 * Read-only. No promotion, no element editing: the accepted store stays the
 * verifier's, and a draft is a reading of the model, not a decision.
 */

import { useCallback, useEffect, useState } from "react";
import { Boxes, RefreshCw } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import { C4ProjectionView } from "@principal-ai/subsystems-react";
import { electrobun, subsystemModelChangeSubscribers } from "../rpc";
import { CenteredMessage } from "../ui";
import type {
	StoredSubsystemModel,
	SubsystemC4Projection,
	SubsystemC4Source,
} from "../../shared/contract";

export function SubsystemC4View({
	tabId,
	graphId,
	source: requestedSource,
}: {
	tabId: string;
	graphId: string;
	source?: SubsystemC4Source;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [projection, setProjection] = useState<SubsystemC4Projection | null>(null);
	const [graph, setGraph] = useState<StoredSubsystemModel | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const [c4, model] = await Promise.all([
				electrobun.rpc!.request.getSubsystemC4Model({
					graphId,
					source: requestedSource ?? "auto",
				}),
				electrobun.rpc!.request.getSubsystemModel({ graphId }),
			]);
			if (!c4.ok || !c4.projection) {
				setProjection(null);
				setGraph(null);
				setError(c4.error ?? "Could not build the C4 projection");
				return;
			}
			if (!model.ok || !model.graph) {
				setProjection(null);
				setGraph(null);
				setError(model.error ?? `Graph not found: ${graphId}`);
				return;
			}
			setProjection(c4.projection);
			setGraph(model.graph);
		} catch (err) {
			setProjection(null);
			setGraph(null);
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}, [graphId, requestedSource]);

	useEffect(() => {
		void load();
	}, [load]);

	// A store write or disk watch for this model invalidates the projection.
	useEffect(() => {
		const onChange = (payload: { graphId: string }) => {
			if (payload.graphId === graphId) void load();
		};
		subsystemModelChangeSubscribers.add(onChange);
		return () => {
			subsystemModelChangeSubscribers.delete(onChange);
		};
	}, [graphId, load]);

	if (loading && !projection) {
		return <CenteredMessage title="Building C4 projection…" />;
	}
	if (error) {
		return <CenteredMessage title="Could not open C4 view" detail={error} />;
	}
	if (!projection || !graph) return null;

	const draft = projection.source === "draft";
	const badgeColor = draft ? "#e3b341" : "#2da44e";
	const counts = projection.counts;
	const description = draft
		? `Draft projection derived from process keys — not accepted.${counts.unassignedComponents > 0 ? ` ${counts.unassignedComponents} component${counts.unassignedComponents === 1 ? "" : "s"} with no process.` : ""}`
		: `Accepted containers from the element store.${counts.unbackedProcesses > 0 ? ` ${counts.unbackedProcesses} process key${counts.unbackedProcesses === 1 ? "" : "s"} not accepted.` : ""}`;

	return (
		<div
			data-tab-id={tabId}
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				background: theme.colors.background,
			}}
		>
			<C4ProjectionView
				model={projection.model}
				components={graph.components}
				trails={graph.trails ?? []}
				memberships={projection.memberships}
				title={graph.title}
				description={description}
				persistKey={graphId}
				headerActions={
					<>
						<span
							style={{
								display: "inline-flex",
								alignItems: "center",
								gap: 5,
								padding: "1px 7px",
								borderRadius: 4,
								border: `1px solid ${badgeColor}`,
								color: badgeColor,
								fontFamily: theme.fonts.monospace,
								fontSize: 10,
								letterSpacing: 0.4,
								flexShrink: 0,
							}}
						>
							<Boxes size={10} aria-hidden="true" />
							{draft ? "DRAFT" : "ACCEPTED"}
						</span>
						<span style={{ color: muted, fontSize: theme.fontSizes[0] }}>
							{counts.containers} container{counts.containers === 1 ? "" : "s"} ·{" "}
							{counts.externals} external{counts.externals === 1 ? "" : "s"} ·{" "}
							{counts.edges} line{counts.edges === 1 ? "" : "s"}
						</span>
						<button
							type="button"
							onClick={() => void load()}
							title="Rebuild projection"
							style={{
								display: "inline-flex",
								alignItems: "center",
								justifyContent: "center",
								height: 34,
								width: 34,
								borderRadius: 6,
								border: `1px solid ${theme.colors.border}`,
								background: "transparent",
								color: theme.colors.textSecondary,
								cursor: "pointer",
							}}
						>
							<RefreshCw size={13} />
						</button>
					</>
				}
			/>
		</div>
	);
}

/**
 * ComposedGraphPane — combined graph for one drilled-in repo.
 *
 * Fetches the host-merged document (`getComposedSubsystemModel` runs
 * `mergeSubsystemModels` over every stored model touching the repo key),
 * rolls it up to frame nodes with `aggregateToFrames`, and renders it with
 * `SubsystemAggregateGraph` — frame-level nodes (module / process / external
 * boundaries) with hub-routed inter-boundary flows. Read-only: verification
 * and corrections live in the source models.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import { SubsystemAggregateGraph } from "@principal-ai/subsystems-react";
import type {
	MergeSidecar,
	SubsystemComponent,
	SubsystemModelSummary,
	SubsystemTrail,
} from "../../shared/contract";
import { electrobun } from "../rpc";
import { aggregateToFrames, type AggregateGraph } from "./composedAggregate";

interface ComposedDocument {
	title: string;
	description?: string;
	components: SubsystemComponent[];
	trails?: SubsystemTrail[];
}

export function ComposedGraphPane({
	repoKey,
	graphs,
	modelIds,
	onPreviewFile,
}: {
	/** Drilldown repo key of the focused repo. */
	repoKey: string;
	/** Model summaries for resolving file-preview ownership. */
	graphs: SubsystemModelSummary[];
	/**
	 * Scope the merge to this model-id set (a showcase tab's models). Omitted
	 * composes every model touching the repo — the permanent tab's behavior.
	 */
	modelIds?: string[];
	onPreviewFile: (
		graph: SubsystemModelSummary,
		file: { repoKey: string | undefined; displayPath: string },
	) => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [doc, setDoc] = useState<ComposedDocument | null>(null);
	const [sidecar, setSidecar] = useState<MergeSidecar | null>(null);
	const [composedModelIds, setComposedModelIds] = useState<string[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Depend on contents, not array identity — an inline id list would
	// otherwise refetch on every render.
	const modelIdsKey = modelIds ? modelIds.join("\u0000") : "";

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);
		setDoc(null);
		void electrobun
			.rpc!.request.getComposedSubsystemModel({ repoKey, modelIds })
			.then((res) => {
				if (cancelled) return;
				if (!res.ok || !res.document) {
					setError(res.error ?? "Compose failed");
					setLoading(false);
					return;
				}
				setDoc(res.document);
				setSidecar(res.sidecar ?? null);
				setComposedModelIds(res.modelIds ?? []);
				setLoading(false);
			})
			.catch((err) => {
				if (cancelled) return;
				setError(err instanceof Error ? err.message : String(err));
				setLoading(false);
			});
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [repoKey, modelIdsKey]);

	const aggregate: AggregateGraph | null = useMemo(
		() => (doc ? aggregateToFrames(doc, sidecar) : null),
		[doc, sidecar],
	);

	// Member file clicks land here: resolve an owning model for the tab's
	// file preview, preferring one whose listing actually contains the path.
	const handleOpenFile = useCallback(
		(path: string) => {
			const byId = new Map(graphs.map((g) => [g.id, g]));
			const owner =
				composedModelIds
					.map((id) => byId.get(id))
					.find((g) => g?.files?.some((f) => f.file === path)) ??
				(composedModelIds.length > 0
					? byId.get(composedModelIds[0]!)
					: undefined);
			if (!owner) return;
			onPreviewFile(owner, {
				repoKey: repoKey === "__no-repo__" ? undefined : repoKey,
				displayPath: path,
			});
		},
		[graphs, composedModelIds, onPreviewFile, repoKey],
	);

	return (
		<div
			style={{
				// Bound to the parent pane: fill its height, never push past it.
				height: "100%",
				minHeight: 480,
				display: "flex",
				flexDirection: "column",
			}}
		>
			{loading ? (
				<div style={{ fontSize: theme.fontSizes[1], color: muted, padding: "24px 0" }}>
					Composing models…
				</div>
			) : error ? (
				<div style={{ fontSize: theme.fontSizes[1], color: "#e5534b", padding: "24px 0" }}>
					{error}
				</div>
			) : !aggregate || aggregate.frames.length === 0 ? (
				<div style={{ fontSize: theme.fontSizes[1], color: muted, padding: "24px 0" }}>
					{composedModelIds.length === 0
						? "No models match the current filter."
						: "No components to compose for this repo."}
				</div>
			) : (
				<div style={{ flex: 1, minHeight: 0, position: "relative" }}>
					<SubsystemAggregateGraph
						frames={aggregate.frames}
						edges={aggregate.edges}
						hubs={aggregate.hubs}
						title="Combined graph"
						onOpenFile={handleOpenFile}
					/>
				</div>
			)}
		</div>
	);
}

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import {
	PierreFileView, PierreTrailCodeView, SubsystemComponentGraph, purlRepoKey,
	type SubsystemOpenFileOptions, type TrailViewerContext,
} from "@principal-ai/subsystems-react";
import { remoteModelSourceUrl, type RemoteModel } from "../../shared/remote-models";
import { electrobun } from "../rpc";
import { CenteredMessage } from "../ui";

/** Read-only graph: no local store identity, mutations, audits, or maintenance. */
export function RemoteSubsystemModelView({ sourceId, modelKey }: { sourceId: string; modelKey: string }) {
	const [model, setModel] = useState<RemoteModel | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [revision, setRevision] = useState(0);
	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);
		setModel(null);
		void electrobun.rpc!.request.getRemoteModel({ sourceId, key: modelKey }).then((result) => {
			if (cancelled) return;
			if (!result.ok || !result.model) { setError(result.error ?? "Could not load model"); return; }
			setModel(result.model);
		}).catch(() => { if (!cancelled) setError("Could not load remote model"); })
			.finally(() => { if (!cancelled) setLoading(false); });
		return () => { cancelled = true; };
	}, [sourceId, modelKey, revision]);

	if (loading) return <CenteredMessage title="Loading remote model…" />;
	if (error || !model) return (
		<div><CenteredMessage title="Could not open remote model" detail={error ?? "Model unavailable"} />
			<button type="button" onClick={() => setRevision((n) => n + 1)}>Retry</button></div>
	);
	return <RemoteSubsystemGraph model={model} onRefresh={() => setRevision((n) => n + 1)} />;
}

export function RemoteSubsystemGraph({ model, onRefresh }: { model: RemoteModel; onRefresh: () => void }) {
	const { theme } = useTheme();
	const readFile = useCallback(async (path: string, purl?: string): Promise<string> => {
		let repo = purl;
		if (!repo && model) {
			const candidates = new Set([
				...model.document.components.filter((c) => c.file === path).map((c) => purlRepoKey(c.purl)),
				...(model.document.trails ?? []).flatMap((t) => t.steps.filter((s) => s.file === path).map((s) => purlRepoKey(s.purl))),
			].filter((key): key is string => Boolean(key)));
			if (candidates.size === 1) repo = [...candidates][0];
		}
		if (!repo) throw new Error("Cannot determine a unique repository for this file. Open its trail or register the referenced checkout.");
		const result = await electrobun.rpc!.request.readSubsystemFile({ purl: repo, file: path });
		if (!result.ok || result.content == null) throw new Error(result.error ?? "No local checkout for this repo");
		return result.content;
	}, [model]);

	const renderFileViewer = useCallback((file: string, options?: SubsystemOpenFileOptions) => (
		<PierreFileView filePath={file} fileName={file.split("/").pop() ?? file} readFile={readFile} focusLine={options?.startLine} />
	), [readFile]);
	const renderTrailViewer = useCallback((context: TrailViewerContext) => (
		<PierreTrailCodeView {...context} readFile={readFile} background={theme.colors.background} contextLines={8} />
	), [readFile, theme.colors.background]);

	return (
		<div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
			<div style={{ padding: "8px 12px", color: theme.colors.textSecondary, background: theme.colors.background }}>
				Read-only · {remoteModelSourceUrl(model.source, model.key)}{" "}
				<button type="button" onClick={onRefresh}>Refresh</button>
			</div>
			<div style={{ flex: 1, minHeight: 0 }}>
				<SubsystemComponentGraph
					components={model.document.components}
					trails={model.document.trails}
					title={model.document.title}
					description={model.document.description}
					persistKey={`remote:${model.source.id}:${model.key}`}
					renderFileViewer={renderFileViewer}
					renderTrailViewer={renderTrailViewer}
				/>
			</div>
		</div>
	);
}

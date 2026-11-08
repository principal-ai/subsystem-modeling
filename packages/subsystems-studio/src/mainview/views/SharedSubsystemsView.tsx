import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import { remoteModelSourceUrl, type RemoteModelPage, type RemoteModelPreview, type RemoteModelSource } from "../../shared/remote-models";
import { electrobun, reloadSubscribers } from "../rpc";

export function SharedSubsystemsView({ active }: { active: boolean }) {
	const { theme } = useTheme();
	const [sources, setSources] = useState<RemoteModelSource[]>([]);
	const [sourceId, setSourceId] = useState("");
	const [models, setModels] = useState<RemoteModelPreview[]>([]);
	const [cursor, setCursor] = useState<string>();
	const [skipped, setSkipped] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [openingKey, setOpeningKey] = useState<string | null>(null);
	const generation = useRef(0);
	const mounted = useRef(true);

	useEffect(() => {
		mounted.current = true;
		return () => { mounted.current = false; generation.current++; };
	}, []);

	const load = useCallback(async (id: string, nextCursor?: string) => {
		const current = ++generation.current;
		setBusy(true);
		setError(null);
		if (!nextCursor) { setModels([]); setCursor(undefined); setSkipped(0); }
		try {
			const result = await electrobun.rpc!.request.listRemoteModels({ sourceId: id, cursor: nextCursor });
			if (generation.current !== current || !mounted.current) return;
			if (!result.ok || !result.page) throw new Error(result.error ?? "Could not load models");
			const page: RemoteModelPage = result.page;
			setModels((old) => {
				const rows = nextCursor ? [...old, ...page.models] : page.models;
				return Array.from(new Map(rows.map((row) => [row.key, row])).values());
			});
			setCursor(page.cursor);
			setSkipped((old) => (nextCursor ? old : 0) + page.skipped);
		} catch (err) {
			if (generation.current === current && mounted.current) setError(err instanceof Error ? err.message : "Could not load models");
		} finally {
			if (generation.current === current && mounted.current) setBusy(false);
		}
	}, []);

	useEffect(() => {
		if (!active) return;
		let cancelled = false;
		const refreshSources = () => {
			void electrobun.rpc!.request.listRemoteModelSources({}).then((result) => {
				if (cancelled) return;
				if (!result.ok || !result.sources) { setError(result.error ?? "Could not load sources"); return; }
				setSources(result.sources);
				const id = result.sources[0]?.id ?? "";
				setSourceId(id);
				if (id) void load(id);
				else { setModels([]); setCursor(undefined); setSkipped(0); }
			}).catch(() => { if (!cancelled) setError("Could not load sources"); });
		};
		const onTabsChanged = (focusId?: string) => {
			if (focusId === "shared-subsystems") refreshSources();
		};
		refreshSources();
		reloadSubscribers.add(onTabsChanged);
		return () => { cancelled = true; reloadSubscribers.delete(onTabsChanged); };
	}, [active, load]);

	const open = async (key: string) => {
		setOpeningKey(key);
		setError(null);
		try {
			const result = await electrobun.rpc!.request.openRemoteModel({ sourceId, key });
			if (!result.ok) throw new Error(result.error ?? "Could not open model");
		} catch (err) {
			if (mounted.current) setError(err instanceof Error ? err.message : "Could not open model");
		} finally { if (mounted.current) setOpeningKey(null); }
	};

	const control: CSSProperties = {
		background: theme.colors.background, color: theme.colors.text,
		border: `1px solid ${theme.colors.border}`, borderRadius: 4, padding: "6px 10px",
		font: "inherit",
	};
	const source = sources.find((item) => item.id === sourceId);
	return (
		<div style={{ height: "100%", overflow: "auto", padding: 20, color: theme.colors.text, background: theme.colors.background, fontFamily: theme.fonts.body }}>
			<h2 style={{ marginTop: 0 }}>Shared Subsystems</h2>
			<p style={{ color: theme.colors.textSecondary }}>Browse read-only subsystem models from configured S3 or Cloudflare R2 sources. Manage sources in Settings.</p>
			{sources.length > 0 && (
				<div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
					<label>Source{" "}
						<select aria-label="Model source" value={sourceId} onChange={(event) => {
							const id = event.target.value;
							setSourceId(id); void load(id);
						}} style={control}>
							{sources.map((item) => <option key={item.id} value={item.id}>{item.name ?? remoteModelSourceUrl(item)}{item.provider !== "r2" && item.profile ? ` (${item.profile})` : ""}</option>)}
						</select>
					</label>
					<button type="button" disabled={busy} onClick={() => void load(sourceId)} style={control}>Refresh</button>
				</div>
			)}
			{error && <p role="alert" style={{ color: theme.colors.error ?? "#e5534b" }}>{error}</p>}
			{source && <p style={{ color: theme.colors.textSecondary }}>{remoteModelSourceUrl(source)} · Read-only</p>}
			{models.map((model) => (
				<button key={model.key} type="button" disabled={openingKey !== null}
					onClick={() => void open(model.key)}
					style={{ ...control, display: "block", width: "100%", textAlign: "left", padding: 14, marginBottom: 8, cursor: "pointer" }}>
					<strong>{model.title}</strong>
					{model.description && <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{model.description.slice(0, 400)}</div>}
					<div style={{ color: theme.colors.textSecondary, marginTop: 6 }}>
						{model.componentCount} components · {model.trailCount} trails · {model.key}
						{openingKey === model.key ? " · Opening…" : ""}
					</div>
				</button>
			))}
			{busy && <p role="status">Loading model previews…</p>}
			{!busy && !models.length && <p>{source ? "No models on this page." : "Configure a source in Settings to browse shared models."}</p>}
			{skipped > 0 && <p>{skipped} JSON object(s) skipped because they are invalid models or exceed 5 MiB.</p>}
			{cursor && <button type="button" disabled={busy} onClick={() => void load(sourceId, cursor)} style={control}>Load more</button>}
		</div>
	);
}

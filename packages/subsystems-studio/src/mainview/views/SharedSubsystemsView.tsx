import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
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
	const [configuring, setConfiguring] = useState(false);
	const [openingKey, setOpeningKey] = useState<string | null>(null);
	const [bucket, setBucket] = useState("");
	const [region, setRegion] = useState("");
	const [prefix, setPrefix] = useState("");
	const [profile, setProfile] = useState("");
	const [provider, setProvider] = useState<"s3" | "r2">("s3");
	const [accountId, setAccountId] = useState("");
	const [jurisdiction, setJurisdiction] = useState<"" | "eu">("");
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
		const refreshSources = () => { void electrobun.rpc!.request.listRemoteModelSources({}).then((result) => {
			if (cancelled) return;
			if (!result.ok || !result.sources) { setError(result.error ?? "Could not load sources"); return; }
			setSources(result.sources);
			const id = result.sources[0]?.id ?? "";
			setSourceId(id);
			if (id) void load(id);
		}).catch(() => { if (!cancelled) setError("Could not load sources"); });
		};
		const onTabsChanged = (focusId?: string) => {
			if (focusId === "shared-subsystems") refreshSources();
		};
		refreshSources();
		reloadSubscribers.add(onTabsChanged);
		return () => { cancelled = true; reloadSubscribers.delete(onTabsChanged); };
	}, [active, load]);

	const configure = async (event: FormEvent) => {
		event.preventDefault();
		setConfiguring(true);
		setError(null);
		// Invalidate an older source refresh before showing this source's preview.
		generation.current++;
		setBusy(false);
		try {
			const result = await electrobun.rpc!.request.configureRemoteModelSource({
				input: provider === "r2"
					? { provider, bucket, prefix, accountId: accountId.trim(), ...(jurisdiction ? { jurisdiction } : {}) }
					: { bucket, prefix, ...(region.trim() ? { region: region.trim() } : {}), ...(profile.trim() ? { profile: profile.trim() } : {}) },
			});
			if (!mounted.current) return;
			if (!result.ok || !result.source || !result.preview) throw new Error(result.error ?? "Could not configure source");
			generation.current++;
			const source = result.source;
			setSources((old) => [source, ...old.filter((s) => s.id !== source.id)]);
			setSourceId(source.id);
			setModels(result.preview.models);
			setCursor(result.preview.cursor);
			setSkipped(result.preview.skipped);
			setBucket("");
		} catch (err) {
			if (mounted.current) setError(err instanceof Error ? err.message : "Could not configure source");
		} finally { if (mounted.current) setConfiguring(false); }
	};

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
	const source = sources.find((s) => s.id === sourceId);
	return (
		<div style={{ height: "100%", overflow: "auto", padding: 20, color: theme.colors.text, background: theme.colors.background, fontFamily: theme.fonts.body }}>
			<h2 style={{ marginTop: 0 }}>Shared Subsystems</h2>
			<p style={{ color: theme.colors.textSecondary }}>Browse S3 or Cloudflare R2 model JSON read-only. Source-code previews need registered local checkouts.</p>
			<p style={{ color: theme.colors.textSecondary }}>{provider === "r2"
				? "R2 uses R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY from Studio’s host environment, not AWS credentials. Use an R2 Object Read token scoped to the bucket."
				: "S3 uses this computer’s AWS credentials or the selected AWS profile."}</p>
			<form onSubmit={(e) => void configure(e)} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
				<label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
					Provider
					<select aria-label="Storage provider" value={provider} disabled={configuring}
						onChange={(e) => setProvider(e.target.value as "s3" | "r2")} style={control}>
						<option value="s3">Amazon S3</option>
						<option value="r2">Cloudflare R2</option>
					</select>
				</label>
				{([
					["Bucket", bucket, setBucket, true],
					["Prefix (optional)", prefix, setPrefix, false],
					...(provider === "r2" ? [
						["Cloudflare account ID", accountId, setAccountId, true] as const,
					] : [
						["Region (optional)", region, setRegion, false] as const,
						["AWS profile (optional)", profile, setProfile, false] as const,
					]),
				] as const).map(([label, value, setValue, required]) => (
					<label key={label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
						{label}
						<input aria-label={label} value={value} required={required} disabled={configuring}
							onChange={(e) => setValue(e.target.value)} style={control} />
					</label>
				))}
				{provider === "r2" && <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
					Jurisdiction
					<select aria-label="R2 jurisdiction" value={jurisdiction} disabled={configuring}
						onChange={(e) => setJurisdiction(e.target.value as "" | "eu")} style={control}>
						<option value="">Default</option>
						<option value="eu">European Union</option>
					</select>
				</label>}
				<button type="submit" disabled={configuring || busy} style={{ ...control, alignSelf: "end", cursor: "pointer" }}>
					{configuring ? "Checking access and previews…" : "Add bucket"}
				</button>
			</form>
			{sources.length > 0 && (
				<div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
					<label>Source{" "}
						<select aria-label="Model source" value={sourceId} disabled={configuring}
							onChange={(e) => {
								const id = e.target.value;
								setSourceId(id); void load(id);
							}} style={control}>
							{sources.map((s) => <option key={s.id} value={s.id}>{s.name ?? remoteModelSourceUrl(s)}{s.provider !== "r2" && s.profile ? ` (${s.profile})` : ""}</option>)}
						</select>
					</label>
					<button type="button" disabled={busy || configuring} onClick={() => void load(sourceId)} style={control}>Refresh</button>
				</div>
			)}
			{error && <p role="alert" style={{ color: theme.colors.error ?? "#e5534b" }}>{error}</p>}
			{source && <p style={{ color: theme.colors.textSecondary }}>{remoteModelSourceUrl(source)} · Read-only</p>}
			{models.map((model) => (
				<button key={model.key} type="button" disabled={openingKey !== null || configuring}
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
			{!busy && !configuring && !models.length && <p>{source ? "No models on this page." : "Add a bucket to load model previews and save its configuration."}</p>}
			{skipped > 0 && <p>{skipped} JSON object(s) skipped because they are invalid models or exceed 5 MiB.</p>}
			{cursor && <button type="button" disabled={busy || configuring} onClick={() => void load(sourceId, cursor)} style={control}>Load more</button>}
		</div>
	);
}

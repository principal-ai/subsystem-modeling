/**
 * Settings → Maintainer: the runtime Maintain agents need (OpenCode V2) and
 * which model they run on — the free tier, a specific catalog model, or a
 * local Ollama model that Studio wires into OpenCode for you.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import type {
	OllamaConfigureOutcome,
	OpencodeServerStatus,
	OpencodeV2Status,
	StudioMessages,
	ViewerSettings,
} from "../../shared/contract";
import { electrobun, opencodeV2ChangeSubscribers } from "../rpc";
import { OllamaServerCard, describeOllamaModels, useOllamaStatus } from "./OllamaServerCard";
import {
	ActionButton,
	Card,
	CardTitle,
	Hint,
	StatusDot,
	StatusLine,
	fieldStyle,
	mutedColor,
	type DotTone,
} from "./settingsPrimitives";

type ModelMode = "free" | "pick" | "ollama";

interface CatalogModel {
	ref: string;
	id: string;
	providerID: string;
	name?: string;
}

interface Catalog {
	resolved: string;
	source: string;
	configured: string | null;
	models: CatalogModel[];
	freeModels: CatalogModel[];
	note?: string;
}

/** Which mode a stored maintainer model represents. */
export function modeForModel(ref: string | null): ModelMode {
	if (!ref) return "free";
	return ref.startsWith("ollama/") ? "ollama" : "pick";
}

export function MaintainerPane({
	settings,
	onSettings,
}: {
	settings: ViewerSettings | null;
	onSettings: (next: ViewerSettings) => void;
}) {
	const { theme } = useTheme();
	const muted = mutedColor(theme);
	const ollama = useOllamaStatus();

	// --- OpenCode V2 runtime ---------------------------------------------
	const [opencode, setOpencode] = useState<OpencodeV2Status | null>(null);
	const [server, setServer] = useState<OpencodeServerStatus | null>(null);
	const [opencodeError, setOpencodeError] = useState<string | null>(null);
	const refreshOpencode = useCallback(async () => {
		try {
			const [status, serverStatus] = await Promise.all([
				electrobun.rpc!.request.getOpencodeV2Status({ detailed: true }),
				electrobun.rpc!.request.getOpencodeServerStatus({}),
			]);
			setOpencode(status);
			setServer(serverStatus);
		} catch (err) {
			setOpencodeError(err instanceof Error ? err.message : String(err));
		}
	}, []);
	useEffect(() => {
		void refreshOpencode();
		const onPush = (payload: StudioMessages["opencodeV2Changed"]) => {
			setOpencode(payload.status);
			setOpencodeError(payload.error ?? null);
			if (!payload.status.cliBusy) void refreshOpencode();
		};
		opencodeV2ChangeSubscribers.add(onPush);
		return () => {
			opencodeV2ChangeSubscribers.delete(onPush);
		};
	}, [refreshOpencode]);
	const installOpencode = useCallback(async () => {
		setOpencodeError(null);
		const res = await electrobun.rpc!.request.installOpencodeV2({});
		if (res.status) setOpencode(res.status);
		if (!res.ok) setOpencodeError(res.error ?? "Install failed");
	}, []);
	const installed = opencode?.installed === true;
	const busy = Boolean(opencode?.cliBusy);

	// --- OpenCode model catalog --------------------------------------------
	const [catalog, setCatalog] = useState<Catalog | null>(null);
	const [catalogError, setCatalogError] = useState<string | null>(null);
	const [catalogLoading, setCatalogLoading] = useState(false);
	const loadCatalog = useCallback(async (refresh = false) => {
		setCatalogLoading(true);
		try {
			const res = await electrobun.rpc!.request.getSubsystemMaintainerModels({ refresh });
			if (!res.ok || !res.resolved) {
				setCatalogError(res.error ?? "Failed to load the OpenCode model catalog");
				return;
			}
			setCatalogError(null);
			setCatalog({
				resolved: res.resolved,
				source: res.source ?? "auto",
				configured: res.configured ?? null,
				models: res.models ?? [],
				freeModels: res.freeModels ?? [],
				note: res.note,
			});
		} catch (err) {
			setCatalogError(err instanceof Error ? err.message : String(err));
		} finally {
			setCatalogLoading(false);
		}
	}, []);
	useEffect(() => {
		if (installed) void loadCatalog();
	}, [installed, loadCatalog]);

	// --- Model mode ---------------------------------------------------------
	const stored = settings?.subsystemMaintainerModel ?? null;
	const [mode, setMode] = useState<ModelMode>(modeForModel(stored));
	useEffect(() => setMode(modeForModel(stored)), [stored]);
	const [saving, setSaving] = useState(false);
	const saveModel = useCallback(async (ref: string | null) => {
		setSaving(true);
		try {
			const res = await electrobun.rpc!.request.setSettings({ settings: { subsystemMaintainerModel: ref } });
			if (res.ok) onSettings(res.settings);
			void loadCatalog();
		} finally {
			setSaving(false);
		}
	}, [loadCatalog, onSettings]);

	const grouped = useMemo(() => {
		const byProvider = new Map<string, CatalogModel[]>();
		for (const m of catalog?.models ?? []) {
			if (m.providerID === "ollama") continue;
			const list = byProvider.get(m.providerID) ?? [];
			list.push(m);
			byProvider.set(m.providerID, list);
		}
		return [...byProvider.entries()].sort(([a], [b]) => a.localeCompare(b));
	}, [catalog]);

	// --- Ollama agent model --------------------------------------------------
	const ollamaAgentModels = (ollama.status?.models ?? []).filter((m) => m.toolcall);
	const storedOllamaModel = stored?.startsWith("ollama/") ? stored.slice("ollama/".length) : null;
	const [ollamaDraft, setOllamaDraft] = useState(storedOllamaModel ?? "");
	useEffect(() => {
		if (storedOllamaModel) setOllamaDraft(storedOllamaModel);
	}, [storedOllamaModel]);
	const [applying, setApplying] = useState(false);
	const [outcome, setOutcome] = useState<OllamaConfigureOutcome | null>(null);
	const [applyError, setApplyError] = useState<string | null>(null);
	const applyOllama = useCallback(async () => {
		if (!ollamaDraft) return;
		setApplying(true);
		setApplyError(null);
		setOutcome(null);
		try {
			const res = await electrobun.rpc!.request.configureOllama({ agentModel: ollamaDraft });
			if (!res.ok || !res.outcome) {
				setApplyError(res.error ?? "Could not configure Ollama");
				return;
			}
			setOutcome(res.outcome);
			ollama.setStatus(res.outcome.status);
			const next = await electrobun.rpc!.request.getSettings({});
			onSettings(next);
			void loadCatalog(true);
			void refreshOpencode();
		} catch (err) {
			setApplyError(err instanceof Error ? err.message : String(err));
		} finally {
			setApplying(false);
		}
	}, [loadCatalog, ollama, ollamaDraft, onSettings, refreshOpencode]);
	const ollamaDirty = ollamaDraft !== (storedOllamaModel ?? "");
	const openCodeProviderModels = ollama.status?.agent.opencode.provider?.models ?? [];

	const opencodeTone: DotTone = !opencode ? "idle" : !installed ? "error" : server?.running ? "ok" : "warn";

	return (
		<>
			<Card>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
					<div style={{ minWidth: 0 }}>
						<CardTitle>OpenCode V2 runtime</CardTitle>
						<span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: theme.fontSizes[0], color: muted, lineHeight: 1.4 }}>
							<StatusDot tone={opencodeTone} />
							{!opencode
								? "Checking…"
								: busy
									? `${opencode.cliBusy === "install" ? "Installing" : "Updating"} opencode2…`
									: !installed
										? "Not installed. Maintain agents cannot run until it is."
										: `Installed${opencode.installedVersion ? ` v${opencode.installedVersion}` : ""}${
											opencode.updateAvailable ? ` · v${opencode.latestVersion} available` : ""
										} · service ${server?.running ? `running at ${server.url}` : "stopped (starts on demand)"}`}
						</span>
					</div>
					{!installed && (
						<ActionButton onClick={() => void installOpencode()} disabled={!opencode || busy} primary>
							{busy ? "Installing…" : "Install"}
						</ActionButton>
					)}
				</div>
				{opencodeError && <StatusLine tone="error">{opencodeError}</StatusLine>}
				{!installed && opencode && (
					<Hint>
						Studio downloads the binary to <code>{opencode.conventionalBin}</code>. Manual alternative:{" "}
						<code>{opencode.installCommand}</code>
					</Hint>
				)}
			</Card>

			<Card dimmed={!installed}>
				<CardTitle>Maintainer model</CardTitle>
				<Hint style={{ marginTop: 0, marginBottom: 8 }}>
					{!installed
						? "Install OpenCode to choose a model."
						: catalogError ?? (catalog
							? `Next run uses ${catalog.resolved} (${catalog.source}).${catalog.note ? ` ${catalog.note}` : ""}`
							: catalogLoading ? "Loading the OpenCode model catalog…" : "")}
				</Hint>
				<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
					<ModeRow
						active={mode === "free"}
						disabled={!installed || saving}
						onSelect={() => {
							setMode("free");
							if (stored !== null) void saveModel(null);
						}}
						title="Use a free model"
						description={catalog?.freeModels.length
							? `Auto-picks the best free tool-capable model in the catalog (${catalog.freeModels.length} available, e.g. ${catalog.freeModels[0]!.ref}). Falls back to a credentialed model when the free tier is unresponsive.`
							: "Auto-picks a free tool-capable model from the OpenCode catalog when one is available."}
					/>
					<ModeRow
						active={mode === "pick"}
						disabled={!installed || saving}
						onSelect={() => setMode("pick")}
						title="Pick a model"
						description="Any enabled tool-capable model from the OpenCode catalog. Providers need their credentials set up in OpenCode."
					>
						{mode === "pick" && (
							<div style={{ display: "flex", gap: 8, marginTop: 8 }}>
								<select
									value={mode === "pick" && stored && !stored.startsWith("ollama/") ? stored : ""}
									disabled={!installed || saving || !catalog}
									onChange={(e) => {
										if (e.target.value) void saveModel(e.target.value);
									}}
									style={fieldStyle(theme, { flex: 1, cursor: "pointer" })}
								>
									<option value="">Choose a model…</option>
									{grouped.map(([providerID, models]) => (
										<optgroup key={providerID} label={providerID}>
											{models.map((m) => (
												<option key={m.ref} value={m.ref}>
													{m.name && m.name !== m.id ? `${m.name} (${m.id})` : m.id}
												</option>
											))}
										</optgroup>
									))}
								</select>
								<ActionButton onClick={() => void loadCatalog(true)} disabled={catalogLoading || !installed} title="Re-read the OpenCode catalog">
									{catalogLoading ? "Refreshing…" : "Refresh"}
								</ActionButton>
							</div>
						)}
					</ModeRow>
					<ModeRow
						active={mode === "ollama"}
						disabled={!installed || saving}
						onSelect={() => setMode("ollama")}
						title={
							<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
								Ollama (local)
								<StatusDot tone={!ollama.status ? "idle" : ollama.status.reachable ? "ok" : "error"} />
								<span style={{ fontWeight: 500, color: muted, fontSize: theme.fontSizes[0] }}>
									{!ollama.status ? "checking…" : ollama.status.reachable ? describeOllamaModels(ollama.status) : "not reachable"}
								</span>
							</span>
						}
						description="Run agents on a model pulled on your Ollama server. Studio adds the provider to OpenCode's config, makes it the default, and restarts the OpenCode service."
					>
						{mode === "ollama" && (
							<div style={{ marginTop: 8 }}>
								<OllamaServerCard
									settings={settings}
									status={ollama.status}
									loading={ollama.loading}
									onSaved={(next) => {
										onSettings(next);
										void ollama.refresh();
									}}
								/>
								<div style={{ display: "flex", gap: 8 }}>
									<select
										value={ollamaDraft}
										disabled={!ollama.status?.reachable || applying}
										onChange={(e) => setOllamaDraft(e.target.value)}
										style={fieldStyle(theme, { flex: 1, cursor: "pointer" })}
									>
										<option value="">Choose a tool-capable model…</option>
										{ollamaAgentModels.map((m) => (
											<option key={m.name} value={m.name}>
												{m.name}
												{m.parameterSize ? ` · ${m.parameterSize}` : ""}
												{m.capabilities.includes("thinking") ? " · thinking" : ""}
											</option>
										))}
									</select>
									<ActionButton
										onClick={() => void applyOllama()}
										disabled={!ollamaDraft || applying || !ollama.status?.reachable || (!ollamaDirty && openCodeProviderModels.includes(ollamaDraft))}
										primary={ollamaDirty}
										title="Write the provider into OpenCode's config and restart the service"
									>
										{applying ? "Applying…" : "Apply"}
									</ActionButton>
								</div>
								{ollama.status?.reachable && ollamaAgentModels.length === 0 && (
									<StatusLine tone="warn">
										No pulled model reports tool calling. Try <code>ollama pull qwen3.6:27b</code> or <code>ollama pull llama3.2</code>.
									</StatusLine>
								)}
								{openCodeProviderModels.length > 0 && (
									<Hint>
										OpenCode already knows: {openCodeProviderModels.map((m) => `ollama/${m}`).join(", ")}
										{ollama.status?.agent.opencode.defaultModel ? ` · default ${ollama.status.agent.opencode.defaultModel}` : ""}.
									</Hint>
								)}
								{applyError && <StatusLine tone="error">{applyError}</StatusLine>}
								{outcome && (
									<>
										<StatusLine tone={outcome.warnings.length ? "warn" : "ok"}>
											{outcome.applied.maintainerModel ?? "Saved"}
											{outcome.applied.opencodeConfig ? ` · config ${outcome.applied.opencodeConfig.changed ? "written" : "unchanged"}` : ""}
											{outcome.applied.opencodeRestarted != null ? ` · OpenCode ${outcome.applied.opencodeRestarted ? "restarted" : "not restarted"}` : ""}
											{outcome.applied.opencodeCatalogHasModel != null ? ` · catalog ${outcome.applied.opencodeCatalogHasModel ? "confirmed" : "missing it"}` : ""}
										</StatusLine>
										{outcome.warnings.map((w) => (
											<StatusLine key={w} tone="warn">{w}</StatusLine>
										))}
									</>
								)}
								{!applying && !outcome && ollamaDraft && (
									<Hint>
										Apply will write <code>{ollama.status?.agent.opencode.configPath ?? "opencode.json"}</code>, set{" "}
										<code>ollama/{ollamaDraft}</code> as OpenCode's default, and restart the OpenCode service (ending any
										in-flight sessions).
									</Hint>
								)}
							</div>
						)}
					</ModeRow>
				</div>
			</Card>
		</>
	);
}

/** Radio-style option row; the selected one can expand with controls. */
function ModeRow({
	active,
	disabled,
	onSelect,
	title,
	description,
	children,
}: {
	active: boolean;
	disabled?: boolean;
	onSelect: () => void;
	title: React.ReactNode;
	description: React.ReactNode;
	children?: React.ReactNode;
}) {
	const { theme } = useTheme();
	const muted = mutedColor(theme);
	return (
		<div
			style={{
				padding: "10px 12px",
				borderRadius: 8,
				background: theme.colors.surface,
				border: `1px solid ${active ? theme.colors.primary : theme.colors.border}`,
			}}
		>
			<label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: disabled ? "default" : "pointer" }}>
				<input
					type="radio"
					checked={active}
					disabled={disabled}
					onChange={onSelect}
					style={{ marginTop: 2, accentColor: theme.colors.primary, cursor: disabled ? "default" : "pointer", flexShrink: 0 }}
				/>
				<span style={{ minWidth: 0, flex: 1 }}>
					<span style={{ display: "block", fontSize: theme.fontSizes[1], fontWeight: 600, lineHeight: 1.3 }}>{title}</span>
					<span style={{ display: "block", fontSize: theme.fontSizes[0], color: muted, lineHeight: 1.4, marginTop: 2 }}>
						{description}
					</span>
				</span>
			</label>
			{children && <div style={{ paddingLeft: 28 }}>{children}</div>}
		</div>
	);
}

/**
 * SettingsModal — viewer flags + utility actions (default tabs, open the
 * concept-extractor prompt). Opened from the header Settings button. Flag
 * changes go host-side via setSettings so they persist and re-sync the strip.
 */

import { useCallback, useEffect, useState } from "react";
import { Gauge, KeyRound, ScrollText, SlidersHorizontal, Wrench } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import type { DefaultTabFlags, ViewerSettings } from "../../shared/contract";
import { electrobun } from "../rpc";

const TAB_TOGGLES: Array<{
	key: keyof DefaultTabFlags;
	label: string;
	description: string;
}> = [
	{
		key: "sessions",
		label: "Agent Sessions",
		description: "Overview of recent agent sessions",
	},
	{
		key: "maintenanceSessions",
		label: "Maintenance Sessions",
		description: "Historical Maintain runs (not live)",
	},
	{
		key: "trails",
		label: "Trails",
		description: "Cached trail and tour library",
	},
	{
		key: "graphify",
		label: "Graphify",
		description: "Alexandria repos with Graphify graphs",
	},
	{
		key: "packageLayers",
		label: "Package Layers",
		description: "Alexandria repos with package discovery caches",
	},
	{
		key: "subsystems",
		label: "Subsystems",
		description: "Saved subsystem component graphs",
	},
	{
		key: "maintenance",
		label: "Maintainer",
		description: "Live Maintain overview: verification progress and proposals",
	},
	{
		key: "opencodeV2",
		label: "OpenCode V2",
		description: "Debug detect/install for the Maintain V2 runtime",
	},
];

const REGULAR_AUDIT_INTERVAL_OPTIONS = [
	{ value: 5, label: "Every 5 minutes" },
	{ value: 10, label: "Every 10 minutes" },
	{ value: 15, label: "Every 15 minutes" },
	{ value: 30, label: "Every 30 minutes" },
	{ value: 60, label: "Every hour" },
	{ value: 120, label: "Every 2 hours" },
	{ value: 360, label: "Every 6 hours" },
] as const;

const FALLBACK_SETTINGS: ViewerSettings = {
	defaultTabs: {
		sessions: true,
		maintenanceSessions: true,
		trails: true,
		graphify: true,
		packageLayers: true,
		subsystems: true,
		maintenance: true,
		opencodeV2: true,
	},
	autoAcceptSubsystemModelProposals: false,
	autoAcceptSubsystemModelConfidenceThreshold: 0.85,
	subsystemMaintainerModel: null,
	regularAuditEnabled: true,
	regularAuditIntervalMinutes: 5,
	typesafeApiKey: null,
	maintenanceRepoKey: null,
};

type SavingKey =
	| keyof DefaultTabFlags
	| "autoAccept"
	| "autoAcceptThreshold"
	| "regularAudit"
	| "regularAuditInterval"
	| "typesafeApiKey";

const AUTO_ACCEPT_CONFIDENCE_OPTIONS = [
	{ value: 0.5, label: "50% — lenient" },
	{ value: 0.6, label: "60%" },
	{ value: 0.7, label: "70%" },
	{ value: 0.75, label: "75%" },
	{ value: 0.8, label: "80%" },
	{ value: 0.85, label: "85% — balanced (default)" },
	{ value: 0.9, label: "90%" },
	{ value: 0.95, label: "95% — strict" },
] as const;

const SETTINGS_TABS = [
	{
		id: "tabs",
		label: "Default tabs",
		icon: SlidersHorizontal,
		description:
			"Choose which tabs appear in the strip by default. Changes apply immediately and persist across launches.",
	},
	{
		id: "auditing",
		label: "Auditing",
		icon: Gauge,
		description:
			"Control how subsystem models are audited on a schedule.",
	},
	{
		id: "jev",
		label: "Jev (TypeSafe)",
		icon: KeyRound,
		description:
			"Connect TypeSafe AI's Jev API to score correction proposals with an independent second opinion and gate auto-accept on confidence.",
	},
	{
		id: "tools",
		label: "Tools",
		icon: Wrench,
		description: "Utilities that pair with the audit workflow.",
	},
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

export function SettingsModal({ onClose }: { onClose: () => void }) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [settings, setSettings] = useState<ViewerSettings | null>(null);
	const [savingKey, setSavingKey] = useState<SavingKey | null>(null);
	const [typesafeKey, setTypesafeKey] = useState("");
	const [typesafeKeyLoaded, setTypesafeKeyLoaded] = useState(false);
	const [maintainerModels, setMaintainerModels] = useState<{
		resolved: string;
		source: string;
		freeCount: number;
	} | null>(null);
	const [activeTab, setActiveTab] = useState<SettingsTab>("tabs");
	const activeTabMeta =
		SETTINGS_TABS.find((tab) => tab.id === activeTab) ?? SETTINGS_TABS[0];

	useEffect(() => {
		let alive = true;
		void electrobun.rpc!.request
			.getSettings({})
			.then((s) => {
				if (!alive) return;
				setSettings(s);
				setTypesafeKey(s.typesafeApiKey ?? "");
				setTypesafeKeyLoaded(true);
			})
			.catch(() => {
				if (!alive) return;
				setSettings(FALLBACK_SETTINGS);
				setTypesafeKeyLoaded(true);
			});
		void electrobun.rpc!.request
			.getSubsystemMaintainerModels({})
			.then((res) => {
				if (!alive || !res.ok || !res.resolved) return;
				setMaintainerModels({
					resolved: res.resolved,
					source: res.source ?? "auto",
					freeCount: res.freeModels?.length ?? 0,
				});
			})
			.catch(() => {
				/* optional */
			});
		return () => {
			alive = false;
		};
	}, []);

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

	const toggle = useCallback(async (key: keyof DefaultTabFlags) => {
		if (!settings) return;
		const nextValue = !settings.defaultTabs[key];
		setSavingKey(key);
		// Optimistic update so the switch feels instant.
		setSettings({
			...settings,
			defaultTabs: { ...settings.defaultTabs, [key]: nextValue },
		});
		try {
			const res = await electrobun.rpc!.request.setSettings({
				settings: { defaultTabs: { [key]: nextValue } },
			});
			if (res.ok) setSettings(res.settings);
		} catch {
			// Revert on failure.
			setSettings({
				...settings,
				defaultTabs: { ...settings.defaultTabs, [key]: !nextValue },
			});
		} finally {
			setSavingKey(null);
		}
	}, [settings]);

	const toggleAutoAccept = useCallback(async () => {
		if (!settings) return;
		const nextValue = !settings.autoAcceptSubsystemModelProposals;
		setSavingKey("autoAccept");
		setSettings({
			...settings,
			autoAcceptSubsystemModelProposals: nextValue,
		});
		try {
			const res = await electrobun.rpc!.request.setSettings({
				settings: { autoAcceptSubsystemModelProposals: nextValue },
			});
			if (res.ok) setSettings(res.settings);
		} catch {
			setSettings({
				...settings,
				autoAcceptSubsystemModelProposals: !nextValue,
			});
		} finally {
			setSavingKey(null);
		}
	}, [settings]);

	const setAutoAcceptThreshold = useCallback(
		async (threshold: number) => {
			if (!settings) return;
			if (threshold === settings.autoAcceptSubsystemModelConfidenceThreshold)
				return;
			const prev = settings.autoAcceptSubsystemModelConfidenceThreshold;
			setSavingKey("autoAcceptThreshold");
			setSettings({
				...settings,
				autoAcceptSubsystemModelConfidenceThreshold: threshold,
			});
			try {
				const res = await electrobun.rpc!.request.setSettings({
					settings: {
						autoAcceptSubsystemModelConfidenceThreshold: threshold,
					},
				});
				if (res.ok) setSettings(res.settings);
			} catch {
				setSettings({
					...settings,
					autoAcceptSubsystemModelConfidenceThreshold: prev,
				});
			} finally {
				setSavingKey(null);
			}
		},
		[settings],
	);

	const toggleRegularAudit = useCallback(async () => {
		if (!settings) return;
		const nextValue = !settings.regularAuditEnabled;
		setSavingKey("regularAudit");
		setSettings({
			...settings,
			regularAuditEnabled: nextValue,
		});
		try {
			const res = await electrobun.rpc!.request.setSettings({
				settings: { regularAuditEnabled: nextValue },
			});
			if (res.ok) setSettings(res.settings);
		} catch {
			setSettings({
				...settings,
				regularAuditEnabled: !nextValue,
			});
		} finally {
			setSavingKey(null);
		}
	}, [settings]);

	const setRegularAuditInterval = useCallback(
		async (minutes: number) => {
			if (!settings) return;
			if (minutes === settings.regularAuditIntervalMinutes) return;
			const prev = settings.regularAuditIntervalMinutes;
			setSavingKey("regularAuditInterval");
			setSettings({
				...settings,
				regularAuditIntervalMinutes: minutes,
			});
			try {
				const res = await electrobun.rpc!.request.setSettings({
					settings: { regularAuditIntervalMinutes: minutes },
				});
				if (res.ok) setSettings(res.settings);
			} catch {
				setSettings({
					...settings,
					regularAuditIntervalMinutes: prev,
				});
			} finally {
				setSavingKey(null);
			}
		},
		[settings],
	);

	const openPrompt = useCallback(() => {
		void electrobun.rpc!.request.openPromptTab({});
		onClose();
	}, [onClose]);

	const saveTypesafeKey = useCallback(async () => {
		if (!settings) return;
		const trimmed = typesafeKey.trim();
		setSavingKey("typesafeApiKey");
		try {
			const res = await electrobun.rpc!.request.setSettings({
				settings: { typesafeApiKey: trimmed.length > 0 ? trimmed : null },
			});
			if (res.ok) {
				setSettings(res.settings);
				setTypesafeKey(res.settings.typesafeApiKey ?? "");
			}
		} finally {
			setSavingKey(null);
		}
	}, [settings, typesafeKey]);

	const typesafeKeyDirty =
		(typesafeKey.trim() || null) !== (settings?.typesafeApiKey ?? null);

	// Auto-accept relies on Jev scoring, so it stays locked until a key is
	// saved. (The host also falls back to TYPESAFE_API_KEY, but the renderer
	// can't see that here.)
	const hasTypesafeKey = Boolean(settings?.typesafeApiKey);

	const intervalOptions = (() => {
		const current = settings?.regularAuditIntervalMinutes ?? 5;
		if (REGULAR_AUDIT_INTERVAL_OPTIONS.some((o) => o.value === current)) {
			return [...REGULAR_AUDIT_INTERVAL_OPTIONS];
		}
		return [
			...REGULAR_AUDIT_INTERVAL_OPTIONS,
			{ value: current, label: `Every ${current} minutes` },
		].sort((a, b) => a.value - b.value);
	})();

	return (
		<div
			role="dialog"
			aria-modal
			aria-label="Viewer settings"
			onClick={onClose}
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 2147483000,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: "rgba(0,0,0,0.55)",
				fontFamily: theme.fonts.body,
			}}
		>
			<div
				onClick={(e) => e.stopPropagation()}
				style={{
					width: "min(760px, calc(100vw - 48px))",
					height: "min(640px, calc(100vh - 48px))",
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
					background: theme.colors.surface,
					border: `1px solid ${theme.colors.border}`,
					borderRadius: 12,
					boxShadow: "0 12px 48px rgba(0,0,0,0.4)",
					color: theme.colors.text,
				}}
			>
				<div
					style={{
						padding: "18px 24px 14px",
						borderBottom: `1px solid ${theme.colors.border}`,
						background: theme.colors.background,
					}}
				>
					<span style={{ fontSize: theme.fontSizes[3], fontWeight: 600 }}>
						Settings
					</span>
					<p
						style={{
							margin: "4px 0 0",
							fontSize: theme.fontSizes[0],
							color: muted,
							lineHeight: 1.5,
						}}
					>
						{activeTabMeta.description}
					</p>
				</div>

				<div
					style={{
						display: "flex",
						flex: 1,
						minHeight: 0,
						overflow: "hidden",
					}}
				>
					<nav
						style={{
							width: 184,
							flexShrink: 0,
							display: "flex",
							flexDirection: "column",
							gap: 4,
							padding: 12,
							borderRight: `1px solid ${theme.colors.border}`,
							background: theme.colors.background,
							overflowY: "auto",
						}}
					>
						{SETTINGS_TABS.map((tab) => {
							const Icon = tab.icon;
							const active = activeTab === tab.id;
							return (
								<button
									key={tab.id}
									type="button"
									onClick={() => setActiveTab(tab.id)}
									style={{
										display: "flex",
										alignItems: "center",
										gap: 10,
										width: "100%",
										padding: "8px 10px",
										borderRadius: 8,
										border: `1px solid ${active ? theme.colors.border : "transparent"}`,
										background: active ? theme.colors.surface : "transparent",
										color: active ? theme.colors.text : muted,
										fontFamily: theme.fonts.body,
										fontSize: theme.fontSizes[1],
										fontWeight: active ? 600 : 500,
										textAlign: "left",
										cursor: "pointer",
									}}
								>
									<span
										style={{
											display: "flex",
											flexShrink: 0,
											color: active ? theme.colors.primary : muted,
										}}
									>
										<Icon size={16} />
									</span>
									<span style={{ minWidth: 0 }}>{tab.label}</span>
								</button>
							);
						})}
					</nav>

					<div
						style={{
							flex: 1,
							minWidth: 0,
							overflowY: "auto",
							padding: "20px 24px",
						}}
					>
						{activeTab === "tabs" && (
							<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
								{TAB_TOGGLES.map((row) => {
									const on = settings?.defaultTabs[row.key] ?? true;
									const busy = savingKey === row.key;
									return (
										<label
											key={row.key}
											style={{
												display: "flex",
												alignItems: "center",
												gap: 12,
												padding: "10px 12px",
												borderRadius: 8,
												background: theme.colors.background,
												border: `1px solid ${theme.colors.border}`,
												cursor: settings && !busy ? "pointer" : "default",
												opacity: settings ? 1 : 0.6,
											}}
										>
											<input
												type="checkbox"
												checked={on}
												disabled={!settings || busy}
												onChange={() => void toggle(row.key)}
												style={{
													width: 16,
													height: 16,
													accentColor: theme.colors.primary,
													cursor:
														settings && !busy ? "pointer" : "default",
													flexShrink: 0,
												}}
											/>
											<span style={{ minWidth: 0, flex: 1 }}>
												<span
													style={{
														display: "block",
														fontSize: theme.fontSizes[1],
														fontWeight: 600,
														lineHeight: 1.3,
													}}
												>
													{row.label}
												</span>
												<span
													style={{
														display: "block",
														fontSize: theme.fontSizes[0],
														color: muted,
														lineHeight: 1.4,
														marginTop: 2,
													}}
												>
													{row.description}
												</span>
											</span>
										</label>
									);
								})}
							</div>
						)}

						{activeTab === "auditing" && (
							<>
								<label
									style={{
										display: "flex",
										alignItems: "center",
										gap: 12,
										padding: "10px 12px",
										marginBottom: 8,
										borderRadius: 8,
										background: theme.colors.background,
										border: `1px solid ${theme.colors.border}`,
										cursor:
											settings && savingKey !== "regularAudit"
												? "pointer"
												: "default",
										opacity: settings ? 1 : 0.6,
									}}
								>
									<input
										type="checkbox"
										checked={settings?.regularAuditEnabled ?? true}
										disabled={!settings || savingKey === "regularAudit"}
										onChange={() => void toggleRegularAudit()}
										style={{
											width: 16,
											height: 16,
											accentColor: theme.colors.primary,
											cursor:
												settings && savingKey !== "regularAudit"
													? "pointer"
													: "default",
											flexShrink: 0,
										}}
									/>
									<span style={{ minWidth: 0, flex: 1 }}>
										<span
											style={{
												display: "block",
												fontSize: theme.fontSizes[1],
												fontWeight: 600,
												lineHeight: 1.3,
											}}
										>
											Regular subsystem audit
										</span>
										<span
											style={{
												display: "block",
												fontSize: theme.fontSizes[0],
												color: muted,
												lineHeight: 1.4,
												marginTop: 2,
											}}
										>
											While Studio is open, dry-run audit all stored subsystem
											models on a schedule so list badges stay current.
										</span>
									</span>
								</label>

								<div
									style={{
										padding: "10px 12px",
										marginBottom: 8,
										borderRadius: 8,
										background: theme.colors.background,
										border: `1px solid ${theme.colors.border}`,
										opacity:
											settings?.regularAuditEnabled === false ? 0.55 : 1,
									}}
								>
									<label
										htmlFor="regular-audit-interval"
										style={{
											display: "block",
											fontSize: theme.fontSizes[1],
											fontWeight: 600,
											lineHeight: 1.3,
											marginBottom: 6,
										}}
									>
										Audit interval
									</label>
									<select
										id="regular-audit-interval"
										value={settings?.regularAuditIntervalMinutes ?? 5}
										disabled={
											!settings ||
											settings.regularAuditEnabled === false ||
											savingKey === "regularAuditInterval"
										}
										onChange={(e) =>
											void setRegularAuditInterval(Number(e.target.value))
										}
										style={{
											width: "100%",
											padding: "6px 8px",
											borderRadius: 6,
											border: `1px solid ${theme.colors.border}`,
											background: theme.colors.surface,
											color: theme.colors.text,
											fontFamily: theme.fonts.body,
											fontSize: theme.fontSizes[1],
											cursor:
												settings && settings.regularAuditEnabled !== false
													? "pointer"
													: "default",
										}}
									>
										{intervalOptions.map((opt) => (
											<option key={opt.value} value={opt.value}>
												{opt.label}
											</option>
										))}
									</select>
								</div>

								<div
									style={{
										padding: "10px 12px",
										borderRadius: 8,
										background: theme.colors.background,
										border: `1px solid ${theme.colors.border}`,
										textAlign: "left",
									}}
								>
									<span
										style={{
											display: "block",
											fontSize: theme.fontSizes[1],
											fontWeight: 600,
											lineHeight: 1.3,
										}}
									>
										Maintainer model
									</span>
									<span
										style={{
											display: "block",
											fontSize: theme.fontSizes[0],
											color: muted,
											lineHeight: 1.45,
											marginTop: 4,
										}}
									>
										{maintainerModels
											? `Auto free-tier → ${maintainerModels.resolved} (${maintainerModels.source}${
													maintainerModels.freeCount > 0
														? ` · ${maintainerModels.freeCount} free found`
														: ""
												}). Manual picker coming later.`
											: "Discovering free OpenCode models…"}
									</span>
								</div>
							</>
						)}

						{activeTab === "jev" && (
							<>
								<div
									style={{
										padding: "10px 12px",
										marginBottom: 8,
										borderRadius: 8,
										background: theme.colors.background,
										border: `1px solid ${theme.colors.border}`,
									}}
								>
								<label
									htmlFor="typesafe-api-key"
									style={{
										display: "block",
										fontSize: theme.fontSizes[1],
										fontWeight: 600,
										lineHeight: 1.3,
										marginBottom: 6,
									}}
								>
									Jev API key (TypeSafe AI)
								</label>
								<div style={{ display: "flex", gap: 8 }}>
									<input
										id="typesafe-api-key"
										type="password"
										autoComplete="off"
										spellCheck={false}
										placeholder="sk-…"
										value={typesafeKey}
										disabled={
											!typesafeKeyLoaded || savingKey === "typesafeApiKey"
										}
										onChange={(e) => setTypesafeKey(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter" && typesafeKeyDirty) {
												void saveTypesafeKey();
											}
										}}
										style={{
											flex: 1,
											minWidth: 0,
											padding: "6px 8px",
											borderRadius: 6,
											border: `1px solid ${theme.colors.border}`,
											background: theme.colors.surface,
											color: theme.colors.text,
											fontFamily: theme.fonts.body,
											fontSize: theme.fontSizes[1],
										}}
									/>
									<button
										type="button"
										onClick={() => void saveTypesafeKey()}
										disabled={
											!typesafeKeyDirty || savingKey === "typesafeApiKey"
										}
										style={{
											flexShrink: 0,
											padding: "0 14px",
											height: 32,
											borderRadius: 6,
											fontSize: theme.fontSizes[1],
											fontWeight: 500,
											fontFamily: theme.fonts.body,
											background: typesafeKeyDirty
												? theme.colors.primary
												: theme.colors.surface,
											color: typesafeKeyDirty
												? theme.colors.background
												: muted,
											border: `1px solid ${
												typesafeKeyDirty
													? theme.colors.primary
													: theme.colors.border
											}`,
											cursor:
												typesafeKeyDirty &&
												savingKey !== "typesafeApiKey"
													? "pointer"
													: "default",
										}}
									>
										{savingKey === "typesafeApiKey" ? "Saving…" : "Save"}
									</button>
								</div>
								<span
									style={{
										display: "block",
										fontSize: theme.fontSizes[0],
										color: muted,
										lineHeight: 1.45,
										marginTop: 8,
									}}
								>
									{settings?.typesafeApiKey
										? "A key is configured. "
										: "No key configured — proposal scoring stays disabled until you add one. "}
									Used for proposal second opinions via{" "}
									<code>api.typesafe.ai/v1/systemone</code> (model{" "}
									<code>jev-latest</code>). Stored locally; get a key at
									console.typesafe.ai/keys. Falls back to the{" "}
									<code>TYPESAFE_API_KEY</code> environment variable.
								</span>
								</div>

								<label
									style={{
										display: "flex",
										alignItems: "center",
										gap: 12,
										padding: "10px 12px",
										marginBottom: 8,
										borderRadius: 8,
										background: theme.colors.background,
										border: `1px solid ${theme.colors.border}`,
										cursor:
											settings && hasTypesafeKey && savingKey !== "autoAccept"
												? "pointer"
												: "default",
										opacity: settings && hasTypesafeKey ? 1 : 0.6,
									}}
								>
									<input
										type="checkbox"
										checked={
											settings?.autoAcceptSubsystemModelProposals ?? false
										}
										disabled={
											!settings || !hasTypesafeKey || savingKey === "autoAccept"
										}
										onChange={() => void toggleAutoAccept()}
										style={{
											width: 16,
											height: 16,
											accentColor: theme.colors.primary,
											cursor:
												settings && hasTypesafeKey && savingKey !== "autoAccept"
													? "pointer"
													: "default",
											flexShrink: 0,
										}}
									/>
									<span style={{ minWidth: 0, flex: 1 }}>
										<span
											style={{
												display: "block",
												fontSize: theme.fontSizes[1],
												fontWeight: 600,
												lineHeight: 1.3,
											}}
										>
											Auto-accept correction proposals
										</span>
										<span
											style={{
												display: "block",
												fontSize: theme.fontSizes[0],
												color: muted,
												lineHeight: 1.4,
												marginTop: 2,
											}}
										>
											{hasTypesafeKey
												? "Apply agent patches immediately when Jev confidence clears the bar below. Off = confirm each change."
												: "Add and save a Jev API key above to enable auto-accept."}
										</span>
									</span>
								</label>

								<div
									style={{
										padding: "10px 12px",
										marginBottom: 8,
										borderRadius: 8,
										background: theme.colors.background,
										border: `1px solid ${theme.colors.border}`,
										opacity:
											!hasTypesafeKey ||
											settings?.autoAcceptSubsystemModelProposals === false
												? 0.55
												: 1,
									}}
								>
									<label
										htmlFor="auto-accept-threshold"
										style={{
											display: "block",
											fontSize: theme.fontSizes[1],
											fontWeight: 600,
											lineHeight: 1.3,
											marginBottom: 6,
										}}
									>
										Minimum Jev confidence to auto-accept
									</label>
									<select
										id="auto-accept-threshold"
										value={
											settings?.autoAcceptSubsystemModelConfidenceThreshold ??
											0.85
										}
										disabled={
											!settings ||
											!hasTypesafeKey ||
											settings.autoAcceptSubsystemModelProposals === false ||
											savingKey === "autoAcceptThreshold"
										}
										onChange={(e) =>
											void setAutoAcceptThreshold(Number(e.target.value))
										}
										style={{
											width: "100%",
											padding: "6px 8px",
											borderRadius: 6,
											border: `1px solid ${theme.colors.border}`,
											background: theme.colors.surface,
											color: theme.colors.text,
											fontFamily: theme.fonts.body,
											fontSize: theme.fontSizes[1],
											cursor:
												settings &&
												hasTypesafeKey &&
												settings.autoAcceptSubsystemModelProposals
													? "pointer"
													: "default",
										}}
									>
										{AUTO_ACCEPT_CONFIDENCE_OPTIONS.map((opt) => (
											<option key={opt.value} value={opt.value}>
												{opt.label}
											</option>
										))}
									</select>
									<span
										style={{
											display: "block",
											fontSize: theme.fontSizes[0],
											color: muted,
											lineHeight: 1.45,
											marginTop: 4,
										}}
									>
										Proposals are scored by Jev before applying; only those at
										or above this confidence auto-accept. Others stay pending.
									</span>
								</div>
							</>
						)}

						{activeTab === "tools" && (
							<button
								type="button"
								onClick={openPrompt}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 12,
									width: "100%",
									padding: "10px 12px",
									borderRadius: 8,
									background: theme.colors.background,
									border: `1px solid ${theme.colors.border}`,
									color: theme.colors.text,
									fontFamily: theme.fonts.body,
									textAlign: "left",
									cursor: "pointer",
								}}
							>
								<span style={{ color: theme.colors.primary, flexShrink: 0 }}>
									<ScrollText size={18} />
								</span>
								<span style={{ minWidth: 0, flex: 1 }}>
									<span
										style={{
											display: "block",
											fontSize: theme.fontSizes[1],
											fontWeight: 600,
											lineHeight: 1.3,
										}}
									>
										Concept-extractor prompt
									</span>
									<span
										style={{
											display: "block",
											fontSize: theme.fontSizes[0],
											color: muted,
											lineHeight: 1.4,
											marginTop: 2,
										}}
									>
										Open the prompt used for concept extraction
									</span>
								</span>
							</button>
						)}
					</div>
				</div>

				<div
					style={{
						display: "flex",
						justifyContent: "flex-end",
						padding: "14px 24px",
						borderTop: `1px solid ${theme.colors.border}`,
						background: theme.colors.background,
					}}
				>
					<button
						type="button"
						onClick={onClose}
						style={{
							padding: "0 14px",
							height: 36,
							borderRadius: 6,
							fontSize: theme.fontSizes[1],
							fontWeight: 500,
							fontFamily: theme.fonts.body,
							background: theme.colors.primary,
							color: theme.colors.background,
							border: `1px solid ${theme.colors.primary}`,
							cursor: "pointer",
						}}
					>
						Done
					</button>
				</div>
			</div>
		</div>
	);
}

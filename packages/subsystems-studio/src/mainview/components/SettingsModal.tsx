/**
 * SettingsModal — viewer flags (default tabs, auditing, second opinion,
 * maintainer). Opened from the header Settings button. Flag changes go
 * host-side via setSettings so they persist and re-sync the strip.
 */

import { useCallback, useEffect, useState } from "react";
import { Bot, ChevronRight, Database, Gauge, Scale, Server, SlidersHorizontal } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import {
	DEFAULT_TAB_FLAGS,
	type DefaultTabFlags,
	type ViewerSettings,
} from "../../shared/contract";
import { electrobun } from "../rpc";
import { MaintainerPane } from "./MaintainerPane";
import { RepoMonitorPane } from "./RepoMonitorPane";
import { SharedModelsSettingsPane } from "./SharedModelsSettingsPane";
import { SecondOpinionPane } from "./SecondOpinionPane";
import { useEscapeToClose } from "./useEscapeToClose";

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
		key: "tours",
		label: "Tours",
		description: "Cached tour library",
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
		key: "constructs",
		label: "Constructs",
		description: "Verified constructs by repo, with source spans",
	},
	{
		key: "sharedSubsystems",
		label: "Shared Subsystems",
		description: "Read-only models from S3 and Cloudflare R2 buckets",
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
	defaultTabs: { ...DEFAULT_TAB_FLAGS },
	autoAcceptSubsystemModelProposals: false,
	autoAcceptSubsystemModelConfidenceThreshold: 0.85,
	subsystemMaintainerModel: null,
	regularAuditEnabled: true,
	regularAuditIntervalMinutes: 5,
	autoApplyAuditFixes: true,
	typesafeApiKey: null,
	secondOpinionProvider: "typesafe",
	ollamaBaseUrl: null,
	ollamaJudgeModel: null,
	maintenanceRepoKey: null,
	lastActiveTabId: null,
};

type SavingKey =
	| keyof DefaultTabFlags
	| "resetTabs"
	| "autoApplyAuditFixes"
	| "regularAudit"
	| "regularAuditInterval";

/**
 * The audit findings that carry a deterministic one-click fix. Enumerated here
 * (name only, expandable) so the "surface one-click fixes" toggle says exactly
 * which conditions it acts on. Mirrors the three `SubsystemModelAuditFix` kinds
 * and the Maintainer docs' remediation table.
 */
const AUTO_FIX_CONDITIONS: Array<{ name: string; detail: string }> = [
	{
		name: "Declaration line drifted",
		detail:
			"The stored declaration line moved or changed since capture, but Graphify still has an exact symbol match. Applying re-pins the start line and line hash.",
	},
	{
		name: "Signature empty — Graphify has types",
		detail:
			"The component declares no parameter or return types while Graphify does. Applying fills the declaration bags from Graphify's type edges.",
	},
	{
		name: "File missing — unique Graphify relocate",
		detail:
			"The claimed file path is gone and Graphify has a unique definition of the symbol at another path. Applying updates the component's file.",
	},
];

const SETTINGS_TABS = [
	{
		id: "tabs",
		label: "Default tabs",
		icon: SlidersHorizontal,
		description: "",
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
		label: "Second opinion",
		icon: Scale,
		description:
			"Pick the judge that scores correction proposals — TypeSafe's hosted Jev or a local Ollama model — and gate auto-accept on its confidence.",
	},
	{
		id: "maintainer",
		label: "Maintainer",
		icon: Bot,
		description:
			"The OpenCode runtime Maintain agents run on, and which model they use: free tier, a catalog model, or local Ollama.",
	},
	{
		id: "repoMonitor",
		label: "Repository monitor",
		icon: Server,
		description:
			"The shared daemon that owns git-aware file trees, watchers and caches for every repo Studio and the Principal desktop app open.",
	},
	{
		id: "sharedModels",
		label: "Shared models",
		icon: Database,
		description: "Configure the S3 or Cloudflare R2 buckets used by Shared Subsystems.",
	},
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

/**
 * The one-click-fix conditions, collapsed to a name each; clicking a row
 * expands its description. Keeps the Auditing pane scannable while still
 * spelling out exactly what "surface one-click fixes" covers.
 */
function AutoFixConditions() {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [open, setOpen] = useState<string | null>(null);
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
			{AUTO_FIX_CONDITIONS.map((c) => {
				const isOpen = open === c.name;
				return (
					<div key={c.name}>
						<button
							type="button"
							onClick={() => setOpen(isOpen ? null : c.name)}
							aria-expanded={isOpen}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								width: "100%",
								padding: "3px 0",
								background: "transparent",
								border: "none",
								cursor: "pointer",
								color: theme.colors.text,
								fontFamily: theme.fonts.body,
								fontSize: theme.fontSizes[0],
								textAlign: "left",
							}}
						>
							<ChevronRight
								size={12}
								style={{
									flexShrink: 0,
									color: muted,
									transform: isOpen ? "rotate(90deg)" : "none",
									transition: "transform 120ms ease",
								}}
							/>
							<span style={{ fontWeight: 500 }}>{c.name}</span>
						</button>
						{isOpen && (
							<span
								style={{
									display: "block",
									marginLeft: 18,
									fontSize: theme.fontSizes[0],
									color: muted,
									lineHeight: 1.45,
								}}
							>
								{c.detail}
							</span>
						)}
					</div>
				);
			})}
		</div>
	);
}

export function SettingsModal({
	onClose,
	initialTab = "tabs",
}: {
	onClose: () => void;
	/** Tab shown on mount. Lets Storybook land directly on a pane. */
	initialTab?: SettingsTab;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [settings, setSettings] = useState<ViewerSettings | null>(null);
	const [savingKey, setSavingKey] = useState<SavingKey | null>(null);
	const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
	const [narrow, setNarrow] = useState(() =>
		typeof window !== "undefined"
			? window.matchMedia("(max-width: 720px)").matches
			: false,
	);
	const activeTabMeta =
		SETTINGS_TABS.find((tab) => tab.id === activeTab) ?? SETTINGS_TABS[0];

	useEffect(() => {
		const mq = window.matchMedia("(max-width: 720px)");
		const onChange = () => setNarrow(mq.matches);
		onChange();
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, []);

	useEffect(() => {
		let alive = true;
		void electrobun.rpc!.request
			.getSettings({})
			.then((s) => {
				if (!alive) return;
				setSettings(s);
			})
			.catch(() => {
				if (!alive) return;
				setSettings(FALLBACK_SETTINGS);
			});
		return () => {
			alive = false;
		};
	}, []);

	useEscapeToClose(onClose);

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

	const resetDefaultTabs = useCallback(async () => {
		if (!settings || savingKey !== null) return;
		const defaults = FALLBACK_SETTINGS.defaultTabs;
		const prev = settings.defaultTabs;
		const alreadyDefault = TAB_TOGGLES.every(
			(row) => prev[row.key] === defaults[row.key],
		);
		if (alreadyDefault) return;
		setSavingKey("resetTabs");
		setSettings({
			...settings,
			defaultTabs: { ...defaults },
		});
		try {
			const res = await electrobun.rpc!.request.setSettings({
				settings: { defaultTabs: { ...defaults } },
			});
			if (res.ok && res.settings?.defaultTabs) setSettings(res.settings);
		} catch {
			setSettings({
				...settings,
				defaultTabs: prev,
			});
		} finally {
			setSavingKey(null);
		}
	}, [settings, savingKey]);

	const toggleAutoApplyAuditFixes = useCallback(async () => {
		if (!settings) return;
		const nextValue = !settings.autoApplyAuditFixes;
		setSavingKey("autoApplyAuditFixes");
		setSettings({ ...settings, autoApplyAuditFixes: nextValue });
		try {
			const res = await electrobun.rpc!.request.setSettings({
				settings: { autoApplyAuditFixes: nextValue },
			});
			if (res.ok) setSettings(res.settings);
		} catch {
			setSettings({ ...settings, autoApplyAuditFixes: !nextValue });
		} finally {
			setSavingKey(null);
		}
	}, [settings]);

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

	const tabsAtDefaults =
		!!settings &&
		TAB_TOGGLES.every(
			(row) =>
				settings.defaultTabs[row.key] ===
				FALLBACK_SETTINGS.defaultTabs[row.key],
		);
	const resetTabsEnabled =
		!!settings && !tabsAtDefaults && savingKey === null;

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
					{activeTabMeta.description && (
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
					)}
				</div>

				<div
					style={{
						display: "flex",
						flexDirection: narrow ? "column" : "row",
						flex: 1,
						minHeight: 0,
						overflow: "hidden",
					}}
				>
					<nav
						style={{
							width: narrow ? "auto" : 184,
							flexShrink: 0,
							display: "flex",
							flexDirection: narrow ? "row" : "column",
							gap: 4,
							padding: 12,
							borderRight: narrow
								? "none"
								: `1px solid ${theme.colors.border}`,
							borderBottom: narrow
								? `1px solid ${theme.colors.border}`
								: "none",
							background: theme.colors.background,
							overflowX: narrow ? "auto" : undefined,
							overflowY: narrow ? "hidden" : "auto",
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
										width: narrow ? "auto" : "100%",
										flexShrink: narrow ? 0 : undefined,
										whiteSpace: narrow ? "nowrap" : undefined,
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
							padding: narrow ? "16px 14px" : "20px 24px",
						}}
					>
						{activeTab === "tabs" && (
							<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
								<div
									style={{
										display: "flex",
										flexDirection: narrow ? "column" : "row",
										alignItems: narrow ? "stretch" : "center",
										justifyContent: "space-between",
										gap: 12,
										marginBottom: 4,
									}}
								>
									<span
										style={{
											fontSize: theme.fontSizes[0],
											color: muted,
											lineHeight: 1.4,
										}}
									>
										Subsystems starts on. Other tabs are opt-in; Shared Subsystems appears after a source is configured.
									</span>
									<button
										type="button"
										onClick={() => void resetDefaultTabs()}
										disabled={!resetTabsEnabled}
										title={
											tabsAtDefaults
												? "Already at the recommended tab defaults"
												: "Restore the recommended tab defaults"
										}
										style={{
											flexShrink: 0,
											padding: "0 14px",
											height: 32,
											borderRadius: 6,
											fontSize: theme.fontSizes[1],
											fontWeight: 500,
											fontFamily: theme.fonts.body,
											background: resetTabsEnabled
												? theme.colors.surface
												: theme.colors.background,
											color: resetTabsEnabled
												? theme.colors.text
												: muted,
											border: `1px solid ${theme.colors.border}`,
											cursor: resetTabsEnabled ? "pointer" : "default",
											opacity: resetTabsEnabled ? 1 : 0.7,
										}}
									>
										{savingKey === "resetTabs"
											? "Resetting…"
											: "Reset defaults"}
									</button>
								</div>
								{TAB_TOGGLES.map((row) => {
									const on =
										settings?.defaultTabs[row.key] ??
										DEFAULT_TAB_FLAGS[row.key];
									const busy =
										savingKey === row.key || savingKey === "resetTabs";
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
										marginTop: 8,
										borderRadius: 8,
										background: theme.colors.background,
										border: `1px solid ${theme.colors.border}`,
									}}
								>
									<label
										style={{
											display: "flex",
											alignItems: "center",
											gap: 12,
											cursor:
												settings && savingKey !== "autoApplyAuditFixes"
													? "pointer"
													: "default",
										}}
									>
										<input
											type="checkbox"
											checked={settings?.autoApplyAuditFixes ?? false}
											disabled={!settings || savingKey === "autoApplyAuditFixes"}
											onChange={() => void toggleAutoApplyAuditFixes()}
											style={{
												width: 16,
												height: 16,
												accentColor: theme.colors.success ?? "#2da44e",
												cursor:
													settings && savingKey !== "autoApplyAuditFixes"
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
												Surface one-click fixes during audit
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
												Show the deterministic fixes an audit finds as a
												confirmation bar on the model, with one Apply all.
												Nothing is written until you approve.
											</span>
										</span>
									</label>
									<div style={{ marginTop: 10, paddingLeft: 28 }}>
										<span
											style={{
												display: "block",
												fontSize: theme.fontSizes[0],
												color: muted,
												lineHeight: 1.4,
												marginBottom: 2,
											}}
										>
											One-click fix conditions:
										</span>
										<AutoFixConditions />
									</div>
								</div>
							</>
						)}

						{activeTab === "jev" && (
							<SecondOpinionPane settings={settings} onSettings={setSettings} />
						)}

						{activeTab === "maintainer" && (
							<MaintainerPane settings={settings} onSettings={setSettings} />
						)}

						{activeTab === "repoMonitor" && <RepoMonitorPane />}
						{activeTab === "sharedModels" && <SharedModelsSettingsPane />}
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

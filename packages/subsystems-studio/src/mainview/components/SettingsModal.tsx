/**
 * SettingsModal — viewer flags + utility actions (default tabs, open the
 * concept-extractor prompt). Opened from the header Settings button. Flag
 * changes go host-side via setSettings so they persist and re-sync the strip.
 */

import { useCallback, useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
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
		key: "subsystems",
		label: "Subsystems",
		description: "Saved subsystem component graphs",
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
		subsystems: true,
		opencodeV2: true,
	},
	autoAcceptSubsystemModelProposals: false,
	subsystemMaintainerModel: null,
	regularAuditEnabled: true,
	regularAuditIntervalMinutes: 5,
};

type SavingKey =
	| keyof DefaultTabFlags
	| "autoAccept"
	| "regularAudit"
	| "regularAuditInterval";

export function SettingsModal({ onClose }: { onClose: () => void }) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [settings, setSettings] = useState<ViewerSettings | null>(null);
	const [savingKey, setSavingKey] = useState<SavingKey | null>(null);
	const [maintainerModels, setMaintainerModels] = useState<{
		resolved: string;
		source: string;
		freeCount: number;
	} | null>(null);

	useEffect(() => {
		let alive = true;
		void electrobun.rpc!.request
			.getSettings({})
			.then((s) => {
				if (alive) setSettings(s);
			})
			.catch(() => {
				if (alive) setSettings(FALLBACK_SETTINGS);
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
					width: "min(440px, calc(100vw - 48px))",
					maxHeight: "calc(100vh - 48px)",
					overflowY: "auto",
					background: theme.colors.surface,
					border: `1px solid ${theme.colors.border}`,
					borderRadius: 12,
					padding: 24,
					boxShadow: "0 12px 48px rgba(0,0,0,0.4)",
					color: theme.colors.text,
				}}
			>
				<div style={{ marginBottom: 4 }}>
					<span style={{ fontSize: theme.fontSizes[3], fontWeight: 600 }}>
						Settings
					</span>
				</div>
				<p
					style={{
						margin: "0 0 16px",
						fontSize: theme.fontSizes[0],
						color: muted,
						lineHeight: 1.5,
					}}
				>
					Choose which tabs appear in the strip by default. Changes apply
					immediately and persist across launches.
				</p>

				<div
					style={{
						fontSize: theme.fontSizes[0],
						fontWeight: 600,
						color: muted,
						textTransform: "uppercase",
						letterSpacing: "0.04em",
						marginBottom: 8,
					}}
				>
					Default tabs
				</div>

				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 8,
						marginBottom: 20,
					}}
				>
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
										cursor: settings && !busy ? "pointer" : "default",
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

				<div
					style={{
						fontSize: theme.fontSizes[0],
						fontWeight: 600,
						color: muted,
						textTransform: "uppercase",
						letterSpacing: "0.04em",
						marginBottom: 8,
					}}
				>
					Model maintainer
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
						cursor: settings && savingKey !== "autoAccept" ? "pointer" : "default",
						opacity: settings ? 1 : 0.6,
					}}
				>
					<input
						type="checkbox"
						checked={settings?.autoAcceptSubsystemModelProposals ?? false}
						disabled={!settings || savingKey === "autoAccept"}
						onChange={() => void toggleAutoAccept()}
						style={{
							width: 16,
							height: 16,
							accentColor: theme.colors.primary,
							cursor:
								settings && savingKey !== "autoAccept" ? "pointer" : "default",
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
							Apply agent patches immediately. Leave off until you trust the
							proposals — default is confirm each change.
						</span>
					</span>
				</label>

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
							settings && savingKey !== "regularAudit" ? "pointer" : "default",
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
							While Studio is open, dry-run audit all stored subsystem models
							on a schedule so list badges stay current.
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
						opacity: settings?.regularAuditEnabled === false ? 0.55 : 1,
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
						marginBottom: 20,
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

				<div
					style={{
						fontSize: theme.fontSizes[0],
						fontWeight: 600,
						color: muted,
						textTransform: "uppercase",
						letterSpacing: "0.04em",
						marginBottom: 8,
					}}
				>
					Tools
				</div>
				<button
					type="button"
					onClick={openPrompt}
					style={{
						display: "flex",
						alignItems: "center",
						gap: 12,
						width: "100%",
						padding: "10px 12px",
						marginBottom: 20,
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

				<div style={{ display: "flex", justifyContent: "flex-end" }}>
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

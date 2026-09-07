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
];

export function SettingsModal({ onClose }: { onClose: () => void }) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [settings, setSettings] = useState<ViewerSettings | null>(null);
	const [savingKey, setSavingKey] = useState<keyof DefaultTabFlags | null>(null);

	useEffect(() => {
		let alive = true;
		void electrobun.rpc!.request
			.getSettings({})
			.then((s) => {
				if (alive) setSettings(s);
			})
			.catch(() => {
				if (alive) {
					setSettings({
						defaultTabs: {
							sessions: true,
							trails: true,
							graphify: true,
							subsystems: true,
						},
					});
				}
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
				defaultTabs: { ...settings.defaultTabs, [key]: !nextValue },
			});
		} finally {
			setSavingKey(null);
		}
	}, [settings]);

	const openPrompt = useCallback(() => {
		void electrobun.rpc!.request.openPromptTab({});
		onClose();
	}, [onClose]);

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

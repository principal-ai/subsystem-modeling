/**
 * Pick a free OpenCode model before starting Maintain (issue-fixer or gap-filler).
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import { electrobun } from "../rpc";

type FreeModelRow = {
	ref: string;
	id: string;
	providerID: string;
	name?: string;
};

export function MaintainModelPickerModal({
	graphId,
	title,
	mode,
	onClose,
	onStarted,
}: {
	graphId: string;
	title: string;
	mode: "issues" | "gaps";
	onClose: () => void;
	onStarted: (info: { model: string; alreadyRunning?: boolean }) => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [freeModels, setFreeModels] = useState<FreeModelRow[]>([]);
	const [resolved, setResolved] = useState<string | null>(null);
	const [source, setSource] = useState<string | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const [remember, setRemember] = useState(true);
	const [starting, setStarting] = useState(false);

	const agentLabel = mode === "issues" ? "issue-fixer" : "gap-filler";
	const actionLabel = "Run maintenance";

	const load = useCallback(async (refresh?: boolean) => {
		if (refresh) setRefreshing(true);
		else setLoading(true);
		setError(null);
		try {
			const res = await electrobun.rpc!.request.getSubsystemMaintainerModels({
				refresh: refresh === true,
			});
			if (!res.ok) {
				setError(res.error ?? "Failed to list models");
				setFreeModels([]);
				return;
			}
			const rows = res.freeModels ?? [];
			setFreeModels(rows);
			setResolved(res.resolved ?? null);
			setSource(res.source ?? null);
			setSelected((prev) => {
				if (prev && rows.some((r) => r.ref === prev)) return prev;
				if (res.configured && rows.some((r) => r.ref === res.configured)) {
					return res.configured;
				}
				if (res.resolved && rows.some((r) => r.ref === res.resolved)) {
					return res.resolved;
				}
				return rows[0]?.ref ?? res.resolved ?? null;
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	}, []);

	useEffect(() => {
		void load(false);
	}, [load]);

	const onRun = useCallback(async () => {
		if (!selected || starting) return;
		setStarting(true);
		setError(null);
		try {
			const res = await electrobun.rpc!.request.maintainSubsystemModel({
				graphId,
				model: selected,
				remember,
			});
			if (!res.ok) {
				setError(res.error ?? "Failed to start maintainer");
				setStarting(false);
				return;
			}
			onStarted({ model: selected, alreadyRunning: res.alreadyRunning });
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setStarting(false);
		}
	}, [graphId, onClose, onStarted, remember, selected, starting]);

	return (
		<div
			role="dialog"
			aria-modal
			aria-label={`Choose model for ${actionLabel}`}
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
					maxHeight: "min(80vh, 640px)",
					overflow: "auto",
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
						{actionLabel}
					</span>
				</div>
				<p
					style={{
						margin: "0 0 14px",
						fontSize: theme.fontSizes[0],
						color: muted,
						lineHeight: 1.5,
					}}
				>
					{title} — pick a free OpenCode model for{" "}
					<code
						style={{
							fontFamily: theme.fonts.monospace ?? "ui-monospace, monospace",
						}}
					>
						{agentLabel}
					</code>
					.
					{resolved && source
						? ` Default right now: ${resolved} (${source}).`
						: null}
				</p>

				{error && (
					<p
						style={{
							margin: "0 0 12px",
							color: theme.colors.error ?? "#e5534b",
							fontSize: theme.fontSizes[0],
						}}
					>
						{error}
					</p>
				)}

				{loading ? (
					<p
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							color: muted,
							fontSize: theme.fontSizes[1],
						}}
					>
						<Loader2 size={14} className="principal-studio-spin" />
						Loading free models…
					</p>
				) : freeModels.length === 0 ? (
					<p style={{ color: muted, fontSize: theme.fontSizes[1] }}>
						No free models found. Refresh or set SUBSYSTEM_MAINTAINER_MODEL.
					</p>
				) : (
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: 6,
							marginBottom: 14,
						}}
					>
						{freeModels.map((m) => {
							const on = selected === m.ref;
							return (
								<label
									key={m.ref}
									style={{
										display: "flex",
										alignItems: "flex-start",
										gap: 10,
										padding: "10px 12px",
										borderRadius: 8,
										background: theme.colors.background,
										border: `1px solid ${
											on ? theme.colors.primary : theme.colors.border
										}`,
										cursor: starting ? "default" : "pointer",
									}}
								>
									<input
										type="radio"
										name="maintainer-model"
										checked={on}
										disabled={starting}
										onChange={() => setSelected(m.ref)}
										style={{
											marginTop: 3,
											accentColor: theme.colors.primary,
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
											{m.name ?? m.id}
										</span>
										<span
											style={{
												display: "block",
												fontSize: theme.fontSizes[0],
												color: muted,
												fontFamily:
													theme.fonts.monospace ?? "ui-monospace, monospace",
												marginTop: 2,
												wordBreak: "break-all",
											}}
										>
											{m.ref}
										</span>
									</span>
								</label>
							);
						})}
					</div>
				)}

				<label
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						marginBottom: 16,
						fontSize: theme.fontSizes[0],
						color: muted,
						cursor: starting ? "default" : "pointer",
					}}
				>
					<input
						type="checkbox"
						checked={remember}
						disabled={starting}
						onChange={(e) => setRemember(e.target.checked)}
						style={{ accentColor: theme.colors.primary }}
					/>
					Remember as default for next Maintain
				</label>

				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						gap: 8,
						flexWrap: "wrap",
					}}
				>
					<button
						type="button"
						disabled={loading || refreshing || starting}
						onClick={() => void load(true)}
						style={{
							padding: "0 12px",
							height: 36,
							borderRadius: 6,
							fontSize: theme.fontSizes[1],
							fontFamily: theme.fonts.body,
							background: "transparent",
							color: theme.colors.text,
							border: `1px solid ${theme.colors.border}`,
							cursor: loading || refreshing || starting ? "default" : "pointer",
							opacity: loading || refreshing || starting ? 0.6 : 1,
						}}
					>
						{refreshing ? "Refreshing…" : "Refresh list"}
					</button>
					<div style={{ display: "flex", gap: 8 }}>
						<button
							type="button"
							disabled={starting}
							onClick={onClose}
							style={{
								padding: "0 12px",
								height: 36,
								borderRadius: 6,
								fontSize: theme.fontSizes[1],
								fontFamily: theme.fonts.body,
								background: "transparent",
								color: theme.colors.text,
								border: `1px solid ${theme.colors.border}`,
								cursor: starting ? "default" : "pointer",
							}}
						>
							Cancel
						</button>
						<button
							type="button"
							disabled={!selected || starting || loading}
							onClick={() => void onRun()}
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
								cursor:
									!selected || starting || loading ? "default" : "pointer",
								opacity: !selected || starting || loading ? 0.6 : 1,
								display: "inline-flex",
								alignItems: "center",
								gap: 6,
							}}
						>
							{starting && (
								<Loader2 size={14} className="principal-studio-spin" />
							)}
							{starting ? "Starting…" : "Run"}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

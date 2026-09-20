/**
 * Pick a model to run Maintain with: Auto (best available — free Zen when
 * healthy, credentialed fallback otherwise), a credentialed model, or a free
 * OpenCode Zen model.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import { electrobun } from "../rpc";

type ModelRow = {
	ref: string;
	id: string;
	providerID: string;
	name?: string;
};

const AUTO = "__auto__";

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
	// Credentialed tool-capable models (e.g. opencode-go/*) vs free Zen (opencode/*).
	const [credModels, setCredModels] = useState<ModelRow[]>([]);
	const [freeModels, setFreeModels] = useState<ModelRow[]>([]);
	const [resolved, setResolved] = useState<string | null>(null);
	const [source, setSource] = useState<string | null>(null);
	const [note, setNote] = useState<string | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const [remember, setRemember] = useState(true);
	const [starting, setStarting] = useState(false);

	const agentLabel =
		mode === "issues"
			? "issue-fixer / topology-fixer"
			: "gap-filler / boundary-gap-filler / topology-gap-filler";
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
				setCredModels([]);
				setFreeModels([]);
				return;
			}
			const all = [...(res.models ?? []), ...(res.freeModels ?? [])];
			const seen = new Set<string>();
			const nonZen: ModelRow[] = [];
			const zen: ModelRow[] = [];
			for (const r of all) {
				if (seen.has(r.ref)) continue;
				seen.add(r.ref);
				// "opencode/*" = OpenCode Zen (free provider); everything else
				// (opencode-go/*, etc.) is a credentialed tool-capable provider.
				if (r.providerID === "opencode") zen.push(r);
				else nonZen.push(r);
			}
			setCredModels(nonZen);
			setFreeModels(zen);
			setResolved(res.resolved ?? null);
			setSource(res.source ?? null);
			setNote(res.note ?? null);
			setSelected((prev) => {
				if (
					prev &&
					(prev === AUTO ||
						nonZen.some((r) => r.ref === prev) ||
						zen.some((r) => r.ref === prev))
				) {
					return prev;
				}
				return AUTO;
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
				// Auto = let the host resolve (free if healthy, else credentialed fallback).
				model: selected === AUTO ? undefined : selected,
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

	const hasAny = credModels.length > 0 || freeModels.length > 0;

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
					width: "min(460px, calc(100vw - 48px))",
					maxHeight: "min(82vh, 680px)",
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
					{title} — pick a model for{" "}
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

				{note && (
					<p
						style={{
							margin: "0 0 12px",
							padding: "8px 10px",
							borderRadius: 6,
							background: theme.colors.background,
							border: `1px solid ${theme.colors.border}`,
							color: muted,
							fontSize: theme.fontSizes[0],
							lineHeight: 1.5,
						}}
					>
						{note}
					</p>
				)}

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
						Loading models…
					</p>
				) : !hasAny ? (
					<p style={{ color: muted, fontSize: theme.fontSizes[1] }}>
						No eligible models found. Connect a provider in OpenCode,
						refresh, or set SUBSYSTEM_MAINTAINER_MODEL.
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
						<label
							style={{
								display: "flex",
								alignItems: "flex-start",
								gap: 10,
								padding: "10px 12px",
								borderRadius: 8,
								background: theme.colors.background,
								border: `1px solid ${
									selected === AUTO ? theme.colors.primary : theme.colors.border
								}`,
								cursor: starting ? "default" : "pointer",
							}}
						>
							<input
								type="radio"
								name="maintainer-model"
								checked={selected === AUTO}
								disabled={starting}
								onChange={() => setSelected(AUTO)}
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
									Auto — best available
								</span>
								<span
									style={{
										display: "block",
										fontSize: theme.fontSizes[0],
										color: muted,
										marginTop: 2,
									}}
								>
									Uses the free Zen model when it works; falls back to the
									credentialed model (e.g. opencode-go) if the free tier is
									down or unauthenticated.
								</span>
							</span>
						</label>

						{credModels.length > 0 && (
							<>
								<div
									style={{
										fontSize: theme.fontSizes[0],
										textTransform: "uppercase",
										letterSpacing: 0.3,
										color: muted,
										margin: "8px 2px 2px",
									}}
								>
									Credentialed
								</div>
								{credModels.map((m) => (
									<ModelRowRow
										key={m.ref}
										row={m}
										selected={selected}
										disabled={starting}
										theme={theme}
										muted={muted}
										onSelect={setSelected}
									/>
								))}
							</>
						)}

						{freeModels.length > 0 && (
							<>
								<div
									style={{
										fontSize: theme.fontSizes[0],
										textTransform: "uppercase",
										letterSpacing: 0.3,
										color: muted,
										margin: "8px 2px 2px",
									}}
								>
									Free — OpenCode Zen{note ? " (may be unavailable)" : ""}
								</div>
								{freeModels.map((m) => (
									<ModelRowRow
										key={m.ref}
										row={m}
										selected={selected}
										disabled={starting}
										theme={theme}
										muted={muted}
										onSelect={setSelected}
									/>
								))}
							</>
						)}
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

function ModelRowRow({
	row,
	selected,
	disabled,
	theme,
	muted,
	onSelect,
}: {
	row: ModelRow;
	selected: string | null;
	disabled: boolean;
	theme: ReturnType<typeof useTheme>["theme"];
	muted: string;
	onSelect: (ref: string) => void;
}) {
	const on = selected === row.ref;
	return (
		<label
			style={{
				display: "flex",
				alignItems: "flex-start",
				gap: 10,
				padding: "10px 12px",
				borderRadius: 8,
				background: theme.colors.background,
				border: `1px solid ${on ? theme.colors.primary : theme.colors.border}`,
				cursor: disabled ? "default" : "pointer",
			}}
		>
			<input
				type="radio"
				name="maintainer-model"
				checked={on}
				disabled={disabled}
				onChange={() => onSelect(row.ref)}
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
					{row.name ?? row.id}
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
					{row.ref}
				</span>
			</span>
		</label>
	);
}
/**
 * Pick a model to run Maintain with: Auto (best available — free Zen when
 * healthy, credentialed fallback otherwise), a credentialed model, or a free
 * OpenCode Zen model.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Wrench } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import { electrobun } from "../rpc";
import {
	Modal,
	ModalBody,
	ModalButton,
	ModalFooter,
	ModalHeader,
} from "./Modal";

type ModelRow = {
	ref: string;
	id: string;
	providerID: string;
	name?: string;
};

const AUTO = "__auto__";

/** Maintain agent id → display name (mirrors MaintenancePanel's AGENT_META). */
const AGENT_DISPLAY: Record<string, string> = {
	"construct-fixer": "Construct Fixer",
	"package-module-fixer": "Package/Module Fixer",
	"construct-verifier": "Construct Verifier",
	"package-module-verifier": "Package/Module Verifier",
	"runtime-topology-verifier": "Runtime Topology Verifier",
};

export function MaintainModelPickerModal({
	graphId,
	title,
	mode,
	agent,
	onClose,
	onStarted,
}: {
	graphId: string;
	title: string;
	mode: "issues" | "verify";
	/** Exact Maintain agent the next run will use (`nextRoute.agent`). */
	agent?: string | null;
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
	// Visible-tier flag: "go" = credentialed (opencode-go etc.), "free" = OpenCode
	// Zen free tier, "auto" = show both (Auto resolves the best).
	const [tier, setTier] = useState<"auto" | "go" | "free">("auto");
	const [remember, setRemember] = useState(true);
	const [starting, setStarting] = useState(false);
	// The full model list is lazy: only fetched once the user opens the changer.
	const [modelsOpen, setModelsOpen] = useState(false);
	const modelsFetched = useRef(false);

	// The next stage's agent, when known, is the precise subject; otherwise fall
	// back to the tier-level list.
	const hasAgent = !!agent;
	const agentLabel =
		(agent && AGENT_DISPLAY[agent]) ||
		agent ||
		(mode === "issues"
			? "construct-fixer / package-module-fixer"
			: "construct-verifier / package-module-verifier / runtime-topology-verifier");
	// With a known agent the action is "Run <Agent>"; otherwise the generic label.
	const actionLabel = hasAgent ? `Run ${agentLabel}` : "Run maintenance";

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
			// Go tier = paid Zen Go tool-call models; Free tier = OpenCode Zen
			// (`opencode/*`) free models. `res.freeModels` can include other
			// zero-cost providers, so keep the Free bucket to Zen only.
			const go = (res.goModels ?? []).filter((r) => r.ref);
			const zen = (res.freeModels ?? []).filter(
				(r) => r.providerID === "opencode",
			);
			// Legacy fallback: model picker rows (non-Zen) when no goModels.
			const credFallback = (res.models ?? []).filter(
				(r) => r.providerID !== "opencode",
			);
			setCredModels(go.length > 0 ? go : credFallback);
			setFreeModels(zen);
			setResolved(res.resolved ?? null);
			setSource(res.source ?? null);
			setNote(res.note ?? null);
			modelsFetched.current = true;
			setSelected((prev) => {
				if (
					prev &&
					(prev === AUTO ||
						go.some((r) => r.ref === prev) ||
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

	const openModelList = () => {
		setModelsOpen(true);
		if (!modelsFetched.current) void load(false);
	};

	useEffect(() => {
		let alive = true;
		void (async () => {
			try {
				const s = await electrobun.rpc!.request.getSettings({});
				if (!alive) return;
				const remembered = s?.subsystemMaintainerModel ?? null;
				setSelected(
					typeof remembered === "string" && remembered.length > 0
						? remembered
						: AUTO,
				);
			} catch {
				setSelected(AUTO);
			} finally {
				if (alive) setLoading(false);
			}
		})();
		return () => {
			alive = false;
		};
	}, []);

	const onRun = useCallback(async () => {
		if (!selected || starting) return;
		setStarting(true);
		setError(null);
		const runModel = selected;
		onStarted({ model: runModel });
		onClose();
		electrobun.rpc!.request
			.maintainSubsystemModel({
				graphId,
				model: runModel === AUTO ? undefined : runModel,
				remember,
			})
			.catch(() => {});
	}, [graphId, onClose, onStarted, remember, selected, starting]);

	const hasAny = credModels.length > 0 || freeModels.length > 0;
	const selectedRow =
		selected === AUTO || !selected
			? null
			: credModels.find((m) => m.ref === selected) ??
				freeModels.find((m) => m.ref === selected) ??
				null;

	// One-click tier pick: selecting the flag filters to that tier's models and
	// drops the first one in as the run model (Auto keeps host resolution).
	const selectTier = (next: "auto" | "go" | "free") => {
		setTier(next);
		if (next === "go") setSelected(credModels[0]?.ref ?? AUTO);
		else if (next === "free") setSelected(freeModels[0]?.ref ?? AUTO);
		else setSelected(AUTO);
	};
	const shownCred = tier === "free" ? [] : credModels;
	const shownFree = tier === "go" ? [] : freeModels;

	return (
		<Modal
			ariaLabel={`Choose model for ${actionLabel}`}
			width={460}
			onClose={starting ? undefined : onClose}
		>
			<ModalHeader icon={Wrench} title={actionLabel} />
			<ModalBody scroll={false}>
				{(!hasAgent || (resolved && source)) && (
					<p
						style={{
							margin: "0 0 14px",
							fontSize: theme.fontSizes[0],
							color: muted,
							lineHeight: 1.5,
						}}
					>
						{hasAgent ? null : (
							<>
								{title} — pick a model for{" "}
								<code
									style={{
										fontFamily:
											theme.fonts.monospace ?? "ui-monospace, monospace",
									}}
								>
									{agentLabel}
								</code>
								.
							</>
						)}
						{resolved && source
							? ` Default right now: ${resolved} (${source}).`
							: null}
					</p>
				)}

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

				{modelsOpen ? (
					loading ? (
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
						<div
							style={{
								display: "flex",
								flexWrap: "wrap",
								gap: 6,
								marginBottom: 4,
							}}
						>
							{(["auto", "go", "free"] as const).map((t) => {
								const on = tier === t;
								return (
									<button
										key={t}
										type="button"
										disabled={starting}
										onClick={() => selectTier(t)}
										style={{
											padding: "4px 12px",
											borderRadius: 999,
											fontSize: theme.fontSizes[0],
											fontFamily: theme.fonts.body,
											background: on ? theme.colors.primary : "transparent",
											color: on ? theme.colors.background : theme.colors.text,
											border: `1px solid ${
												on ? theme.colors.primary : theme.colors.border
											}`,
											cursor: starting ? "default" : "pointer",
											fontWeight: 500,
										}}
									>
										{t === "auto" ? "Auto" : t === "go" ? "Go" : "Free Tier"}
									</button>
								);
							})}
						</div>
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

						{tier === "go" && shownCred.length === 0 && (
							<p style={{ color: muted, fontSize: theme.fontSizes[0] }}>
								No credentialed Go models found — run Auto or connect a
								provider in OpenCode.
							</p>
						)}
						{tier === "free" && shownFree.length === 0 && (
							<p style={{ color: muted, fontSize: theme.fontSizes[0] }}>
								No free Zen models found — run Auto or pick Go.
							</p>
						)}

						{shownCred.length > 0 && (
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
									Go — credentialed
								</div>
								{shownCred.map((m) => (
									<ModelRowRow
										key={m.ref}
										row={m}
										tag="Go"
										selected={selected}
										disabled={starting}
										theme={theme}
										muted={muted}
										onSelect={setSelected}
									/>
								))}
							</>
						)}

						{shownFree.length > 0 && (
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
									Free Tier — OpenCode Zen{note ? " (may be unavailable)" : ""}
								</div>
								{shownFree.map((m) => (
									<ModelRowRow
										key={m.ref}
										row={m}
										tag="Free"
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
					)
				) : (
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: 6,
							marginBottom: 14,
						}}
					>
						<div
							style={{
								fontSize: theme.fontSizes[0],
								textTransform: "uppercase",
								letterSpacing: 0.3,
								color: muted,
								margin: "0 2px 2px",
							}}
						>
							Model
						</div>
						<label
							style={{
								display: "flex",
								alignItems: "flex-start",
								gap: 10,
								padding: "10px 12px",
								borderRadius: 8,
								background: theme.colors.background,
								border: `1px solid ${
									selected === AUTO
										? theme.colors.primary
										: theme.colors.border
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
						{selected !== AUTO && selected && (
							<ModelRowRow
								row={
									selectedRow ?? {
										ref: selected,
										id: selected,
										providerID: "",
										name: selected,
									}
								}
								tag={
									selectedRow
										? credModels.some((r) => r.ref === selected)
											? "Go"
											: "Free"
										: "Remembered"
								}
								selected={selected}
								disabled={starting}
								theme={theme}
								muted={muted}
								onSelect={setSelected}
							/>
						)}
						<div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
							<button
								type="button"
								disabled={starting}
								onClick={openModelList}
								style={{
									padding: "4px 12px",
									borderRadius: 999,
									fontSize: theme.fontSizes[0],
									fontFamily: theme.fonts.body,
									background: "transparent",
									color: theme.colors.text,
									border: `1px solid ${theme.colors.border}`,
									cursor: starting ? "default" : "pointer",
								}}
							>
								Change model
							</button>
						</div>
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
			</ModalBody>
			<ModalFooter>
				{modelsOpen && (
					<ModalButton
						disabled={loading || refreshing || starting}
						onClick={() => void load(true)}
						style={{ marginRight: "auto" }}
					>
						{refreshing ? "Refreshing…" : "Refresh list"}
					</ModalButton>
				)}
				<ModalButton disabled={starting} onClick={onClose}>
					Cancel
				</ModalButton>
				<ModalButton
					variant="primary"
					icon={Wrench}
					busy={starting}
					disabled={!selected}
					onClick={() => void onRun()}
				>
					{starting ? "Starting…" : "Run"}
				</ModalButton>
			</ModalFooter>
		</Modal>
	);
}

function ModelRowRow({
	row,
	tag,
	selected,
	disabled,
	theme,
	muted,
	onSelect,
}: {
	row: ModelRow;
	/** Tier flag shown beside the model name ("Go" / "Free"). */
	tag?: string;
	selected: string | null;
	disabled: boolean;
	theme: ReturnType<typeof useTheme>["theme"];
	muted: string;
	onSelect: (ref: string) => void;
}) {
	const on = selected === row.ref;
	const isGo = tag === "Go";
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
						display: "flex",
						alignItems: "center",
						gap: 8,
						fontSize: theme.fontSizes[1],
						fontWeight: 600,
						lineHeight: 1.3,
					}}
				>
					<span style={{ minWidth: 0 }}>{row.name ?? row.id}</span>
					{tag && (
						<span
							style={{
								flexShrink: 0,
								padding: "1px 8px",
								borderRadius: 999,
								fontSize: theme.fontSizes[0],
								fontFamily:
									theme.fonts.monospace ?? "ui-monospace, monospace",
								background: isGo
									? `${theme.colors.primary}22`
									: `${muted}22`,
								color: isGo ? theme.colors.primary : muted,
								border: `1px solid ${
									isGo ? theme.colors.primary : theme.colors.border
								}`,
							}}
						>
							{tag}
						</span>
					)}
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
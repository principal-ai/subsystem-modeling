/**
 * Settings → Second opinion: which judge scores correction proposals (hosted
 * Jev or a local Ollama model), its credentials / model, a one-shot latency
 * test, and the auto-accept gate that depends on it.
 */

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import type {
	JudgeProbeResult,
	PartialViewerSettings,
	SecondOpinionProvider,
	ViewerSettings,
} from "../../shared/contract";
import { electrobun } from "../rpc";
import { OllamaServerCard, useOllamaStatus } from "./OllamaServerCard";
import {
	ActionButton,
	Card,
	CardTitle,
	CheckRow,
	Hint,
	Segmented,
	StatusLine,
	fieldStyle,
	mutedColor,
} from "./settingsPrimitives";

export const AUTO_ACCEPT_CONFIDENCE_OPTIONS = [
	{ value: 0.5, label: "50% — lenient" },
	{ value: 0.6, label: "60%" },
	{ value: 0.7, label: "70%" },
	{ value: 0.75, label: "75%" },
	{ value: 0.8, label: "80%" },
	{ value: 0.85, label: "85% — balanced (default)" },
	{ value: 0.9, label: "90%" },
	{ value: 0.95, label: "95% — strict" },
] as const;

export function SecondOpinionPane({
	settings,
	onSettings,
}: {
	settings: ViewerSettings | null;
	onSettings: (next: ViewerSettings) => void;
}) {
	const { theme } = useTheme();
	const muted = mutedColor(theme);
	const [saving, setSaving] = useState<string | null>(null);
	const [typesafeKey, setTypesafeKey] = useState(settings?.typesafeApiKey ?? "");
	const [probe, setProbe] = useState<JudgeProbeResult | null>(null);
	const [probing, setProbing] = useState(false);
	const ollama = useOllamaStatus();
	useEffect(() => setTypesafeKey(settings?.typesafeApiKey ?? ""), [settings?.typesafeApiKey]);

	const patch = useCallback(async (key: string, patch: PartialViewerSettings) => {
		setSaving(key);
		try {
			const res = await electrobun.rpc!.request.setSettings({ settings: patch });
			if (res.ok) onSettings(res.settings);
			return res.ok;
		} finally {
			setSaving(null);
		}
	}, [onSettings]);

	const provider: SecondOpinionProvider = settings?.secondOpinionProvider ?? "typesafe";
	const hasTypesafeKey = Boolean(settings?.typesafeApiKey);
	const judgeModel = settings?.ollamaJudgeModel ?? null;
	const judgeModelPulled = Boolean(judgeModel && ollama.status?.models.some((m) => m.name === judgeModel));
	// Mirrors the host's `judge.ready`: the gate below stays locked until the
	// chosen judge can actually answer. (The host also falls back to
	// TYPESAFE_API_KEY, which the renderer cannot see.)
	const judgeReady = provider === "typesafe"
		? hasTypesafeKey
		: Boolean(ollama.status?.reachable && judgeModelPulled);
	const judgeLabel = provider === "typesafe" ? "Jev" : judgeModel ? `ollama/${judgeModel}` : "Ollama";

	const typesafeKeyDirty = (typesafeKey.trim() || null) !== (settings?.typesafeApiKey ?? null);
	const saveTypesafeKey = () => {
		const trimmed = typesafeKey.trim();
		void patch("typesafeApiKey", { typesafeApiKey: trimmed.length > 0 ? trimmed : null });
	};

	const runProbe = useCallback(async () => {
		setProbing(true);
		setProbe(null);
		try {
			setProbe(await electrobun.rpc!.request.probeJudge({}));
		} catch (err) {
			setProbe({
				ok: false,
				error: err instanceof Error ? err.message : String(err),
				source: judgeLabel,
				provider,
				elapsedMs: 0,
			});
		} finally {
			setProbing(false);
		}
	}, [judgeLabel, provider]);

	// Embedding-only models can't answer /api/chat, so they never make a judge.
	const judgeModels = (ollama.status?.models ?? []).filter(
		(m) => m.capabilities.length === 0 || m.capabilities.includes("completion"),
	);
	const judgeOptions = judgeModel && !judgeModels.some((m) => m.name === judgeModel)
		? [...judgeModels, { name: judgeModel, capabilities: [], toolcall: false }]
		: judgeModels;

	return (
		<>
			<Card>
				<CardTitle>Judge</CardTitle>
				<Segmented
					value={provider}
					disabled={!settings || saving !== null}
					options={[
						{ value: "typesafe", label: "Jev (TypeSafe)" },
						{ value: "ollama", label: "Ollama (local)" },
					]}
					onChange={(next) => void patch("provider", { secondOpinionProvider: next })}
				/>
				<Hint style={{ marginTop: 8 }}>
					{provider === "typesafe"
						? "Hosted, calibrated, fast (a few seconds). Needs a TypeSafe AI key."
						: "Runs on your machine through Ollama with schema-constrained answers. No key, no data leaves the host; slower, and small models are less calibrated."}
				</Hint>
			</Card>

			{provider === "typesafe" ? (
				<Card>
					<CardTitle htmlFor="typesafe-api-key">Jev API key (TypeSafe AI)</CardTitle>
					<div style={{ display: "flex", gap: 8 }}>
						<input
							id="typesafe-api-key"
							type="password"
							autoComplete="off"
							spellCheck={false}
							placeholder="sk-…"
							value={typesafeKey}
							disabled={!settings || saving === "typesafeApiKey"}
							onChange={(e) => setTypesafeKey(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && typesafeKeyDirty) saveTypesafeKey();
							}}
							style={fieldStyle(theme, { flex: 1 })}
						/>
						<ActionButton
							onClick={saveTypesafeKey}
							disabled={!typesafeKeyDirty || saving === "typesafeApiKey"}
							primary={typesafeKeyDirty}
						>
							{saving === "typesafeApiKey" ? "Saving…" : "Save"}
						</ActionButton>
					</div>
					<Hint style={{ marginTop: 8 }}>
						{hasTypesafeKey
							? "A key is configured. "
							: "No key configured — proposal scoring stays disabled until you add one. "}
						Used for proposal second opinions via <code>api.typesafe.ai/v1/systemone</code> (model{" "}
						<code>jev-latest</code>). Stored locally; get a key at console.typesafe.ai/keys. Falls back to the{" "}
						<code>TYPESAFE_API_KEY</code> environment variable.
					</Hint>
				</Card>
			) : (
				<>
					<OllamaServerCard
						settings={settings}
						status={ollama.status}
						loading={ollama.loading}
						onSaved={(next) => {
							onSettings(next);
							void ollama.refresh();
						}}
					/>
					<Card dimmed={!ollama.status?.reachable}>
						<CardTitle htmlFor="ollama-judge-model">Judge model</CardTitle>
						<select
							id="ollama-judge-model"
							value={judgeModel ?? ""}
							disabled={!settings || !ollama.status?.reachable || saving === "ollamaJudgeModel"}
							onChange={(e) => void patch("ollamaJudgeModel", { ollamaJudgeModel: e.target.value || null })}
							style={fieldStyle(theme, { cursor: "pointer" })}
						>
							<option value="">Choose a model…</option>
							{judgeOptions.map((m) => (
								<option key={m.name} value={m.name}>
									{m.name}
									{m.parameterSize ? ` · ${m.parameterSize}` : ""}
									{m.capabilities.includes("thinking") ? " · thinking (slow)" : ""}
								</option>
							))}
						</select>
						<Hint>
							{judgeModel && !judgeModelPulled && ollama.status?.reachable
								? `${judgeModel} is not pulled on this server — run \`ollama pull ${judgeModel}\` or choose another. `
								: null}
							Any pulled model can judge; tool calling is not required. Small instruct models answer in seconds,
							large thinking models can take minutes per opinion.
						</Hint>
					</Card>
				</>
			)}

			<Card>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
					<div style={{ minWidth: 0 }}>
						<CardTitle>Test the judge</CardTitle>
						<span style={{ display: "block", fontSize: theme.fontSizes[0], color: muted, lineHeight: 1.4 }}>
							Asks {judgeLabel} one canned question and times it. Nothing is stored.
						</span>
					</div>
					<ActionButton onClick={() => void runProbe()} disabled={!settings || probing || !judgeReady}>
						{probing ? "Asking…" : "Run test"}
					</ActionButton>
				</div>
				{probe && (
					<StatusLine tone={probe.ok ? "ok" : "error"}>
						{probe.ok
							? `${probe.source}: ${probe.verdict} · ${probe.risk ?? "no risk score"} · confidence ${Math.round((probe.confidence ?? 0) * 100)}% · ${formatElapsed(probe.elapsedMs)}`
							: `${probe.source}: ${probe.error}${probe.elapsedMs ? ` (${formatElapsed(probe.elapsedMs)})` : ""}`}
					</StatusLine>
				)}
			</Card>

			<CheckRow
				checked={settings?.autoAcceptSubsystemModelProposals ?? false}
				disabled={!settings || !judgeReady || saving === "autoAccept"}
				onChange={() => void patch("autoAccept", {
					autoAcceptSubsystemModelProposals: !settings?.autoAcceptSubsystemModelProposals,
				})}
				title="Auto-accept correction proposals"
				description={judgeReady
					? `Apply agent patches immediately when ${judgeLabel}'s confidence clears the bar below. Off = confirm each change.`
					: provider === "typesafe"
						? "Add and save a Jev API key above to enable auto-accept."
						: "Connect Ollama and choose a pulled judge model above to enable auto-accept."}
			/>

			<Card dimmed={!judgeReady || settings?.autoAcceptSubsystemModelProposals === false}>
				<CardTitle htmlFor="auto-accept-threshold">Minimum judge confidence to auto-accept</CardTitle>
				<select
					id="auto-accept-threshold"
					value={settings?.autoAcceptSubsystemModelConfidenceThreshold ?? 0.85}
					disabled={
						!settings ||
						!judgeReady ||
						settings.autoAcceptSubsystemModelProposals === false ||
						saving === "autoAcceptThreshold"
					}
					onChange={(e) => void patch("autoAcceptThreshold", {
						autoAcceptSubsystemModelConfidenceThreshold: Number(e.target.value),
					})}
					style={fieldStyle(theme, { cursor: "pointer" })}
				>
					{AUTO_ACCEPT_CONFIDENCE_OPTIONS.map((opt) => (
						<option key={opt.value} value={opt.value}>{opt.label}</option>
					))}
				</select>
				<Hint>
					Proposals are scored by {judgeLabel} before applying; only those at or above this confidence
					auto-accept. Others stay pending.
				</Hint>
			</Card>
		</>
	);
}

function formatElapsed(ms: number): string {
	return ms >= 10_000 ? `${Math.round(ms / 1000)} s` : `${(ms / 1000).toFixed(1)} s`;
}

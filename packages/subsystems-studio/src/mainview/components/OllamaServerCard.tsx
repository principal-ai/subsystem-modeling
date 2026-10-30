/**
 * Ollama server card: where the server is, whether it answers, and what it
 * has pulled. Shared by the Second-opinion pane (judge) and the Maintainer
 * pane (agents) so the base URL is edited in one shape everywhere.
 */

import { useCallback, useEffect, useState } from "react";
import type { OllamaIntegrationStatus, ViewerSettings } from "../../shared/contract";
import { electrobun } from "../rpc";
import { useTheme } from "@principal-ade/industry-theme";
import { ActionButton, Card, CardTitle, Hint, StatusLine, fieldStyle } from "./settingsPrimitives";

export const DEFAULT_OLLAMA_URL = "http://localhost:11434";

/** Load + refresh the Ollama integration status; the panes share one hook. */
export function useOllamaStatus() {
	const [status, setStatus] = useState<OllamaIntegrationStatus | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const res = await electrobun.rpc!.request.getOllamaStatus({});
			if (res.ok && res.status) {
				setStatus(res.status);
				setError(null);
			} else {
				setError(res.error ?? "Could not read Ollama status");
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}, []);
	useEffect(() => {
		void refresh();
	}, [refresh]);
	return { status, error, loading, refresh, setStatus };
}

export function describeOllamaModels(status: OllamaIntegrationStatus): string {
	const tools = status.models.filter((m) => m.toolcall).length;
	return `${status.models.length} model${status.models.length === 1 ? "" : "s"} pulled, ${tools} tool-capable`;
}

export function OllamaServerCard({
	settings,
	status,
	loading,
	onSaved,
}: {
	settings: ViewerSettings | null;
	status: OllamaIntegrationStatus | null;
	loading: boolean;
	/** Called with the saved settings; the caller refreshes status. */
	onSaved: (settings: ViewerSettings) => void;
}) {
	const { theme } = useTheme();
	const stored = settings?.ollamaBaseUrl ?? "";
	const [draft, setDraft] = useState(stored);
	const [saving, setSaving] = useState(false);
	useEffect(() => setDraft(stored), [stored]);
	const dirty = draft.trim() !== stored;

	const save = useCallback(async () => {
		const trimmed = draft.trim();
		setSaving(true);
		try {
			const res = await electrobun.rpc!.request.setSettings({
				settings: { ollamaBaseUrl: trimmed.length > 0 ? trimmed : null },
			});
			if (res.ok) onSaved(res.settings);
		} finally {
			setSaving(false);
		}
	}, [draft, onSaved]);

	return (
		<Card>
			<CardTitle htmlFor="ollama-base-url">Ollama server</CardTitle>
			<div style={{ display: "flex", gap: 8 }}>
				<input
					id="ollama-base-url"
					type="url"
					spellCheck={false}
					placeholder={DEFAULT_OLLAMA_URL}
					value={draft}
					disabled={!settings || saving}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && dirty) void save();
					}}
					style={fieldStyle(theme, { flex: 1 })}
				/>
				<ActionButton onClick={() => void save()} disabled={!dirty || saving} primary={dirty}>
					{saving ? "Saving…" : "Save"}
				</ActionButton>
			</div>
			{loading && !status ? (
				<StatusLine tone="idle">Checking {stored || DEFAULT_OLLAMA_URL}…</StatusLine>
			) : status?.reachable ? (
				<StatusLine tone="ok">
					Connected to <code>{status.baseUrl}</code> · {describeOllamaModels(status)}
				</StatusLine>
			) : (
				<StatusLine tone="error">
					{status?.error ?? "Ollama is not reachable."} Start it with <code>ollama serve</code>, or point this at another host.
				</StatusLine>
			)}
			<Hint>
				Leave empty for <code>{DEFAULT_OLLAMA_URL}</code>. The same server backs the local judge and the OpenCode <code>ollama</code> provider.
			</Hint>
		</Card>
	);
}

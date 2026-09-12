/**
 * OpenCode V2 debug tab — detect / install / update the `opencode2` CLI, plus
 * a probe that starts a short session and streams `/api/event` into this view.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Loader2 } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import type {
	OpencodeV2ProbeState,
	OpencodeV2Status,
	StudioMessages,
} from "../../shared/contract";
import {
	electrobun,
	opencodeV2ChangeSubscribers,
	opencodeV2ProbeChangeSubscribers,
} from "../rpc";
import { CenteredMessage } from "../ui";

type ServerSnapshot = {
	running: boolean;
	/** Sessions active or updated in the last 10 minutes (host window). */
	recentCount: number;
	error?: string;
};

export function OpencodeV2DebugView() {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [status, setStatus] = useState<OpencodeV2Status | null>(null);
	const [server, setServer] = useState<ServerSnapshot | null>(null);
	const [probe, setProbe] = useState<OpencodeV2ProbeState | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const eventLogRef = useRef<HTMLDivElement | null>(null);

	const refreshServer = useCallback(async () => {
		try {
			const [probeStatus, sessions] = await Promise.all([
				electrobun.rpc!.request.getOpencodeServerStatus({}),
				electrobun.rpc!.request.getServerSessions({}),
			]);
			setServer({
				running: probeStatus.running === true || sessions.running === true,
				recentCount: sessions.ok ? sessions.sessions.length : 0,
				error: sessions.ok ? undefined : sessions.error,
			});
		} catch (err) {
			setServer({
				running: false,
				recentCount: 0,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}, []);

	const refresh = useCallback(
		async (detailed = true) => {
			try {
				const next = await electrobun.rpc!.request.getOpencodeV2Status({
					detailed,
				});
				setStatus(next);
				setError(null);
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			}
			try {
				const probeState = await electrobun.rpc!.request.getOpencodeV2ProbeState(
					{},
				);
				setProbe(probeState);
			} catch {
				/* ignore — older host without probe RPC */
			}
			await refreshServer();
		},
		[refreshServer],
	);

	useEffect(() => {
		void refresh(true);
	}, [refresh]);

	useEffect(() => {
		const onPush = (payload: StudioMessages["opencodeV2Changed"]) => {
			setStatus(payload.status);
			if (payload.error) {
				setError(payload.error);
				setMessage(null);
			} else if (payload.status.cliBusy) {
				setMessage(
					payload.status.cliBusy === "install"
						? "Installing OpenCode V2…"
						: "Updating OpenCode V2…",
				);
				setError(null);
			} else if (payload.status.installed) {
				setMessage(
					`opencode2 ready${payload.status.installedVersion ? ` (${payload.status.installedVersion})` : ""}`,
				);
				setError(null);
			}
		};
		opencodeV2ChangeSubscribers.add(onPush);
		return () => {
			opencodeV2ChangeSubscribers.delete(onPush);
		};
	}, []);

	useEffect(() => {
		const onProbe = (payload: StudioMessages["opencodeV2ProbeChanged"]) => {
			setProbe(payload.state);
			void refreshServer();
		};
		opencodeV2ProbeChangeSubscribers.add(onProbe);
		return () => {
			opencodeV2ProbeChangeSubscribers.delete(onProbe);
		};
	}, [refreshServer]);

	useEffect(() => {
		const el = eventLogRef.current;
		if (!el) return;
		el.scrollTop = el.scrollHeight;
	}, [probe?.events.length]);

	const onInstall = useCallback(async () => {
		setError(null);
		setMessage("Installing OpenCode V2…");
		try {
			const res = await electrobun.rpc!.request.installOpencodeV2({});
			if (res.status) setStatus(res.status);
			if (!res.ok) {
				setError(res.error ?? "Install failed");
				setMessage(null);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setMessage(null);
		}
	}, []);

	const onUpdate = useCallback(async () => {
		setError(null);
		setMessage("Updating OpenCode V2…");
		try {
			const res = await electrobun.rpc!.request.updateOpencodeV2({});
			if (res.status) setStatus(res.status);
			if (!res.ok) {
				setError(res.error ?? "Update failed");
				setMessage(null);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setMessage(null);
		}
	}, []);

	const onStartProbe = useCallback(async () => {
		setError(null);
		setMessage("Starting event probe…");
		try {
			const res = await electrobun.rpc!.request.startOpencodeV2Probe({});
			if (!res.ok) {
				setError(res.error ?? "Probe failed to start");
				setMessage(null);
			} else {
				setMessage(
					res.sessionId
						? `Probe session ${res.sessionId}`
						: "Probe started — waiting for events…",
				);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setMessage(null);
		}
	}, []);

	const onStopProbe = useCallback(async () => {
		try {
			await electrobun.rpc!.request.stopOpencodeV2Probe({});
			setMessage("Probe stopped");
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	}, []);

	if (!status && !error) {
		return <CenteredMessage>Checking OpenCode V2…</CenteredMessage>;
	}

	const busy = Boolean(status?.cliBusy);
	const installed = status?.installed === true;
	const probeBusy = probe?.status === "starting" || probe?.status === "running";

	const card: CSSProperties = {
		maxWidth: 720,
		margin: "48px auto",
		padding: "28px 32px",
		borderRadius: 12,
		border: `1px solid ${theme.colors.border ?? "rgba(255,255,255,0.12)"}`,
		background: theme.colors.surface ?? "rgba(255,255,255,0.04)",
		color: theme.colors.text,
		fontFamily: theme.typography?.fontFamily ?? "inherit",
	};

	const label: CSSProperties = {
		fontSize: 12,
		letterSpacing: "0.04em",
		textTransform: "uppercase",
		color: muted,
		marginBottom: 4,
	};

	const row: CSSProperties = { marginBottom: 16 };

	const btn: CSSProperties = {
		display: "inline-flex",
		alignItems: "center",
		gap: 8,
		padding: "8px 14px",
		borderRadius: 8,
		border: "none",
		cursor: busy || probeBusy ? "default" : "pointer",
		opacity: busy ? 0.7 : 1,
		fontWeight: 600,
		fontSize: 13,
	};

	const formatTime = (at: number) =>
		new Date(at).toLocaleTimeString(undefined, {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});

	return (
		<div style={{ height: "100%", overflow: "auto", padding: 24 }}>
			<div style={card}>
				<h1 style={{ fontSize: 22, margin: "0 0 8px", fontWeight: 650 }}>
					OpenCode V2
				</h1>
				<p style={{ margin: "0 0 24px", color: muted, fontSize: 14, lineHeight: 1.45 }}>
					Debug surface for the Maintain runtime: detect/install{" "}
					<code>opencode2</code>, then run a probe session and watch live SSE
					events.
				</p>

				{error ? (
					<p style={{ color: theme.colors.danger ?? "#e55", marginBottom: 16 }}>
						{error}
					</p>
				) : null}
				{message ? (
					<p style={{ color: muted, marginBottom: 16, fontSize: 13 }}>{message}</p>
				) : null}

				<div style={row}>
					<div style={label}>Status</div>
					<div style={{ fontSize: 16, fontWeight: 600 }}>
						{installed ? "Installed" : "Not installed"}
						{busy ? (
							<span style={{ marginLeft: 10, color: muted, fontWeight: 500 }}>
								({status?.cliBusy}…)
							</span>
						) : null}
					</div>
				</div>

				<div style={row}>
					<div style={label}>Binary</div>
					<div style={{ fontSize: 13, wordBreak: "break-all" }}>
						{status?.bin ?? "—"}
					</div>
				</div>

				<div style={row}>
					<div style={label}>Installed version</div>
					<div style={{ fontSize: 13 }}>{status?.installedVersion ?? "—"}</div>
				</div>

				<div style={row}>
					<div style={label}>Latest beta</div>
					<div style={{ fontSize: 13 }}>
						{status?.latestVersion ?? "…"}
						{status?.updateAvailable ? (
							<span style={{ marginLeft: 8, color: theme.colors.warning ?? "#c90" }}>
								update available
							</span>
						) : null}
					</div>
				</div>

				<div style={row}>
					<div style={label}>Install command</div>
					<code style={{ fontSize: 12 }}>{status?.installCommand}</code>
				</div>

				<div style={row}>
					<div style={label}>Background server</div>
					<div style={{ fontSize: 13 }}>
						{server == null
							? "…"
							: server.running
								? "Running"
								: "Not running"}
						{server?.error ? (
							<span style={{ marginLeft: 8, color: theme.colors.danger ?? "#e55" }}>
								{server.error}
							</span>
						) : null}
					</div>
				</div>

				<div style={row}>
					<div style={label}>Recent sessions</div>
					<div style={{ fontSize: 16, fontWeight: 600 }}>
						{server == null ? "…" : server.recentCount}
						<span style={{ marginLeft: 8, fontSize: 13, fontWeight: 500, color: muted }}>
							in the last 10 minutes
						</span>
					</div>
				</div>

				<div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
					{!installed ? (
						<button
							type="button"
							disabled={busy}
							onClick={() => void onInstall()}
							style={{
								...btn,
								background: theme.colors.primary ?? "#3d7a5a",
								color: theme.colors.onPrimary ?? "#fff",
							}}
						>
							{busy && status?.cliBusy === "install" ? (
								<Loader2 size={14} className="principal-studio-spin" />
							) : null}
							Install OpenCode V2
						</button>
					) : (
						<button
							type="button"
							disabled={busy || status?.updateAvailable !== true}
							onClick={() => void onUpdate()}
							style={{
								...btn,
								background:
									status?.updateAvailable === true
										? (theme.colors.primary ?? "#3d7a5a")
										: (theme.colors.surfaceElevated ?? "rgba(255,255,255,0.08)"),
								color:
									status?.updateAvailable === true
										? (theme.colors.onPrimary ?? "#fff")
										: muted,
							}}
						>
							{busy && status?.cliBusy === "update" ? (
								<Loader2 size={14} className="principal-studio-spin" />
							) : null}
							Update
						</button>
					)}
					<button
						type="button"
						disabled={busy}
						onClick={() => void refresh(true)}
						style={{
							...btn,
							background: theme.colors.surfaceElevated ?? "rgba(255,255,255,0.08)",
							color: theme.colors.text,
						}}
					>
						Refresh
					</button>
				</div>

				<hr
					style={{
						border: "none",
						borderTop: `1px solid ${theme.colors.border ?? "rgba(255,255,255,0.12)"}`,
						margin: "28px 0",
					}}
				/>

				<h2 style={{ fontSize: 16, margin: "0 0 8px", fontWeight: 650 }}>
					Event probe
				</h2>
				<p style={{ margin: "0 0 16px", color: muted, fontSize: 13, lineHeight: 1.45 }}>
					Starts (or reuses) the background service, opens{" "}
					<code>/api/event</code>, creates a short session, prompts it, and
					streams matching SSE events here.
				</p>

				<div style={row}>
					<div style={label}>Probe status</div>
					<div style={{ fontSize: 14, fontWeight: 600 }}>
						{probe?.status ?? "idle"}
						{probe?.sessionId ? (
							<span style={{ marginLeft: 10, fontWeight: 500, color: muted, fontSize: 12 }}>
								{probe.sessionId}
							</span>
						) : null}
					</div>
				</div>

				{probe?.error ? (
					<p style={{ color: theme.colors.danger ?? "#e55", marginBottom: 12, fontSize: 13 }}>
						{probe.error}
					</p>
				) : null}

				<div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
					<button
						type="button"
						disabled={!installed || probeBusy}
						onClick={() => void onStartProbe()}
						style={{
							...btn,
							opacity: !installed || probeBusy ? 0.7 : 1,
							background: theme.colors.primary ?? "#3d7a5a",
							color: theme.colors.onPrimary ?? "#fff",
						}}
					>
						{probeBusy ? (
							<Loader2 size={14} className="principal-studio-spin" />
						) : null}
						Run probe session
					</button>
					<button
						type="button"
						disabled={!probeBusy}
						onClick={() => void onStopProbe()}
						style={{
							...btn,
							opacity: probeBusy ? 1 : 0.5,
							background: theme.colors.surfaceElevated ?? "rgba(255,255,255,0.08)",
							color: theme.colors.text,
						}}
					>
						Stop
					</button>
				</div>

				<div style={label}>
					Events ({probe?.events.length ?? 0})
				</div>
				<div
					ref={eventLogRef}
					style={{
						height: 260,
						overflow: "auto",
						borderRadius: 8,
						border: `1px solid ${theme.colors.border ?? "rgba(255,255,255,0.12)"}`,
						background: "rgba(0,0,0,0.25)",
						padding: "10px 12px",
						fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
						fontSize: 11,
						lineHeight: 1.45,
					}}
				>
					{(probe?.events.length ?? 0) === 0 ? (
						<div style={{ color: muted }}>No events yet.</div>
					) : (
						probe!.events.map((ev, i) => (
							<div key={`${ev.at}-${ev.type}-${i}`} style={{ marginBottom: 6 }}>
								<span style={{ color: muted }}>{formatTime(ev.at)}</span>{" "}
								<span style={{ color: theme.colors.primary ?? "#8fd" }}>{ev.type}</span>
								{ev.summary && ev.summary !== ev.type ? (
									<span style={{ color: theme.colors.text }}> — {ev.summary}</span>
								) : null}
							</div>
						))
					)}
				</div>
			</div>
		</div>
	);
}

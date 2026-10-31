/**
 * RepoMonitorDiagnostics — status view for the repository monitoring daemon:
 * the shared process that owns per-repo file trees, git watchers and cache
 * slices for every Studio / desktop-app client. Shows whether the daemon is
 * reachable, what spawned it, its watcher backend and resource use, and one row
 * per registered repo with the freshness of each cache slice. Pure — the data
 * arrives as a {@link RepoMonitorDiagnostics} snapshot and every action is
 * forwarded via callbacks.
 */

import {
	Activity,
	AlertTriangle,
	Eye,
	EyeOff,
	Loader2,
	Play,
	RefreshCw,
	RotateCcw,
	Server,
} from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";

export type RepoMonitorWatcherImpl = "parcel" | "chokidar";
export type RepoMonitorCacheSlice = "fileTree" | "packages" | "gitStatus" | "gitRemote";
export type RepoMonitorOwner = "studio" | "desktop" | "external";

export interface RepoMonitorSliceState {
	/** Epoch ms of the last completed build; undefined when never built. */
	updatedAt?: number;
	/** Commit sha the slice was built at (fileTree / gitStatus). */
	sha?: string;
	/** Entry count where it makes sense: files for fileTree, packages for packages. */
	count?: number;
	building?: boolean;
	error?: string;
}

export interface RepoMonitorRepoDiagnostics {
	path: string;
	isWatching: boolean;
	watchingMode: "minimal" | "fallback" | "none";
	/** Clients holding a watch reference on this repo. */
	watchReferenceCount: number;
	/** git fsmonitor daemon detected, so the watcher runs in minimal mode. */
	fsMonitorEnabled: boolean;
	slices: Partial<Record<RepoMonitorCacheSlice, RepoMonitorSliceState>>;
}

export type RepoMonitorDiagnostics =
	| {
			state: "unreachable";
			socketPath: string;
			error?: string;
			lastSeenAt?: number;
	  }
	| { state: "starting"; socketPath: string; pid?: number }
	| {
			state: "running";
			socketPath: string;
			pid: number;
			version: string;
			protocolVersion: number;
			startedAt: number;
			owner: RepoMonitorOwner;
			/** Connected clients, including this one. */
			clients: number;
			watcherImpl: RepoMonitorWatcherImpl;
			/** Why the daemon fell back from Parcel to Chokidar, when it did. */
			watcherFallbackReason: string | null;
			memoryBytes: number;
			cpuMs: number;
			repos: RepoMonitorRepoDiagnostics[];
	  };

export const SLICE_META: Array<{ slice: RepoMonitorCacheSlice; label: string }> = [
	{ slice: "fileTree", label: "File tree" },
	{ slice: "packages", label: "Packages" },
	{ slice: "gitStatus", label: "Git status" },
	{ slice: "gitRemote", label: "Git remote" },
];

export function formatRelative(then: number | undefined, now: number): string {
	if (then === undefined) return "never";
	const s = Math.max(0, Math.round((now - then) / 1000));
	if (s < 5) return "just now";
	if (s < 60) return `${s}s ago`;
	const m = Math.round(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.round(m / 60);
	if (h < 48) return `${h}h ago`;
	return `${Math.round(h / 24)}d ago`;
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	const mb = bytes / (1024 * 1024);
	return mb < 1024 ? `${mb.toFixed(mb < 10 ? 1 : 0)} MB` : `${(mb / 1024).toFixed(2)} GB`;
}

function formatUptime(startedAt: number, now: number): string {
	const s = Math.max(0, Math.round((now - startedAt) / 1000));
	const d = Math.floor(s / 86400);
	const h = Math.floor((s % 86400) / 3600);
	const m = Math.floor((s % 3600) / 60);
	if (d > 0) return `${d}d ${h}h`;
	if (h > 0) return `${h}h ${m}m`;
	return `${m}m ${s % 60}s`;
}

const OWNER_LABEL: Record<RepoMonitorOwner, string> = {
	studio: "spawned by Studio",
	desktop: "spawned by the desktop app",
	external: "started externally",
};

function actionButtonStyle(
	theme: ReturnType<typeof useTheme>["theme"],
	color: string,
	disabled: boolean,
) {
	return {
		background: "transparent",
		border: `1px solid ${color}`,
		color,
		cursor: disabled ? "default" : "pointer",
		opacity: disabled ? 0.6 : 1,
		fontSize: theme.fontSizes[1],
		fontFamily: theme.fonts.body,
		display: "inline-flex",
		alignItems: "center",
		gap: 6,
		padding: "4px 10px",
		borderRadius: 6,
	} as const;
}

function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
	const { theme } = useTheme();
	return (
		<div title={title} style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 90 }}>
			<span
				style={{
					fontSize: theme.fontSizes[0],
					color: theme.colors.textMuted,
					textTransform: "uppercase",
					letterSpacing: 0.3,
				}}
			>
				{label}
			</span>
			<span style={{ fontSize: theme.fontSizes[2], color: theme.colors.text }}>{value}</span>
		</div>
	);
}

function SliceCell({
	state,
	now,
}: {
	state: RepoMonitorSliceState | undefined;
	now: number;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted;
	if (!state || (state.updatedAt === undefined && !state.building && !state.error)) {
		return <span style={{ color: muted }}>—</span>;
	}
	if (state.error) {
		return (
			<span
				title={state.error}
				style={{ color: theme.colors.error ?? "#e5534b", display: "inline-flex", gap: 4, alignItems: "center" }}
			>
				<AlertTriangle size={11} /> failed
			</span>
		);
	}
	const detail =
		state.count !== undefined ? ` · ${state.count.toLocaleString()}` : "";
	return (
		<span
			title={state.sha ? `built at ${state.sha.slice(0, 7)}` : undefined}
			style={{ display: "inline-flex", gap: 4, alignItems: "center", color: theme.colors.textSecondary }}
		>
			{state.building && <Loader2 size={11} className="principal-studio-spin" />}
			{state.building ? "rebuilding" : formatRelative(state.updatedAt, now)}
			{detail}
		</span>
	);
}

function RepoRow({
	repo,
	now,
	onRebuild,
}: {
	repo: RepoMonitorRepoDiagnostics;
	now: number;
	onRebuild?: (repoPath: string) => void;
}) {
	const { theme } = useTheme();
	const name = repo.path.split("/").filter(Boolean).pop() ?? repo.path;
	const watchTitle = repo.isWatching
		? `Watching (${repo.watchingMode}${repo.fsMonitorEnabled ? ", git fsmonitor" : ""}) — ${repo.watchReferenceCount} reference${repo.watchReferenceCount === 1 ? "" : "s"}`
		: "Not watching — trees refresh only on request";
	return (
		<tr style={{ borderTop: `1px solid ${theme.colors.border}` }}>
			<td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<span title={watchTitle} style={{ display: "inline-flex", color: repo.isWatching ? theme.colors.success : theme.colors.textMuted }}>
						{repo.isWatching ? <Eye size={13} /> : <EyeOff size={13} />}
					</span>
					<span title={repo.path} style={{ color: theme.colors.text }}>
						{name}
					</span>
					{repo.isWatching && repo.watchingMode === "fallback" && (
						<span style={{ fontSize: theme.fontSizes[0], color: theme.colors.textMuted }}>fallback</span>
					)}
				</div>
			</td>
			{SLICE_META.map(({ slice }) => (
				<td key={slice} style={{ padding: "8px 12px", fontSize: theme.fontSizes[1], whiteSpace: "nowrap" }}>
					<SliceCell state={repo.slices[slice]} now={now} />
				</td>
			))}
			<td style={{ padding: "8px 12px", textAlign: "right" }}>
				{onRebuild && (
					<button
						type="button"
						onClick={() => onRebuild(repo.path)}
						title="Drop every cached slice for this repo and rebuild."
						style={actionButtonStyle(theme, theme.colors.border ?? "#333", false)}
					>
						<RefreshCw size={11} /> Rebuild
					</button>
				)}
			</td>
		</tr>
	);
}

export function RepoMonitorDiagnostics({
	diagnostics,
	now = Date.now(),
	refreshing = false,
	onRefresh,
	onStart,
	onRestart,
	onRebuild,
}: {
	diagnostics: RepoMonitorDiagnostics;
	/** Reference time for relative labels; pass a fixed value for stable renders. */
	now?: number;
	refreshing?: boolean;
	onRefresh?: () => void;
	/** Spawn the daemon when none is reachable. */
	onStart?: () => void;
	onRestart?: () => void;
	onRebuild?: (repoPath: string) => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textSecondary;
	const border = theme.colors.border ?? "#333";

	const dot = (color: string) => (
		<span
			style={{
				width: 8,
				height: 8,
				borderRadius: 4,
				background: color,
				display: "inline-block",
				flexShrink: 0,
			}}
		/>
	);

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 16,
				padding: 16,
				fontFamily: theme.fonts.body,
				color: theme.colors.text,
			}}
		>
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
				<span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: theme.fontSizes[3], fontWeight: 600 }}>
					<Server size={16} style={{ color: theme.colors.primary }} />
					Repository monitor
					{diagnostics.state === "running" && (
						<span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: theme.fontSizes[1], fontWeight: 400, color: muted }}>
							{dot(theme.colors.success ?? "#2da44e")} running · {OWNER_LABEL[diagnostics.owner]}
						</span>
					)}
					{diagnostics.state === "starting" && (
						<span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: theme.fontSizes[1], fontWeight: 400, color: muted }}>
							<Loader2 size={12} className="principal-studio-spin" /> starting
						</span>
					)}
					{diagnostics.state === "unreachable" && (
						<span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: theme.fontSizes[1], fontWeight: 400, color: muted }}>
							{dot(theme.colors.error ?? "#e5534b")} not running
						</span>
					)}
				</span>
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					{onRefresh && (
						<button
							type="button"
							disabled={refreshing}
							onClick={onRefresh}
							title="Re-query the daemon."
							style={actionButtonStyle(theme, border, refreshing)}
						>
							{refreshing ? <Loader2 size={12} className="principal-studio-spin" /> : <RefreshCw size={12} />}
							Refresh
						</button>
					)}
					{diagnostics.state === "unreachable" && onStart && (
						<button
							type="button"
							onClick={onStart}
							title="Spawn the monitoring daemon from this Studio."
							style={actionButtonStyle(theme, theme.colors.primary, false)}
						>
							<Play size={12} /> Start
						</button>
					)}
					{diagnostics.state === "running" && onRestart && (
						<button
							type="button"
							onClick={onRestart}
							title="Stop the daemon and spawn a fresh one. Other clients reconnect automatically."
							style={actionButtonStyle(theme, theme.colors.warning ?? "#d29922", false)}
						>
							<RotateCcw size={12} /> Restart
						</button>
					)}
				</div>
			</div>

			<div style={{ fontSize: theme.fontSizes[1], color: muted, display: "flex", gap: 6, alignItems: "center" }}>
				<Activity size={12} />
				<code style={{ fontFamily: theme.fonts.monospace ?? "monospace" }}>{diagnostics.socketPath}</code>
			</div>

			{diagnostics.state === "unreachable" && (
				<div
					style={{
						border: `1px solid ${border}`,
						borderRadius: 8,
						padding: 12,
						display: "flex",
						flexDirection: "column",
						gap: 6,
						fontSize: theme.fontSizes[1],
						color: muted,
					}}
				>
					<span>
						No daemon answered on the socket. File trees fall back to Studio's own
						walker: no .gitignore filtering, no git identity, no change watching.
					</span>
					{diagnostics.error && (
						<span style={{ color: theme.colors.error ?? "#e5534b" }}>{diagnostics.error}</span>
					)}
					{diagnostics.lastSeenAt !== undefined && (
						<span>Last seen {formatRelative(diagnostics.lastSeenAt, now)}.</span>
					)}
				</div>
			)}

			{diagnostics.state === "running" && (
				<>
					<div style={{ display: "flex", flexWrap: "wrap", gap: 24, padding: "4px 0" }}>
						<Stat label="PID" value={String(diagnostics.pid)} />
						<Stat label="Version" value={`${diagnostics.version} · proto ${diagnostics.protocolVersion}`} />
						<Stat label="Uptime" value={formatUptime(diagnostics.startedAt, now)} />
						<Stat label="Clients" value={String(diagnostics.clients)} title="Connected Studio and desktop-app processes. The daemon exits after an idle period with zero clients." />
						<Stat label="Memory" value={formatBytes(diagnostics.memoryBytes)} title="Resident set size" />
						<Stat label="CPU" value={`${(diagnostics.cpuMs / 1000).toFixed(1)}s`} title="Cumulative user + system CPU time" />
						<Stat label="Watcher" value={diagnostics.watcherImpl} />
					</div>

					{diagnostics.watcherFallbackReason && (
						<div
							style={{
								display: "flex",
								gap: 8,
								alignItems: "flex-start",
								border: `1px solid ${theme.colors.warning ?? "#d29922"}`,
								borderRadius: 8,
								padding: 10,
								fontSize: theme.fontSizes[1],
								color: theme.colors.text,
							}}
						>
							<AlertTriangle size={14} style={{ color: theme.colors.warning ?? "#d29922", flexShrink: 0, marginTop: 1 }} />
							<span>
								Fell back from Parcel to Chokidar: {diagnostics.watcherFallbackReason}
							</span>
						</div>
					)}

					<div style={{ border: `1px solid ${border}`, borderRadius: 8, overflow: "hidden" }}>
						<table style={{ width: "100%", borderCollapse: "collapse", fontSize: theme.fontSizes[1] }}>
							<thead>
								<tr style={{ color: theme.colors.textMuted, textTransform: "uppercase", letterSpacing: 0.3, fontSize: theme.fontSizes[0] }}>
									<th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 500 }}>
										Repos ({diagnostics.repos.length})
									</th>
									{SLICE_META.map(({ slice, label }) => (
										<th key={slice} style={{ textAlign: "left", padding: "10px 12px", fontWeight: 500 }}>
											{label}
										</th>
									))}
									<th />
								</tr>
							</thead>
							<tbody>
								{diagnostics.repos.length === 0 && (
									<tr style={{ borderTop: `1px solid ${border}` }}>
										<td colSpan={SLICE_META.length + 2} style={{ padding: 16, color: muted, textAlign: "center" }}>
											No repositories registered. Opening a repo in Studio registers it.
										</td>
									</tr>
								)}
								{diagnostics.repos.map((repo) => (
									<RepoRow key={repo.path} repo={repo} now={now} onRebuild={onRebuild} />
								))}
							</tbody>
						</table>
					</div>
				</>
			)}
		</div>
	);
}

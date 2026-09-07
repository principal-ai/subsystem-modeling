/**
 * GraphifyReposView — permanent "Graphify" tab. Lists Alexandria-registered
 * repos and whether a graphify graph exists for the current HEAD(+dirty).
 *
 * Long ensures return `building` immediately; completion arrives via
 * `graphifyChanged` so the Electrobun RPC window is never blocked.
 */

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "@principal-ade/industry-theme";
import type {
	GraphifyCliStatus,
	GraphifyRepoEntry,
	StudioMessages,
} from "../../shared/contract";
import { electrobun, graphifyChangeSubscribers } from "../rpc";
import { CenteredMessage, relativeTime } from "../ui";
import { GraphifyCliModal } from "../components/GraphifyCliModal";

export function GraphifyReposView() {
	const { theme } = useTheme();
	const [status, setStatus] = useState<GraphifyCliStatus | null>(null);
	const [repos, setRepos] = useState<GraphifyRepoEntry[] | null>(null);
	const [busyPurl, setBusyPurl] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [cliModalOpen, setCliModalOpen] = useState(false);

	const refresh = useCallback(async () => {
		try {
			const result = await electrobun.rpc!.request.listGraphifyRepos({});
			setStatus(result.graphify);
			setRepos(result.repos);
			setError(null);
			const building = result.repos.find((r) => r.status === "building");
			setBusyPurl(building?.purl ?? null);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	useEffect(() => {
		const onPush = (payload: StudioMessages["graphifyChanged"]) => {
			if (payload.kind === "cli" && payload.status) {
				setStatus(payload.status);
			}
			if (payload.kind === "ensure") {
				const label = payload.purl ?? "repo";
				if (payload.ensure?.ok) {
					setMessage(
						`${label}: ${payload.ensure.status ?? "done"}` +
							(payload.ensure.nodeCount != null
								? ` — ${payload.ensure.nodeCount} nodes / ${payload.ensure.edgeCount} edges`
								: ""),
					);
					setError(null);
				} else if (payload.ensure?.error) {
					setError(
						payload.ensure.code === "graphify_not_installed"
							? `${payload.ensure.error} — open Graphify CLI status to install`
							: payload.ensure.error,
					);
				}
				setBusyPurl(null);
				void refresh();
				return;
			}
			if (payload.kind === "repos" || payload.kind === "cli") {
				void refresh();
			}
		};
		graphifyChangeSubscribers.add(onPush);
		return () => {
			graphifyChangeSubscribers.delete(onPush);
		};
	}, [refresh]);

	const onRun = useCallback(
		async (repo: GraphifyRepoEntry, force = false) => {
			if (!repo.purl) return;
			setBusyPurl(repo.purl);
			setMessage(null);
			setError(null);
			try {
				const result = await electrobun.rpc!.request.ensureGraphifyGraph({
					purl: repo.purl,
					repoRoot: repo.path,
					force,
				});
				if (!result.ok) {
					setError(
						result.code === "graphify_not_installed"
							? `${result.error} — open Graphify CLI status to install`
							: (result.error ?? "ensure failed"),
					);
					setBusyPurl(null);
					return;
				}
				if (result.status === "building") {
					setMessage(`${repo.owner}/${repo.name}: running graphify…`);
					setRepos((prev) =>
						prev
							? prev.map((r) =>
									r.purl === repo.purl ? { ...r, status: "building" } : r,
								)
							: prev,
					);
					// Completion via graphifyChanged
					return;
				}
				setMessage(
					`${repo.owner}/${repo.name}: ${result.status} — ${result.nodeCount} nodes / ${result.edgeCount} edges`,
				);
				setBusyPurl(null);
				await refresh();
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
				setBusyPurl(null);
			}
		},
		[refresh],
	);

	if (error && repos === null) {
		return <CenteredMessage title="Could not load Graphify repos" detail={error} />;
	}
	if (repos === null) {
		return <CenteredMessage title="Loading Alexandria repos…" />;
	}

	const buttonStyle = (enabled: boolean): CSSProperties => ({
		padding: "5px 10px",
		borderRadius: 4,
		border: `1px solid ${theme.colors.border ?? "#333"}`,
		background: enabled ? theme.colors.primary : "transparent",
		color: enabled
			? theme.colors.background
			: (theme.colors.textMuted ?? theme.colors.textSecondary),
		cursor: enabled ? "pointer" : "default",
		fontSize: theme.fontSizes[1],
		fontFamily: theme.fonts.body,
		opacity: busyPurl ? 0.7 : 1,
		flexShrink: 0,
	});

	const installed = status?.installed === true;
	const chipLabel = installed
		? status?.installedVersion
			? `Graphify ${status.installedVersion}`
			: "Graphify installed"
		: "Graphify not installed";

	return (
		<div
			style={{
				flex: 1,
				minHeight: 0,
				overflowY: "auto",
				padding: "16px 24px",
				background: theme.colors.background,
				color: theme.colors.text,
				fontFamily: theme.fonts.body,
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "flex-start",
					justifyContent: "space-between",
					gap: 16,
					marginBottom: 16,
				}}
			>
				<div>
					<div style={{ fontSize: theme.fontSizes[3], fontWeight: 600 }}>Graphify</div>
					<div
						style={{
							fontSize: theme.fontSizes[1],
							color: theme.colors.textMuted ?? theme.colors.textSecondary,
						}}
					>
						Up to date means the cached graph matches this checkout’s current HEAD
						(and dirty working tree, if any).
					</div>
				</div>
				<button
					type="button"
					onClick={() => setCliModalOpen(true)}
					title="Graphify CLI status"
					style={{
						flexShrink: 0,
						padding: "5px 10px",
						borderRadius: 999,
						border: `1px solid ${installed ? theme.colors.border ?? "#444" : "#e5534b88"}`,
						background: installed
							? (theme.colors.backgroundSecondary ?? "transparent")
							: "#e5534b18",
						color: installed ? theme.colors.textSecondary : "#e5534b",
						cursor: "pointer",
						fontSize: theme.fontSizes[0],
						fontFamily: theme.fonts.body,
						fontWeight: 600,
						letterSpacing: 0.2,
					}}
				>
					{chipLabel}
				</button>
			</div>

			{message && (
				<div
					style={{
						fontSize: theme.fontSizes[1],
						color: theme.colors.textSecondary,
						marginBottom: 10,
					}}
				>
					{message}
				</div>
			)}
			{error && (
				<div style={{ fontSize: theme.fontSizes[1], color: "#e5534b", marginBottom: 10 }}>
					{error}
				</div>
			)}

			{repos.length === 0 ? (
				<div style={{ fontSize: theme.fontSizes[1], color: theme.colors.textMuted }}>
					No GitHub repos in Alexandria yet. Open a project in Principal to register one.
				</div>
			) : (
				<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
					{repos.map((repo) => {
						const running = busyPurl === repo.purl || repo.status === "building";
						const canRun = busyPurl === null && repo.status !== "building";
						const badge =
							repo.status === "ready"
								? "Up to date"
								: repo.status === "building"
									? "Running"
									: repo.cached
										? "Out of date"
										: "Not run";
						const badgeColor =
							repo.status === "ready"
								? "#3d9a5f"
								: repo.status === "building"
									? theme.colors.textSecondary
									: repo.cached
										? "#e5534b"
										: (theme.colors.textMuted ?? "#888");
						const badgeTitle =
							repo.status === "ready"
								? "Cached graph matches current HEAD" +
									(repo.dirtyHash ? " and dirty working tree" : "")
								: repo.status === "building"
									? "Graphify extract in progress"
									: repo.cached
										? "A graph exists, but it was built for a different commit or dirty state — re-run to refresh"
										: "No graphify graph cached for this repo yet";

						const metaParts: string[] = [];
						if (repo.status === "ready") {
							metaParts.push("matches current checkout");
						} else if (repo.cached && repo.status !== "building") {
							metaParts.push("built for a different checkout");
						}
						if (repo.cached) {
							metaParts.push(`${repo.cached.nodeCount} nodes`);
							metaParts.push(relativeTime(new Date(repo.cached.builtAt).getTime()));
						}
						if (repo.dirtyHash) metaParts.push("dirty");

						return (
							<div
								key={repo.purl}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 12,
									padding: "10px 12px",
									borderRadius: 4,
									border: `1px solid ${theme.colors.border ?? "#333"}`,
									background: theme.colors.backgroundSecondary ?? "transparent",
								}}
							>
								<span
									title={badgeTitle}
									style={{
										flexShrink: 0,
										minWidth: 72,
										textAlign: "center",
										fontSize: theme.fontSizes[0],
										fontWeight: 600,
										letterSpacing: 0.3,
										textTransform: "uppercase",
										padding: "2px 7px",
										borderRadius: 999,
										background: `${badgeColor}22`,
										color: badgeColor,
										border: `1px solid ${badgeColor}55`,
									}}
								>
									{badge}
								</span>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div
										style={{
											fontWeight: 500,
											whiteSpace: "nowrap",
											overflow: "hidden",
											textOverflow: "ellipsis",
										}}
									>
										{repo.owner}/{repo.name}
									</div>
									<div
										style={{
											fontSize: theme.fontSizes[0],
											color: theme.colors.textMuted ?? theme.colors.textSecondary,
											fontFamily: theme.fonts.monospace,
											whiteSpace: "nowrap",
											overflow: "hidden",
											textOverflow: "ellipsis",
										}}
										title={repo.purl}
									>
										{metaParts.length > 0
											? metaParts.join(" · ")
											: repo.purl}
									</div>
								</div>
								{repo.status === "ready" ? (
									<button
										type="button"
										style={buttonStyle(canRun)}
										disabled={!canRun || running}
										onClick={() => void onRun(repo, true)}
										title="Force rebuild"
									>
										{running ? "Running…" : "Re-run"}
									</button>
								) : repo.status === "building" ? (
									<button type="button" style={buttonStyle(false)} disabled>
										Running…
									</button>
								) : (
									<button
										type="button"
										style={buttonStyle(canRun)}
										disabled={!canRun || running}
										onClick={() => void onRun(repo)}
									>
										{running ? "Running…" : "Run graphify"}
									</button>
								)}
							</div>
						);
					})}
				</div>
			)}

			{cliModalOpen &&
				createPortal(
					<GraphifyCliModal
						initial={status}
						onClose={() => setCliModalOpen(false)}
						onChanged={(s) => {
							setStatus(s);
							void refresh();
						}}
					/>,
					document.body,
				)}
		</div>
	);
}

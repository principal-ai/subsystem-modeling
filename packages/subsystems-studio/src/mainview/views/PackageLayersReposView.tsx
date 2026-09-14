/**
 * PackageLayersReposView — permanent "Package Layers" tab. Lists
 * Alexandria-registered repos and whether codebase-composition package layers
 * exist for the current HEAD(+dirty).
 *
 * Long ensures return `building` immediately; completion arrives via
 * `packageLayersChanged` so the Electrobun RPC window is never blocked.
 */

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import type {
	PackageLayerRepoEntry,
	StudioMessages,
} from "../../shared/contract";
import { electrobun, packageLayersChangeSubscribers } from "../rpc";
import { CenteredMessage, relativeTime } from "../ui";

export function PackageLayersReposView() {
	const { theme } = useTheme();
	const [repos, setRepos] = useState<PackageLayerRepoEntry[] | null>(null);
	const [busyPurl, setBusyPurl] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		try {
			const result = await electrobun.rpc!.request.listPackageLayerRepos({});
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
		const onPush = (payload: StudioMessages["packageLayersChanged"]) => {
			if (payload.kind === "ensure") {
				const label = payload.purl ?? "repo";
				if (payload.ensure?.ok) {
					setMessage(
						`${label}: ${payload.ensure.status ?? "done"}` +
							(payload.ensure.packageCount != null
								? ` — ${payload.ensure.packageCount} packages` +
									(payload.ensure.isMonorepo ? " (monorepo)" : "")
								: ""),
					);
					setError(null);
				} else if (payload.ensure?.error) {
					setError(payload.ensure.error);
				}
				setBusyPurl(null);
				void refresh();
				return;
			}
			if (payload.kind === "repos") {
				void refresh();
			}
		};
		packageLayersChangeSubscribers.add(onPush);
		return () => {
			packageLayersChangeSubscribers.delete(onPush);
		};
	}, [refresh]);

	const onRun = useCallback(
		async (repo: PackageLayerRepoEntry, force = false) => {
			if (!repo.purl) return;
			setBusyPurl(repo.purl);
			setMessage(null);
			setError(null);
			try {
				const result = await electrobun.rpc!.request.ensurePackageLayers({
					purl: repo.purl,
					repoRoot: repo.path,
					force,
				});
				if (!result.ok) {
					setError(result.error ?? "ensure failed");
					setBusyPurl(null);
					return;
				}
				if (result.status === "building") {
					setMessage(`${repo.owner}/${repo.name}: discovering packages…`);
					setRepos((prev) =>
						prev
							? prev.map((r) =>
									r.purl === repo.purl ? { ...r, status: "building" } : r,
								)
							: prev,
					);
					return;
				}
				setMessage(
					`${repo.owner}/${repo.name}: ${result.status} — ${result.packageCount} packages` +
						(result.isMonorepo ? " (monorepo)" : ""),
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
		return (
			<CenteredMessage title="Could not load Package Layers repos" detail={error} />
		);
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
			<div style={{ marginBottom: 16 }}>
				<div style={{ fontSize: theme.fontSizes[3], fontWeight: 600 }}>
					Package Layers
				</div>
				<div
					style={{
						fontSize: theme.fontSizes[1],
						color: theme.colors.textMuted ?? theme.colors.textSecondary,
					}}
				>
					Up to date means the cached package discovery matches this checkout’s
					current HEAD (and dirty working tree, if any).
				</div>
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
								? "Cached packages match current HEAD" +
									(repo.dirtyHash ? " and dirty working tree" : "")
								: repo.status === "building"
									? "Package discovery in progress"
									: repo.cached
										? "A packages cache exists, but it was built for a different commit or dirty state — re-run to refresh"
										: "No package layers cached for this repo yet";

						const metaParts: string[] = [];
						if (repo.status === "ready") {
							metaParts.push("matches current checkout");
						} else if (repo.cached && repo.status !== "building") {
							metaParts.push("built for a different checkout");
						}
						if (repo.cached) {
							metaParts.push(
								`${repo.cached.packageCount} package` +
									(repo.cached.packageCount === 1 ? "" : "s"),
							);
							if (repo.cached.isMonorepo) metaParts.push("monorepo");
							if (repo.cached.rootPackageName) {
								metaParts.push(repo.cached.rootPackageName);
							}
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
										{metaParts.length > 0 ? metaParts.join(" · ") : repo.purl}
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
										{running ? "Running…" : "Discover packages"}
									</button>
								)}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

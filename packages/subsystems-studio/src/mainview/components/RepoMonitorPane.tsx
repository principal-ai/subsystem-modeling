/**
 * Settings → Repository monitor. Polls the host for daemon diagnostics while
 * mounted, listens for pushed changes, and forwards the panel's actions to the
 * host RPCs. The rendering lives in {@link RepoMonitorDiagnostics}.
 */

import { useCallback, useEffect, useState } from "react";
import type { RepoMonitorDiagnostics as RepoMonitorDiagnosticsSnapshot } from "../../shared/contract";
import { electrobun, repoMonitorChangeSubscribers } from "../rpc";
import { RepoMonitorChecking, RepoMonitorDiagnostics } from "./RepoMonitorDiagnostics";

const POLL_MS = 5_000;

export function RepoMonitorPane() {
	const [diagnostics, setDiagnostics] = useState<RepoMonitorDiagnosticsSnapshot | null>(null);
	const [statusError, setStatusError] = useState<string | null>(null);
	const [refreshing, setRefreshing] = useState(false);
	const [now, setNow] = useState(() => Date.now());

	const refresh = useCallback(async () => {
		setRefreshing(true);
		try {
			const status = await electrobun.rpc!.request.getRepoMonitorStatus({});
			setDiagnostics(status);
			setStatusError(null);
			setNow(Date.now());
		} catch (err) {
			console.error("[RepoMonitorPane] getRepoMonitorStatus failed:", err);
			setStatusError(err instanceof Error ? err.message : String(err));
		} finally {
			setRefreshing(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
		const timer = setInterval(() => void refresh(), POLL_MS);
		const onChange = (status: RepoMonitorDiagnosticsSnapshot) => {
			setDiagnostics(status);
			setNow(Date.now());
		};
		repoMonitorChangeSubscribers.add(onChange);
		return () => {
			clearInterval(timer);
			repoMonitorChangeSubscribers.delete(onChange);
		};
	}, [refresh]);

	const run = useCallback(
		async (action: () => Promise<unknown>) => {
			setRefreshing(true);
			try {
				await action();
			} catch (err) {
				console.error("[RepoMonitorPane] action failed:", err);
			}
			await refresh();
		},
		[refresh],
	);

	if (!diagnostics) {
		if (statusError) {
			return (
				<RepoMonitorDiagnostics
					diagnostics={{ state: "unreachable", socketPath: "unknown", error: `Status request failed: ${statusError}` }}
					now={now}
					refreshing={refreshing}
					onRefresh={() => void refresh()}
					onStart={() => void run(() => electrobun.rpc!.request.startRepoMonitor({}))}
				/>
			);
		}
		return <RepoMonitorChecking />;
	}
	return (
		<RepoMonitorDiagnostics
			diagnostics={diagnostics}
			now={now}
			refreshing={refreshing}
			onRefresh={() => void refresh()}
			onStart={() => void run(() => electrobun.rpc!.request.startRepoMonitor({}))}
			onRestart={() => void run(() => electrobun.rpc!.request.restartRepoMonitor({}))}
			onRebuild={(path) => void run(() => electrobun.rpc!.request.rebuildRepoMonitorRepo({ path }))}
		/>
	);
}

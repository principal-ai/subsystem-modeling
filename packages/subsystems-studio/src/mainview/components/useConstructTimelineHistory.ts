import { useCallback, useEffect, useState } from "react";
import type { ConstructTimelineCommit } from "../../shared/construct-timeline";
import { electrobun } from "../rpc";

export interface ConstructTimelineHistoryState {
	commits?: ConstructTimelineCommit[];
	error?: string;
	loading: boolean;
	retry: () => void;
}

/** Shared by the project stats and calendar, without duplicate Git history reads. */
export function useConstructTimelineHistory(purl: string | null, running: boolean): ConstructTimelineHistoryState {
	const [result, setResult] = useState<{ purl: string; commits?: ConstructTimelineCommit[]; error?: string }>();
	const [loadingFor, setLoadingFor] = useState<string>();
	const [attempt, setAttempt] = useState(0);
	const retry = useCallback(() => setAttempt((value) => value + 1), []);
	useEffect(() => {
		if (!purl) return;
		let cancelled = false;
		setLoadingFor(purl);
		setResult((previous) => previous?.purl === purl ? { ...previous, error: undefined } : undefined);
		void (async () => {
			try {
				const response = await electrobun.rpc!.request.getConstructTimelineHistory({ purl });
				if (cancelled) return;
				if (response.ok && response.commits) setResult({ purl, commits: response.commits });
				else throw new Error(response.error ?? "Could not read local Git history.");
			} catch {
				if (!cancelled) setResult((previous) => ({
					purl, commits: previous?.purl === purl ? previous.commits : undefined,
					error: "Could not read local Git history.",
				}));
			} finally {
				if (!cancelled) setLoadingFor(undefined);
			}
		})();
		return () => { cancelled = true; };
	}, [purl, running, attempt]);
	const current = result?.purl === purl ? result : undefined;
	return {
		commits: current?.commits, error: current?.error,
		loading: !!purl && (loadingFor === purl || !current), retry,
	};
}

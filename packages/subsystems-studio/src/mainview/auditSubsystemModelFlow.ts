/**
 * Shared ensure-graphify-then-audit flow used by the single-model Audit button.
 */

import type {
	StoredSubsystemModel,
	StudioMessages,
	SubsystemModelAuditReport,
} from "../shared/contract";
import type {
	AuditGraphifyPurlProgress,
	AuditModalState,
} from "./components/AuditResultsModal";
import { electrobun, graphifyChangeSubscribers } from "./rpc";

/** Max time to wait for a background graphify ensure before failing the audit step. */
const GRAPHIFY_ENSURE_TIMEOUT_MS = 10 * 60 * 1000;

function purlRepoKey(purl: string | undefined): string | undefined {
	if (!purl) return undefined;
	const base = purl.split("#")[0]?.trim();
	return base || undefined;
}

/** Unique package purls that can be graphify-ensured for this graph. */
export function graphifyTargets(
	graph: StoredSubsystemModel,
): Array<{ purl: string; repoRoot?: string }> {
	const byPurl = new Map<string, { purl: string; repoRoot?: string }>();
	for (const c of graph.components) {
		if (
			c.proposed ||
			c.construct === "external" ||
			c.construct === "custom_entity"
		)
			continue;
		const key = purlRepoKey(c.purl);
		if (!key || key === "external" || byPurl.has(key)) continue;
		const fromRoots = graph.repoRoots?.[key];
		const repoRoot =
			(fromRoots && fromRoots.length > 0 ? fromRoots : undefined) ??
			(graph.repoRoots ? undefined : graph.repoRoot);
		byPurl.set(key, { purl: key, repoRoot });
	}
	return [...byPurl.values()];
}

function waitForGraphifyEnsure(purl: string): {
	promise: Promise<{ ok: boolean; error?: string; detail?: string }>;
	cancel: () => void;
} {
	let onPush: ((payload: StudioMessages["graphifyChanged"]) => void) | null =
		null;
	let timer: ReturnType<typeof setTimeout> | null = null;
	const promise = new Promise<{
		ok: boolean;
		error?: string;
		detail?: string;
	}>((resolve) => {
		const finish = (result: {
			ok: boolean;
			error?: string;
			detail?: string;
		}) => {
			if (timer) {
				clearTimeout(timer);
				timer = null;
			}
			if (onPush) {
				graphifyChangeSubscribers.delete(onPush);
				onPush = null;
			}
			resolve(result);
		};

		onPush = (payload: StudioMessages["graphifyChanged"]) => {
			if (payload.kind !== "ensure" || payload.purl !== purl) return;
			if (payload.ensure?.ok) {
				const nodes = payload.ensure.nodeCount;
				const edges = payload.ensure.edgeCount;
				const detail =
					nodes != null
						? `built — ${nodes} nodes / ${edges ?? "?"} edges`
						: payload.ensure.status === "hit"
							? "cache hit"
							: "cache ready";
				finish({ ok: true, detail });
				return;
			}
			finish({
				ok: false,
				error:
					payload.ensure?.error ??
					payload.error ??
					(payload.ensure?.code === "graphify_not_installed"
						? "graphify CLI not found — open the Graphify tab to install"
						: "graphify ensure failed"),
			});
		};
		graphifyChangeSubscribers.add(onPush);

		timer = setTimeout(() => {
			finish({
				ok: false,
				error: `graphify ensure timed out after ${Math.round(GRAPHIFY_ENSURE_TIMEOUT_MS / 60000)}m for ${purl}`,
			});
		}, GRAPHIFY_ENSURE_TIMEOUT_MS);
	});
	return {
		promise,
		cancel: () => {
			if (timer) {
				clearTimeout(timer);
				timer = null;
			}
			if (onPush) {
				graphifyChangeSubscribers.delete(onPush);
				onPush = null;
			}
		},
	};
}

export type AuditFlowResult =
	| { ok: true; report: SubsystemModelAuditReport }
	| { ok: false; error: string; title?: string };

function patchPurl(
	purls: AuditGraphifyPurlProgress[],
	purl: string,
	patch: Partial<AuditGraphifyPurlProgress>,
): AuditGraphifyPurlProgress[] {
	return purls.map((p) => (p.purl === purl ? { ...p, ...patch } : p));
}

/**
 * Ensure graphify caches for the current HEAD(+dirty) tree, then dry-run audit.
 * Optionally mirrors progress into an AuditResultsModal-compatible state setter.
 */
export async function runSubsystemModelAuditFlow(
	graphId: string,
	opts?: {
		graph?: StoredSubsystemModel;
		onModal?: (state: AuditModalState) => void;
		/** Progress string for interactive callers (optional). */
		onProgress?: (message: string) => void;
		/** Fired when ensure starts/ends for a purl (list UI highlights repo cards). */
		onGraphifyPurl?: (purl: string | null) => void;
	},
): Promise<AuditFlowResult> {
	const onModal = opts?.onModal;
	const onProgress = opts?.onProgress;
	const onGraphifyPurl = opts?.onGraphifyPurl;
	let graph = opts?.graph;
	if (!graph) {
		const loaded = await electrobun.rpc!.request.getSubsystemModel({ graphId });
		if (!loaded.ok || !loaded.graph) {
			const error = loaded.error ?? `unknown graph: ${graphId}`;
			onModal?.({ phase: "error", error });
			return { ok: false, error };
		}
		graph = loaded.graph;
	}

	const title = graph.title;

	try {
		const targets = graphifyTargets(graph).filter((t) => t.repoRoot);
		const skipped = graphifyTargets(graph).filter((t) => !t.repoRoot);
		let purls: AuditGraphifyPurlProgress[] = [
			...targets.map((t) => ({
				purl: t.purl,
				status: "pending" as const,
			})),
			...skipped.map((t) => ({
				purl: t.purl,
				status: "ready" as const,
				detail: "skipped — no local repoRoot",
			})),
		];
		onModal?.({ phase: "graphify", title, purls });

		for (const t of targets) {
			purls = patchPurl(purls, t.purl, {
				status: "building",
				detail: "ensuring current HEAD+dirty cache…",
			});
			onModal?.({ phase: "graphify", title, purls });
			onGraphifyPurl?.(t.purl);
			onProgress?.(`${title}: graphify ${t.purl}…`);

			const waiter = waitForGraphifyEnsure(t.purl);
			let result: {
				ok: boolean;
				error?: string;
				code?: string;
				status?: "hit" | "built" | "building";
				nodeCount?: number;
				edgeCount?: number;
			};
			try {
				result = await electrobun.rpc!.request.ensureGraphifyGraph({
					purl: t.purl,
					repoRoot: t.repoRoot,
				});
			} catch (err) {
				waiter.cancel();
				onGraphifyPurl?.(null);
				const error =
					err instanceof Error
						? err.message
						: `Failed to ensure graphify for ${t.purl}`;
				purls = patchPurl(purls, t.purl, { status: "error", detail: error });
				onModal?.({ phase: "error", title, error });
				return { ok: false, error, title };
			}

			if (!result.ok) {
				waiter.cancel();
				onGraphifyPurl?.(null);
				const error =
					result.code === "graphify_not_installed"
						? `${result.error ?? "graphify CLI not found"} — open the Graphify tab to install`
						: (result.error ?? `ensure failed for ${t.purl}`);
				purls = patchPurl(purls, t.purl, { status: "error", detail: error });
				onModal?.({ phase: "error", title, error });
				return { ok: false, error, title };
			}

			if (result.status === "building") {
				purls = patchPurl(purls, t.purl, {
					status: "building",
					detail: "running graphify…",
				});
				onModal?.({ phase: "graphify", title, purls });
				onProgress?.(
					`${title}: waiting for graphify build (${t.purl})…`,
				);
				const done = await waiter.promise;
				if (!done.ok) {
					onGraphifyPurl?.(null);
					const error = done.error ?? `graphify failed for ${t.purl}`;
					purls = patchPurl(purls, t.purl, {
						status: "error",
						detail: done.error ?? "graphify failed",
					});
					onModal?.({ phase: "error", title, error });
					return { ok: false, error, title };
				}
				purls = patchPurl(purls, t.purl, {
					status: "ready",
					detail: done.detail ?? "cache ready",
				});
				onModal?.({ phase: "graphify", title, purls });
			} else {
				waiter.cancel();
				const detail =
					result.status === "hit"
						? "current cache hit"
						: result.nodeCount != null
							? `built — ${result.nodeCount} nodes / ${result.edgeCount ?? "?"} edges`
							: "cache ready";
				purls = patchPurl(purls, t.purl, { status: "ready", detail });
				onModal?.({ phase: "graphify", title, purls });
			}
		}

		onGraphifyPurl?.(null);
		onModal?.({ phase: "auditing", title });
		onProgress?.(`${title}: running audit…`);
		const res = await electrobun.rpc!.request.auditSubsystemModel({ graphId });
		if (!res.ok || !res.report) {
			const error = res.error ?? "Audit failed";
			onModal?.({ phase: "error", title, error });
			return { ok: false, error, title };
		}
		onModal?.({ phase: "done", report: res.report });
		return { ok: true, report: res.report };
	} catch (err) {
		onGraphifyPurl?.(null);
		const error = err instanceof Error ? err.message : String(err);
		onModal?.({ phase: "error", title, error });
		return { ok: false, error, title };
	}
}

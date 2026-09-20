/**
 * Maintainer liveness probe — a single tool call that either lands or not.
 *
 * The maintain brief opens with "Step 0 · Confirm you're live": the agent must
 * curl `POST /api/maintainer/probe` with a run token and expect `{ok:true}`.
 * The host just watches whether that token landed before a timeout — no SSE
 * event parsing, nothing fragile. A session that never makes the call is
 * treated as `unusable` (e.g. the opencode/Zen free tier dying headless), and
 * the runner falls back to a credentialed model.
 */

import { modelProviderOf } from "./opencode-models";

export interface MaintainerProbeRegistry {
	/** Record that a maintain run's liveness call landed. */
	mark(token: string): void;
	/** Epoch ms the token landed, or null if never seen. */
	seenAt(token: string): number | null;
}

export function createMaintainerProbeRegistry(): MaintainerProbeRegistry {
	const landed = new Map<string, number>();
	return {
		mark(token) {
			landed.set(token, Date.now());
		},
		seenAt(token) {
			return landed.get(token) ?? null;
		},
	};
}

const shared = createMaintainerProbeRegistry();

/** The registry wired to Studio HTTP, which maintain runs poll. */
export function getMaintainerProbeRegistry(): MaintainerProbeRegistry {
	return shared;
}

/** True when the probe has not landed by the timeout (startedAt → now). */
export function maintainerProbeTimedOut(opts: {
	startedAt: number;
	now: number;
	receivedAt: number | null;
	timeoutMs: number;
}): boolean {
	if (opts.receivedAt != null) return false;
	return opts.now - opts.startedAt >= opts.timeoutMs;
}

const MODEL_USABLE_TTL_MS = 5 * 60_000;
const modelUnusableUntil = new Map<string, number>();

/** Remember that a model ref just proved unusable, so we skip it while degrading. */
export function rememberModelUnusable(
	modelRef: string,
	ttlMs = MODEL_USABLE_TTL_MS,
): void {
	modelUnusableUntil.set(modelRef, Date.now() + ttlMs);
}

export function isModelUnusable(modelRef: string): boolean {
	const until = modelUnusableUntil.get(modelRef);
	if (until == null) return false;
	if (until < Date.now()) {
		modelUnusableUntil.delete(modelRef);
		return false;
	}
	return true;
}

/** How long to wait for the Step-0 probe tool call. Free tiers are quicker to
 *  declare dead; credentialed models may take longer to cold-start. */
export function firstActivityTimeoutMsFor(modelRef: string): number {
	const env = process.env["PRINCIPAL_STUDIO_FIRST_ACTIVITY_TIMEOUT_MS"];
	if (env && /^\d+$/.test(env)) return Number(env);
	return modelProviderOf(modelRef) === "opencode" ? 30_000 : 60_000;
}
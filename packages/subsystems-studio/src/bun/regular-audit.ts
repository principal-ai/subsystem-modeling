/**
 * Host-side regular audit loop — dry-runs `auditSubsystemModel` across all
 * stored subsystem models while Studio is open, driven by ViewerSettings.
 *
 * Uses a timeout chain (not setInterval) so `nextAuditAt` is accurate for the
 * countdown UI. First pass after a short boot delay; each subsequent pass is
 * scheduled from when the previous one finishes.
 */

import type { RegularAuditStatus, ViewerSettings } from "../shared/contract";

const DEFAULT_BOOT_DELAY_MS = 15_000;

export type RegularAuditDeps = {
	listGraphIds: () => Promise<string[]>;
	auditOne: (graphId: string) => Promise<void>;
	log?: (message: string) => void;
	/** Override boot delay before the first pass (default 15s). */
	bootDelayMs?: number;
	/** Fired whenever getStatus() would change. */
	onStatusChange?: (status: RegularAuditStatus) => void;
};

export type RegularAuditScheduler = {
	/** Start/stop/reschedule from current settings. Safe to call repeatedly. */
	sync: (settings: ViewerSettings) => void;
	stop: () => void;
	getStatus: () => RegularAuditStatus;
};

export function createRegularAuditScheduler(
	deps: RegularAuditDeps,
): RegularAuditScheduler {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	let passInFlight = false;
	let enabled = false;
	let intervalMinutes = 5;
	let nextAuditAtMs: number | null = null;
	const bootDelayMs = deps.bootDelayMs ?? DEFAULT_BOOT_DELAY_MS;

	const log = (msg: string) => {
		(deps.log ?? console.log)(`[principal-studio] regular-audit: ${msg}`);
	};

	const getStatus = (): RegularAuditStatus => ({
		enabled,
		intervalMinutes,
		running: passInFlight,
		nextAuditAt:
			enabled && !passInFlight && nextAuditAtMs != null
				? new Date(nextAuditAtMs).toISOString()
				: null,
	});

	const notify = () => {
		deps.onStatusChange?.(getStatus());
	};

	const clearTimer = () => {
		if (timeoutId != null) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}
		nextAuditAtMs = null;
	};

	const runPass = async () => {
		if (!enabled || passInFlight) return;
		passInFlight = true;
		nextAuditAtMs = null;
		notify();
		try {
			const ids = await deps.listGraphIds();
			if (ids.length === 0) {
				log("pass skipped — no subsystem models");
				return;
			}
			log(`pass start — ${ids.length} model${ids.length === 1 ? "" : "s"}`);
			for (const graphId of ids) {
				if (!enabled) break;
				try {
					await deps.auditOne(graphId);
				} catch (err) {
					log(
						`audit failed for ${graphId}: ${
							err instanceof Error ? err.message : String(err)
						}`,
					);
				}
			}
			log("pass complete");
		} catch (err) {
			log(
				`pass failed: ${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			passInFlight = false;
			if (enabled) {
				scheduleNext(intervalMinutes * 60_000);
			} else {
				clearTimer();
				notify();
			}
		}
	};

	const scheduleNext = (delayMs: number) => {
		if (timeoutId != null) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}
		const delay = Math.max(0, delayMs);
		nextAuditAtMs = Date.now() + delay;
		notify();
		timeoutId = setTimeout(() => {
			timeoutId = null;
			void runPass();
		}, delay);
	};

	const start = (settings: ViewerSettings) => {
		clearTimer();
		enabled = settings.regularAuditEnabled;
		intervalMinutes = settings.regularAuditIntervalMinutes;
		if (!enabled) {
			log("disabled");
			notify();
			return;
		}
		if (passInFlight) {
			log(
				`enabled — every ${intervalMinutes}m (waiting for in-flight pass)`,
			);
			notify();
			return;
		}
		log(
			`enabled — every ${intervalMinutes}m (first pass in ${Math.round(bootDelayMs / 1000)}s)`,
		);
		scheduleNext(bootDelayMs);
	};

	return {
		sync(settings) {
			const nextEnabled = settings.regularAuditEnabled;
			const nextMinutes = settings.regularAuditIntervalMinutes;
			if (
				timeoutId != null &&
				!passInFlight &&
				nextEnabled === enabled &&
				nextMinutes === intervalMinutes
			) {
				return;
			}
			// If a pass is in flight and only the interval changed, keep running;
			// the new interval applies when scheduling the following pass.
			if (passInFlight && nextEnabled && nextMinutes !== intervalMinutes) {
				intervalMinutes = nextMinutes;
				notify();
				return;
			}
			if (passInFlight && nextEnabled === enabled) {
				return;
			}
			start(settings);
		},
		stop() {
			enabled = false;
			clearTimer();
			notify();
		},
		getStatus,
	};
}

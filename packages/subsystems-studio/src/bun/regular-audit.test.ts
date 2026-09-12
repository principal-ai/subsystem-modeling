import { describe, expect, test } from "bun:test";
import {
	coerceRegularAuditIntervalMinutes,
	defaultViewerSettings,
} from "./viewer-settings";
import { createRegularAuditScheduler } from "./regular-audit";
import type { RegularAuditStatus } from "../shared/contract";

describe("viewer-settings regular audit", () => {
	test("defaults enable regular audit every 5 minutes", () => {
		const d = defaultViewerSettings();
		expect(d.regularAuditEnabled).toBe(true);
		expect(d.regularAuditIntervalMinutes).toBe(5);
	});

	test("clamps interval to minimum 5 minutes", () => {
		expect(coerceRegularAuditIntervalMinutes(1)).toBe(5);
		expect(coerceRegularAuditIntervalMinutes(90)).toBe(90);
		expect(coerceRegularAuditIntervalMinutes("bad")).toBe(5);
	});
});

describe("regular-audit scheduler", () => {
	test("exposes nextAuditAt for countdown while idle", async () => {
		const statuses: RegularAuditStatus[] = [];
		const scheduler = createRegularAuditScheduler({
			listGraphIds: async () => ["a"],
			auditOne: async () => {
				await Bun.sleep(20);
			},
			log: () => {},
			bootDelayMs: 30,
			onStatusChange: (s) => statuses.push({ ...s }),
		});

		scheduler.sync(defaultViewerSettings());
		const idle = scheduler.getStatus();
		expect(idle.enabled).toBe(true);
		expect(idle.running).toBe(false);
		expect(idle.nextAuditAt).toBeTruthy();

		await Bun.sleep(50);
		const running = scheduler.getStatus();
		expect(running.running).toBe(true);
		expect(running.nextAuditAt).toBeNull();

		await Bun.sleep(40);
		const after = scheduler.getStatus();
		expect(after.running).toBe(false);
		expect(after.nextAuditAt).toBeTruthy();
		scheduler.stop();
		expect(statuses.some((s) => s.running)).toBe(true);
	});

	test("disabled setting clears countdown", async () => {
		const scheduler = createRegularAuditScheduler({
			listGraphIds: async () => ["a"],
			auditOne: async () => {},
			log: () => {},
			bootDelayMs: 5,
		});
		scheduler.sync({
			...defaultViewerSettings(),
			regularAuditEnabled: false,
		});
		const status = scheduler.getStatus();
		expect(status.enabled).toBe(false);
		expect(status.nextAuditAt).toBeNull();
		await Bun.sleep(40);
		expect(scheduler.getStatus().nextAuditAt).toBeNull();
		scheduler.stop();
	});
});

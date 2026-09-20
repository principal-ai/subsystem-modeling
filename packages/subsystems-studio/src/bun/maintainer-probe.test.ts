import { test, expect, describe } from "bun:test";
import {
	createMaintainerProbeRegistry,
	firstActivityTimeoutMsFor,
	isModelUnusable,
	maintainerProbeTimedOut,
	rememberModelUnusable,
} from "./maintainer-probe";

describe("maintainer probe registry", () => {
	test("marks a token and reports it seen", () => {
		const registry = createMaintainerProbeRegistry();
		expect(registry.seenAt("run-1")).toBeNull();
		registry.mark("run-1");
		expect(registry.seenAt("run-1")).toBeGreaterThan(0);
		expect(registry.seenAt("run-2")).toBeNull();
	});
});

describe("maintainerProbeTimedOut", () => {
	const now = 1_000_000;

	test("timed out only when not received past the deadline", () => {
		expect(
			maintainerProbeTimedOut({
				startedAt: now,
				now: now + 10_000,
				receivedAt: null,
				timeoutMs: 30_000,
			}),
		).toBe(false);
		expect(
			maintainerProbeTimedOut({
				startedAt: now,
				now: now + 30_000,
				receivedAt: null,
				timeoutMs: 30_000,
			}),
		).toBe(true);
	});

	test("a landed probe never times out", () => {
		expect(
			maintainerProbeTimedOut({
				startedAt: now,
				now: now + 300_000,
				receivedAt: now + 5_000,
				timeoutMs: 30_000,
			}),
		).toBe(false);
	});
});

describe("tier unusable memory", () => {
	test("remembers while inside TTL", () => {
		rememberModelUnusable("opencode/big-pickle", 300_000);
		expect(isModelUnusable("opencode/big-pickle")).toBe(true);
	});

	test("forgets after expiry", async () => {
		rememberModelUnusable("opencode/big-pickle", 20);
		expect(isModelUnusable("opencode/big-pickle")).toBe(true);
		await Bun.sleep(60);
		expect(isModelUnusable("opencode/big-pickle")).toBe(false);
	});

	test("unseen models are usable", () => {
		expect(isModelUnusable("opencode-go/deepseek-v4-flash")).toBe(false);
	});
});

describe("firstActivityTimeoutMsFor", () => {
	test("free zen tiers get a shorter window", () => {
		expect(firstActivityTimeoutMsFor("opencode/big-pickle")).toBe(30_000);
	});

	test("credentialed models get a longer window", () => {
		expect(firstActivityTimeoutMsFor("opencode-go/deepseek-v4-flash")).toBe(
			60_000,
		);
	});

	test("env override wins", () => {
		process.env["PRINCIPAL_STUDIO_FIRST_ACTIVITY_TIMEOUT_MS"] = "8000";
		try {
			expect(firstActivityTimeoutMsFor("opencode-go/deepseek-v4-flash")).toBe(
				8000,
			);
		} finally {
			delete process.env["PRINCIPAL_STUDIO_FIRST_ACTIVITY_TIMEOUT_MS"];
		}
	});
});
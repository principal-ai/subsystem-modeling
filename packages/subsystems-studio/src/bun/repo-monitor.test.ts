import { describe, expect, test } from "bun:test";
import {
	daemonRequestWithTimeoutRetry,
	isRepoMonitorTimeout,
} from "./repo-monitor";

describe("isRepoMonitorTimeout", () => {
	test("matches daemon request timeouts", () => {
		expect(isRepoMonitorTimeout(new Error("Request timeout: register"))).toBe(true);
		expect(isRepoMonitorTimeout(new Error("Request timeout: getFileTree"))).toBe(true);
	});

	test("rejects other failures", () => {
		expect(isRepoMonitorTimeout(new Error("repository monitor unavailable"))).toBe(false);
		expect(isRepoMonitorTimeout(new Error("boom"))).toBe(false);
		expect(isRepoMonitorTimeout("Request timeout: register")).toBe(false);
		expect(isRepoMonitorTimeout(null)).toBe(false);
	});
});

describe("daemonRequestWithTimeoutRetry", () => {
	test("returns the first result without retrying", async () => {
		let calls = 0;
		const result = await daemonRequestWithTimeoutRetry("getFileTree", "/repo", async () => {
			calls++;
			return { files: 3 };
		});
		expect(result).toEqual({ files: 3 });
		expect(calls).toBe(1);
	});

	test("retries once after a timeout and returns the retry result", async () => {
		let calls = 0;
		const result = await daemonRequestWithTimeoutRetry("register", "/repo", async () => {
			calls++;
			if (calls === 1) throw new Error("Request timeout: register");
			return "ok";
		});
		expect(result).toBe("ok");
		expect(calls).toBe(2);
	});

	test("rethrows non-timeout failures without retrying", async () => {
		let calls = 0;
		const failure = new Error("repository monitor unavailable: not connected");
		await expect(
			daemonRequestWithTimeoutRetry("register", "/repo", async () => {
				calls++;
				throw failure;
			}),
		).rejects.toBe(failure);
		expect(calls).toBe(1);
	});

	test("wraps a second timeout with the repo and both budgets", async () => {
		let calls = 0;
		const error = await daemonRequestWithTimeoutRetry("getFileTree", "/repo", async () => {
			calls++;
			throw new Error("Request timeout: getFileTree");
		}).then(
			() => null,
			(err: Error) => err,
		);
		expect(calls).toBe(2);
		expect(error?.message).toContain("/repo");
		expect(error?.message).toContain("timed out twice");
	});
});

import { describe, expect, test } from "bun:test";
import { withStudioSpan } from "./telemetry";

describe("Studio spans", () => {
	test("returns the operation result", async () => {
		await expect(
			withStudioSpan("studio.test", {}, async () => "ok"),
		).resolves.toBe("ok");
	});

	test("rethrows failures so callers preserve existing error handling", async () => {
		await expect(
			withStudioSpan("studio.test", {}, () => {
				throw new Error("expected failure");
			}),
		).rejects.toThrow("expected failure");
	});
});

import { describe, expect, test } from "bun:test";
import { resolveSandboxed } from "./sandboxed-path";

const ROOT = "/repo/checkout";

describe("resolveSandboxed", () => {
	test("joins plain repo-relative paths under the root", () => {
		expect(resolveSandboxed(ROOT, "src/a.ts")).toBe("/repo/checkout/src/a.ts");
	});

	test("tolerates dot segments that stay inside the root", () => {
		expect(resolveSandboxed(ROOT, "src/./a.ts")).toBe("/repo/checkout/src/a.ts");
	});

	test("strips a leading slash into the root", () => {
		expect(resolveSandboxed(ROOT, "/src/a.ts")).toBe("/repo/checkout/src/a.ts");
	});

	test("strips the legacy GitHub/ prefix", () => {
		expect(resolveSandboxed(ROOT, "GitHub/src/a.ts")).toBe(
			"/repo/checkout/src/a.ts",
		);
	});

	test("rejects parent references that escape the root", () => {
		expect(() => resolveSandboxed(ROOT, "../etc/passwd")).toThrow(
			"must not contain ..",
		);
		expect(() => resolveSandboxed(ROOT, "a/../../etc/passwd")).toThrow(
			"must not contain ..",
		);
	});

	test("rejects parent references even when they resolve back inside", () => {
		expect(() => resolveSandboxed(ROOT, "src/../src/a.ts")).toThrow(
			"must not contain ..",
		);
		expect(() => resolveSandboxed(ROOT, "src/a.ts/..")).toThrow(
			"must not contain ..",
		);
		expect(() => resolveSandboxed(ROOT, "..")).toThrow("must not contain ..");
	});

	test("treats backslash as a filename character, not a separator", () => {
		// On posix `..\\` is a single segment, so this stays inside the root —
		// and names no real step/component file.
		expect(resolveSandboxed(ROOT, "..\\a.ts")).toBe("/repo/checkout/..\\a.ts");
	});
});

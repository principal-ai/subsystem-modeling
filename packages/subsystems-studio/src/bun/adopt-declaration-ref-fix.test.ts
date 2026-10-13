import { describe, expect, test } from "bun:test";
import { adoptGraphifyDeclarationRefFixFromVerify } from "./verify-subsystem-component";

const repin = { startLine: 42, endLine: 48, contentHash: "abc" };

describe("adoptGraphifyDeclarationRefFixFromVerify", () => {
	test("offers re-pin when exact + stale + content-preserving move", () => {
		const fix = adoptGraphifyDeclarationRefFixFromVerify(
			{ declarationSpan: { startLine: 10, endLine: 16, contentHash: "abc" } },
			{ freshness: "stale", repin },
			{ resolution: "exact", nodeId: "n1" },
		);
		expect(fix?.id).toBe("adopt_graphify_declaration_ref");
		expect(fix?.declarationSpan.startLine).toBe(42);
		expect(fix?.previousStartLine).toBe(10);
	});

	test("skips without exact anchor", () => {
		expect(
			adoptGraphifyDeclarationRefFixFromVerify(
				{ declarationSpan: { startLine: 1, endLine: 3, contentHash: "x" } },
				{ freshness: "stale", repin },
				{ resolution: "file-only" },
			),
		).toBeUndefined();
	});

	test("skips a content-changed span (not a move)", () => {
		expect(
			adoptGraphifyDeclarationRefFixFromVerify(
				{ declarationSpan: { startLine: 10, endLine: 16, contentHash: "abc" } },
				{
					freshness: "stale",
					repin: { startLine: 42, endLine: 48, contentHash: "different" },
				},
				{ resolution: "exact" },
			),
		).toBeUndefined();
	});

	test("skips when the span already sits at the new start", () => {
		expect(
			adoptGraphifyDeclarationRefFixFromVerify(
				{ declarationSpan: repin },
				{ freshness: "stale", repin },
				{ resolution: "exact" },
			),
		).toBeUndefined();
	});
});

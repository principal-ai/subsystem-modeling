import { describe, expect, test } from "bun:test";
import { adoptGraphifyDeclarationRefFixFromVerify } from "./verify-subsystem-component";

const repin = {
	file: "src/foo.ts",
	startLine: 42,
	lineHash: "abc",
	graphifyNodeId: "n1",
};

describe("adoptGraphifyDeclarationRefFixFromVerify", () => {
	test("offers re-pin when exact + stale + new ref", () => {
		const fix = adoptGraphifyDeclarationRefFixFromVerify(
			{
				declarationRef: {
					file: "src/foo.ts",
					startLine: 10,
					lineHash: "old",
				},
			},
			{ freshness: "stale", ref: repin },
			{ resolution: "exact", nodeId: "n1" },
		);
		expect(fix?.id).toBe("adopt_graphify_declaration_ref");
		expect(fix?.declarationRef.startLine).toBe(42);
		expect(fix?.previousStartLine).toBe(10);
	});

	test("skips without exact anchor", () => {
		expect(
			adoptGraphifyDeclarationRefFixFromVerify(
				{ declarationRef: { file: "a.ts", startLine: 1, lineHash: "x" } },
				{ freshness: "stale", ref: repin },
				{ resolution: "file-only" },
			),
		).toBeUndefined();
	});

	test("skips when pin already matches", () => {
		expect(
			adoptGraphifyDeclarationRefFixFromVerify(
				{ declarationRef: repin },
				{ freshness: "stale", ref: repin },
				{ resolution: "exact" },
			),
		).toBeUndefined();
	});
});

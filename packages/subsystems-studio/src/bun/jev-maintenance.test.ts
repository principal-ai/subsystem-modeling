import { describe, expect, test } from "bun:test";
import {
	buildProposalState,
	verdictFromAnswers,
} from "./jev-maintenance";

describe("verdictFromAnswers", () => {
	test("high noul maps to safe with noul confidence", () => {
		const v = verdictFromAnswers({
			safe_to_auto_accept: { noul: 0.92 },
			change_kind: { choice: "construct_augment", confidence: 0.7 },
			risk: { score: 0.1, confidence: 0.9 },
		});
		expect(v.verdict).toBe("safe");
		expect(v.confidence).toBeCloseTo(0.92);
		expect(v.changeKind).toBe("construct_augment");
	});
	test("mid noul maps to needs-human", () => {
		const v = verdictFromAnswers({ safe_to_auto_accept: { noul: 0.6 } });
		expect(v.verdict).toBe("needs-human");
		expect(v.confidence).toBeCloseTo(0.6);
	});
	test("low noul maps to unsafe", () => {
		const v = verdictFromAnswers({ safe_to_auto_accept: { noul: 0.2 } });
		expect(v.verdict).toBe("unsafe");
	});
	test("missing noul falls back to needs-human", () => {
		const v = verdictFromAnswers({});
		expect(v.verdict).toBe("needs-human");
		expect(v.confidence).toBe(0);
	});
});

describe("buildProposalState", () => {
	test("includes rationale and preview", () => {
		const s = buildProposalState({
			id: "sp-1",
			graphId: "sg-1",
			status: "pending",
			createdAt: new Date().toISOString(),
			rationale: "fix construct",
			changes: [],
			preview: [{ label: "a.b", before: "x", after: "y" }],
		} as never);
		expect(s).toContain("fix construct");
		expect(s).toContain("a.b");
	});
});

import { describe, expect, test } from "bun:test";
import {
	accuracyInstruction,
	buildProposalState,
	changeKindQuestion,
	riskInstruction,
	shouldAutoAcceptOnConfidence,
	verdictFromAnswers,
} from "./jev-maintenance";

const proposal = (lane: string, changes: unknown[]) =>
	({
		id: "p",
		graphId: "g",
		status: "pending",
		createdAt: "",
		lane,
		rationale: "",
		changes,
		preview: [],
	}) as never;

describe("accuracyInstruction", () => {
	test("signature augment uses extraction wording", () => {
		const s = accuracyInstruction(
			proposal("construct", [
				{
					target: "augmentation",
					componentAlias: "a",
					field: "signature",
					value: { parameters: [] },
				},
			]),
		);
		expect(s).toContain("accurate, complete extraction");
	});
	test("signature augment blesses declared named/union returns and structural params", () => {
		const s = accuracyInstruction(
			proposal("construct", [
				{
					target: "augmentation",
					componentAlias: "a",
					field: "signature",
					value: { parameters: [] },
				},
			]),
		);
		expect(s).toContain("explicit return annotation");
		expect(s).toContain("named or union return type");
		expect(s).toContain("structural object parameter");
	});
	test("static topology uses package/module containment wording", () => {
		const s = accuracyInstruction(
			proposal("static-topology", [
				{
					target: "component",
					componentAlias: "a",
					field: "module",
					value: "src/web",
				},
			]),
		);
		expect(s).toContain("containment claim");
		expect(s).not.toContain("relation");
	});
	test("dynamic topology uses process wording", () => {
		const s = accuracyInstruction(
			proposal("dynamic-topology", [
				{ target: "component", componentAlias: "a", field: "process", value: "web" },
			]),
		);
		expect(s).toContain("deployment-unit");
		expect(s).not.toContain("containment");
	});
	test("walkthrough uses step wording", () => {
		const s = accuracyInstruction(
			proposal("walkthrough", [
				{
					target: "walkthrough-step",
					walkthroughId: "w",
					stepIndex: 0,
					field: "line",
					value: 1,
				},
			]),
		);
		expect(s).toContain("walkthrough step");
	});
});

describe("riskInstruction", () => {
	const signatureAugment = () =>
		proposal("construct", [
			{
				target: "augmentation",
				componentAlias: "a",
				field: "signature",
				value: { parameters: [] },
			},
		]);

	test("source-backed signature augment steers toward Safe", () => {
		const s = riskInstruction(signatureAugment(), { hasSourceContext: true });
		expect(s).toContain("does not rewrite the model JSON");
		expect(s).toContain("Score Safe");
	});

	test("signature augment without source context keeps generic wording", () => {
		expect(riskInstruction(signatureAugment(), { hasSourceContext: false })).toBe(
			"Risk of auto-accepting this correction",
		);
		expect(riskInstruction(signatureAugment())).toBe(
			"Risk of auto-accepting this correction",
		);
	});

	test("non-signature change keeps generic wording even with source", () => {
		const s = riskInstruction(
			proposal("construct", [
				{ target: "component", componentAlias: "a", field: "construct", value: "class" },
			]),
			{ hasSourceContext: true },
		);
		expect(s).toBe("Risk of auto-accepting this correction");
	});
});

describe("changeKindQuestion", () => {
	test("construct offers signature + identity + construct", () => {
		const q = changeKindQuestion(
			proposal("construct", [
				{
					target: "augmentation",
					componentAlias: "a",
					field: "signature",
					value: { parameters: [] },
				},
			]),
		);
		expect(Object.keys(q.criteria)).toContain("signature_augment");
		expect(Object.keys(q.criteria)).toContain("identity_fix");
	});
	test("static topology offers module only", () => {
		const q = changeKindQuestion(proposal("static-topology", []));
		expect(Object.keys(q.criteria)).toContain("module_fix");
		expect(Object.keys(q.criteria)).not.toContain("process_fix");
	});
	test("dynamic topology offers process only", () => {
		const q = changeKindQuestion(proposal("dynamic-topology", []));
		expect(Object.keys(q.criteria)).toContain("process_fix");
		expect(Object.keys(q.criteria)).not.toContain("module_fix");
	});
	test("walkthrough offers walkthrough_fix", () => {
		const q = changeKindQuestion(proposal("walkthrough", []));
		expect(Object.keys(q.criteria)).toContain("walkthrough_fix");
	});
});

describe("verdictFromAnswers", () => {
	test("high noul maps to accurate with noul confidence", () => {
		const v = verdictFromAnswers({
			accurate: { noul: 0.92 },
			change_kind: { choice: "construct_augment", confidence: 0.7 },
			risk: { score: 0.1, confidence: 0.9 },
		});
		expect(v.verdict).toBe("accurate");
		expect(v.confidence).toBeCloseTo(0.92);
		expect(v.changeKind).toBe("construct_augment");
	});
	test("mid noul maps to uncertain", () => {
		const v = verdictFromAnswers({ accurate: { noul: 0.6 } });
		expect(v.verdict).toBe("uncertain");
		expect(v.confidence).toBeCloseTo(0.6);
	});
	test("low noul maps to inaccurate", () => {
		const v = verdictFromAnswers({ accurate: { noul: 0.2 } });
		expect(v.verdict).toBe("inaccurate");
	});
	test("missing noul falls back to uncertain", () => {
		const v = verdictFromAnswers({});
		expect(v.verdict).toBe("uncertain");
		expect(v.confidence).toBe(0);
	});
});

describe("shouldAutoAcceptOnConfidence", () => {
	const opinion = (confidence: number, error?: string) =>
		({
			source: "jev-latest",
			checkedAt: "",
			verdict: "accurate",
			confidence,
			error,
		}) as never;

	test("confidence at or above threshold qualifies", () => {
		expect(shouldAutoAcceptOnConfidence(opinion(0.85), 0.85)).toBe(true);
		expect(shouldAutoAcceptOnConfidence(opinion(0.9), 0.85)).toBe(true);
	});
	test("confidence below threshold is held back", () => {
		expect(shouldAutoAcceptOnConfidence(opinion(0.84), 0.85)).toBe(false);
	});
	test("missing opinion never qualifies", () => {
		expect(shouldAutoAcceptOnConfidence(undefined, 0.5)).toBe(false);
	});
	test("scoring error never qualifies, even with high confidence", () => {
		expect(shouldAutoAcceptOnConfidence(opinion(0.99, "no key"), 0.5)).toBe(false);
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

	test("appends source context when provided", () => {
		const s = buildProposalState(
			{
				id: "sp-1",
				graphId: "sg-1",
				status: "pending",
				createdAt: new Date().toISOString(),
				rationale: "claim types",
				changes: [],
				preview: [],
			} as never,
			{ sourceContext: "  10| function f() {}" },
		);
		expect(s).toContain("Source under review:");
		expect(s).toContain("function f() {}");
	});

	test("omits source context when blank", () => {
		const s = buildProposalState(
			{
				id: "sp-1",
				graphId: "sg-1",
				status: "pending",
				createdAt: new Date().toISOString(),
				rationale: "claim types",
				changes: [],
				preview: [],
			} as never,
			{ sourceContext: "   " },
		);
		expect(s).not.toContain("Source under review:");
	});
});

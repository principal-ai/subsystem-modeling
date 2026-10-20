import { describe, expect, test } from "bun:test";
import { callsSiteOutsideFrom } from "./trail-site";

const span = (startLine: number, endLine: number) => ({
	startLine,
	endLine,
	contentHash: "h",
});

const step = (over: Record<string, unknown> = {}) =>
	({
		mechanism: "calls",
		file: "src/panel.tsx",
		span: span(42, 42),
		...over,
	}) as never;

const from = (over: Record<string, unknown> = {}) =>
	({
		file: "src/panel.tsx",
		declarationSpan: span(1, 100),
		...over,
	}) as never;

describe("callsSiteOutsideFrom", () => {
	test("a site inside the from declaration is a call", () => {
		expect(callsSiteOutsideFrom(step(), from())).toBe(false);
	});

	test("a site in another file is outside", () => {
		expect(
			callsSiteOutsideFrom(step({ file: "src/list.tsx" }), from()),
		).toBe(true);
	});

	test("a sibling construct in the same file is outside", () => {
		expect(
			callsSiteOutsideFrom(step({ span: span(120, 122) }), from()),
		).toBe(true);
	});

	test("a nested construct inside the from span is not outside", () => {
		expect(
			callsSiteOutsideFrom(
				step({ span: span(42, 42) }),
				from({ declarationSpan: span(10, 90) }),
			),
		).toBe(false);
	});

	test("uses the resolved site construct when present", () => {
		// The callsite is a single line outside the class span, but the enclosing
		// site is the class's method — the site is what must be contained.
		expect(
			callsSiteOutsideFrom(
				step({
					span: span(120, 122),
					site: { symbol: "Store.run", span: span(20, 40) },
				}),
				from({ declarationSpan: span(10, 90) }),
			),
		).toBe(false);
		expect(
			callsSiteOutsideFrom(
				step({
					span: span(42, 42),
					site: { symbol: "Other.run", span: span(120, 122) },
				}),
				from({ declarationSpan: span(10, 90) }),
			),
		).toBe(true);
	});

	test("uses never requires containment", () => {
		expect(
			callsSiteOutsideFrom(
				step({ mechanism: "uses", file: "src/list.tsx" }),
				from(),
			),
		).toBe(false);
	});

	test("missing evidence stays permissive", () => {
		expect(callsSiteOutsideFrom(step({ span: undefined }), from())).toBe(false);
		expect(
			callsSiteOutsideFrom(step(), from({ declarationSpan: undefined })),
		).toBe(false);
		expect(callsSiteOutsideFrom(step(), undefined)).toBe(false);
	});
});

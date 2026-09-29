import { describe, expect, test } from "bun:test";
import { storeTypeStale, storeTypeUndeclared } from "./verify-subsystem-component";
import type { SubsystemComponent } from "../shared/contract";

/**
 * Store completeness — the `store_type_undeclared` gap.
 *
 * Narrow by design: only an in-memory store, and only when the declaration
 * carries neither a value type nor named members. Everything else is not the
 * gap, and a false positive would send the verifier after a store that has
 * nothing to fill.
 */
const store = (
	declaration: Record<string, unknown> | undefined,
	over?: Partial<SubsystemComponent>,
): SubsystemComponent =>
	({
		alias: "feeds",
		name: "feeds",
		construct: "store",
		symbol: "feeds",
		file: "src/live.ts",
		purl: "pkg:github/acme/app",
		...(declaration ? { declaration } : {}),
		...over,
	}) as unknown as SubsystemComponent;

describe("storeTypeUndeclared", () => {
	test("memory store with neither valueType nor members is the gap", () => {
		expect(storeTypeUndeclared(store({ kind: "store", storage: "memory", properties: [] }))).toBe(
			true,
		);
	});

	test("a declared value type clears it", () => {
		expect(
			storeTypeUndeclared(
				store({
					kind: "store",
					storage: "memory",
					properties: [],
					valueType: "Map<string, OpencodeLiveFeedState>",
				}),
			),
		).toBe(false);
	});

	test("named state members clear it (properties is a declared shape)", () => {
		expect(
			storeTypeUndeclared(
				store({
					kind: "store",
					storage: "memory",
					properties: [{ name: "current", type: "Map<string, Size>" }],
				}),
			),
		).toBe(false);
	});

	test("not a memory store — out of scope", () => {
		expect(
			storeTypeUndeclared(store({ kind: "store", storage: "disk", properties: [] })),
		).toBe(false);
		expect(
			storeTypeUndeclared(store({ kind: "store", storage: "external", properties: [] })),
		).toBe(false);
		// No `storage` claim at all — not our gap to raise.
		expect(storeTypeUndeclared(store({ kind: "store", properties: [] }))).toBe(false);
	});

	test("not a store / no declaration — out of scope", () => {
		expect(storeTypeUndeclared(store(undefined, { construct: "function" }))).toBe(false);
		expect(storeTypeUndeclared(store(undefined))).toBe(false);
		expect(
			storeTypeUndeclared(
				store({ kind: "function", parameters: [] }, { construct: "store" }),
			),
		).toBe(false);
	});

	test("a blank value type is not a declared type", () => {
		expect(
			storeTypeUndeclared(
				store({ kind: "store", storage: "memory", properties: [], valueType: "   " }),
			),
		).toBe(true);
	});
});

/**
 * Drift re-examination — the `store_type_stale` gap.
 *
 * A declared value type can only be wrong because the source moved, so it is
 * re-derived when the pinned declaration goes stale — the moment a human is
 * already re-looking at it. Mutually exclusive with `storeTypeUndeclared`: a
 * store with no value type has nothing to re-derive.
 */
const typedStore = (storage: string, valueType?: string): SubsystemComponent =>
	store({
		kind: "store",
		storage,
		properties: [],
		...(valueType === undefined ? {} : { valueType }),
	});

describe("storeTypeStale", () => {
	test("a typed store whose declaration moved is the gap", () => {
		expect(
			storeTypeStale(typedStore("memory", "Map<string, OpencodeLiveFeedState>"), "stale"),
		).toBe(true);
		// Any backing — drift matters wherever a type was declared.
		expect(storeTypeStale(typedStore("disk", "SubsystemModelRun[]"), "stale")).toBe(true);
		expect(storeTypeStale(typedStore("external", "SessionRow"), "stale")).toBe(true);
	});

	test("fresh / missing / unanchored declarations are not the gap", () => {
		const c = typedStore("memory", "Map<string, OpencodeLiveFeedState>");
		expect(storeTypeStale(c, "fresh")).toBe(false);
		expect(storeTypeStale(c, "missing")).toBe(false);
		expect(storeTypeStale(c, "unanchored")).toBe(false);
		expect(storeTypeStale(c, undefined)).toBe(false);
	});

	test("no declared value type — nothing to re-derive (undeclared covers it)", () => {
		expect(storeTypeStale(typedStore("memory"), "stale")).toBe(false);
		expect(storeTypeStale(typedStore("memory", "   "), "stale")).toBe(false);
	});

	test("not a store, or no store declaration", () => {
		expect(
			storeTypeStale(
				store({ kind: "function", parameters: [] }, { construct: "store" }),
				"stale",
			),
		).toBe(false);
		expect(
			storeTypeStale(store(undefined, { construct: "store" }), "stale"),
		).toBe(false);
	});

	test("mutually exclusive with storeTypeUndeclared", () => {
		const undeclared = typedStore("memory");
		expect(storeTypeUndeclared(undeclared)).toBe(true);
		expect(storeTypeStale(undeclared, "stale")).toBe(false);
	});
});

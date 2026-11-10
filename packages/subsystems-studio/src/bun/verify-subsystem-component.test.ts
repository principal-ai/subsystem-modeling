import { describe, expect, test } from "bun:test";
import {
	installedDependencyPackage,
	storeTypeStale,
	storeTypeUndeclared,
	unconnectedComponentFindings,
	verificationFailureDiagnostic,
	verificationUnavailableFinding,
} from "./verify-subsystem-component";
import type { SubsystemComponent, SubsystemTrail } from "../shared/contract";

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

describe("unconnectedComponentFindings", () => {
	const component = (alias: string): SubsystemComponent =>
		({ alias, name: alias, construct: "store", file: "", purl: "external" }) as SubsystemComponent;

	test("reports components that are not an endpoint of any trail step", () => {
		const trails = [
			{
				id: "flow",
				title: "flow",
				steps: [{ from: "entry", to: "service", mechanism: "calls" }],
			},
		] as unknown as SubsystemTrail[];
		const findings = unconnectedComponentFindings(
			[component("entry"), component("service"), component("projects-json")],
			trails,
		);

		expect(findings).toEqual([
			{
				kind: "component_unconnected",
				severity: "info",
				componentAlias: "projects-json",
				componentName: "projects-json",
				message:
					'Component "projects-json" has no trail edges. Add a trail if it participates in this subsystem, or remove it if it is out of scope.',
			},
		]);
	});

	test("does not report connected singletons or components with self-edges", () => {
		const trails = [
			{
				id: "self",
				title: "self",
				steps: [{ from: "standalone", to: "standalone", mechanism: "calls" }],
			},
		] as unknown as SubsystemTrail[];
		expect(unconnectedComponentFindings([component("standalone")], trails)).toEqual([]);
	});

	test("reports every component when there are no trail steps", () => {
		expect(
			unconnectedComponentFindings([component("a"), component("b")], []),
		).toHaveLength(2);
	});
});

describe("installedDependencyPackage", () => {
	test("names the package a node_modules path is installed from", () => {
		expect(
			installedDependencyPackage(
				"packages/subsystems-react/node_modules/@pierre/diffs/dist/highlighter/shared_highlighter.js",
			),
		).toEqual({ packageName: "@pierre/diffs" });
		expect(installedDependencyPackage("node_modules/left-pad/index.js")).toEqual({
			packageName: "left-pad",
		});
	});

	test("ordinary repo source is not a dependency", () => {
		expect(installedDependencyPackage("packages/subsystems-core/src/index.ts")).toBeNull();
		expect(installedDependencyPackage(undefined)).toBeNull();
		expect(installedDependencyPackage("")).toBeNull();
		// A directory that merely starts with the same letters is not an install root.
		expect(installedDependencyPackage("packages/node_modulesx/a.js")).toBeNull();
	});

	test("an unscoped package wins over a deeper path", () => {
		expect(
			installedDependencyPackage("a/node_modules/pkg/node_modules/dep/b.js"),
		).toEqual({ packageName: "dep" });
	});
});

describe("verificationFailureDiagnostic", () => {
	test("identifies the Tree-sitter WASM indirect-call crash without leaking runtime paths", () => {
		const diagnostic = verificationFailureDiagnostic(
			new Error("Out of bounds call_indirect (evaluating 'C2._ts_parser_new_wasm()')"),
		);
		expect(diagnostic).toBe(
			"Tree-sitter WASM parser aborted (out-of-bounds indirect call)",
		);
	});

	test("summarizes other verifier exceptions by error type", () => {
		expect(verificationFailureDiagnostic(new TypeError("/private/path/source.ts"))).toBe(
			"component verification threw TypeError",
		);
	});

	test("turns parser aborts into an audit finding grouped by repository", () => {
		expect(
			verificationUnavailableFinding(
				"pkg:github/acme/app",
				new Error("Out of bounds call_indirect (evaluating '_ts_parser_new_wasm()')"),
			),
		).toEqual({
			kind: "graphify_unavailable",
			severity: "info",
			purl: "pkg:github/acme/app",
			message:
				"Source verification aborted for pkg:github/acme/app: Tree-sitter WASM parser aborted (out-of-bounds indirect call). Retry the audit; if it repeats, inspect the host logs.",
		});
	});
});

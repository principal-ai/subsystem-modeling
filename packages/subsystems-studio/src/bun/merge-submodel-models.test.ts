import { describe, expect, test } from "bun:test";
import { mergeSubsystemModels } from "./merge-submodel-models";
import type { SubsystemComponent, SubsystemModelDocument } from "../shared/contract";

function doc(
	partial: Partial<SubsystemModelDocument>,
): SubsystemModelDocument {
	return { components: [], relations: [], ...partial };
}

function code(alias: string, extra: Partial<SubsystemComponent> = {}): SubsystemComponent {
	return {
		alias,
		name: alias,
		construct: "function",
		file: "src/a.ts",
		purl: "pkg:github/acme/app",
		symbol: alias,
		...extra,
	};
}

describe("mergeSubsystemModels", () => {
	test("unifies same code identity across models, rebasing edges", () => {
		const r = mergeSubsystemModels([
			{
				id: "sg-1",
				document: doc({
					components: [
						code("reader", {
							purpose: "Reads one stored graph from disk.",
							role: "entry",
							symbol: "readGraph",
						}),
					],
					relations: [
						{ id: "r1", from: "reader", to: "outside", relationType: "references" },
					],
					walkthroughs: [
						{
							id: "w1",
							title: "Read",
							steps: [
								{ from: "reader", to: "outside", mechanism: "reads", file: "src/a.ts", line: 1, purl: "pkg:github/acme/app#src/a.ts", symbol: "reader" },
							],
						},
					],
				}),
			},
			{
				id: "sg-2",
				document: doc({
					components: [
						code("reader-v2", {
							purpose: "Reads one stored graph out of the store for both surfaces.",
							symbol: "readGraph",
						}),
					],
					relations: [],
				}),
			},
		]);
		// One node, canonical alias from the first model in stable order.
		expect(r.document.components.map((c) => c.alias)).toEqual(["reader"]);
		const node = r.document.components[0]!;
		expect(node.purpose).toBe("Reads one stored graph from disk.");
		expect(node.role).toBe("entry");
		// Relation + walkthrough step rebased to the canonical alias;
		// the external label passes through untouched.
		expect(r.document.relations[0]).toMatchObject({ from: "reader", to: "outside" });
		expect(r.document.walkthroughs?.[0]?.steps[0]).toMatchObject({
			from: "reader",
			to: "outside",
		});
		// Purpose alternatives recorded for the agent pass.
		const purposeConflict = r.sidecar.conflicts.find(
			(c) => c.nodeKey === "reader" && c.field === "purpose",
		);
		expect(purposeConflict?.values.map((v) => v.value)).toEqual([
			"Reads one stored graph from disk.",
			"Reads one stored graph out of the store for both surfaces.",
		]);
		expect(r.sidecar.nodes).toEqual([
			{ alias: "reader", sourceAliases: ["reader", "reader-v2"], sourceModels: ["sg-1", "sg-2"] },
		]);
	});

	test("same alias different identity stays separate (app-worker case)", () => {
		const temporal = (file: string): SubsystemComponent => ({
			alias: "app-worker",
			name: "AppWorker",
			construct: "external",
			file,
			purl: `pkg:github/temporalio/temporal#${file}`,
		});
		const r = mergeSubsystemModels([
			{ id: "sg-1", document: doc({ components: [temporal("service/matching/matcher.go")] }) },
			{ id: "sg-2", document: doc({ components: [temporal("service/frontend/workflow_handler.go")] }) },
		]);
		// Different purls -> different join keys -> two nodes. The second
		// canonical alias is disambiguated so the document stays valid.
		expect(r.document.components.map((c) => c.alias)).toEqual([
			"app-worker",
			"app-worker__sg-2",
		]);
		expect(r.sidecar.conflicts).toEqual([]);
	});

	test("code store vs external table sharing an alias stays separate", () => {
		const r = mergeSubsystemModels([
			{
				id: "sg-1",
				document: doc({
					components: [
						{
							alias: "store-event",
							name: "event",
							construct: "store",
							file: "packages/subsystems-studio/src/bun/session-pipeline.ts",
							purl: "pkg:github/principal-ai/subsystem-modeling",
							symbol: "processSessionEvents",
						},
					],
				}),
			},
			{
				id: "sg-2",
				document: doc({
					components: [
						{
							alias: "store-event",
							name: "event (opencode.db)",
							construct: "external",
							file: "",
							purl: "external:opencode.db/event",
						},
					],
				}),
			},
		]);
		expect(r.document.components.map((c) => c.alias)).toEqual([
			"store-event",
			"store-event__sg-2",
		]);
		expect(r.document.components[1]!.construct).toBe("external");
	});

	test("bare externals never unify across models", () => {
		const bare = (alias: string): SubsystemComponent => ({
			alias,
			name: "Cache",
			construct: "external",
			file: "",
			purl: "external",
		});
		const r = mergeSubsystemModels([
			{ id: "sg-1", document: doc({ components: [bare("cache-a")] }) },
			{ id: "sg-2", document: doc({ components: [bare("cache-b")] }) },
		]);
		// Same display name, but purl 'external' carries no identity:
		// model-scoped, two nodes.
		expect(r.document.components).toHaveLength(2);
	});

	test("externals unify on exact (purl, name)", () => {
		const table = (alias: string, name: string): SubsystemComponent => ({
			alias,
			name,
			construct: "external",
			file: "",
			purl: "external:opencode.db/session",
		});
		const r = mergeSubsystemModels([
			{ id: "sg-1", document: doc({ components: [table("store-session", "session (opencode.db)")] }) },
			{ id: "sg-2", document: doc({ components: [table("session-store", "session (opencode.db)")] }) },
		]);
		expect(r.document.components.map((c) => c.alias)).toEqual(["store-session"]);
		expect(r.sidecar.nodes[0]).toEqual({
			alias: "store-session",
			sourceAliases: ["store-session", "session-store"],
			sourceModels: ["sg-1", "sg-2"],
		});
	});

	test("proposed-with-intent unifies like code and grounded wins", () => {
		const r = mergeSubsystemModels([
			{
				id: "sg-1",
				document: doc({
					components: [
						code("resolve-kind", {
							proposed: true,
							purpose: "Planned resolver.",
							symbol: "resolveKind",
						}),
					],
				}),
			},
			{
				id: "sg-2",
				document: doc({
					components: [
						code("resolve-kind-live", { purpose: "Resolves the kind.", symbol: "resolveKind" }),
					],
				}),
			},
		]);
		expect(r.document.components).toHaveLength(1);
		expect(r.document.components[0]!.alias).toBe("resolve-kind");
		expect(r.document.components[0]!.proposed).toBeUndefined();
	});

	test("layer is dropped (per-model pipeline hints are incomparable)", () => {
		const r = mergeSubsystemModels([
			{
				id: "sg-1",
				document: doc({ components: [code("a", { layer: 0, symbol: "shared" })] }),
			},
			{
				id: "sg-2",
				document: doc({ components: [code("a2", { layer: 7, symbol: "shared" })] }),
			},
		]);
		expect(r.document.components).toHaveLength(1);
		expect(r.document.components[0]!.layer).toBeUndefined();
		// No conflict noise for a field we intentionally discard.
		expect(r.sidecar.conflicts.some((c) => c.field === "layer")).toBe(false);
	});

	test("set-wins needs no conflict; differing roles conflict", () => {
		const r = mergeSubsystemModels([
			{
				id: "sg-1",
				document: doc({ components: [code("a", { role: "entry", symbol: "shared" })] }),
			},
			{
				id: "sg-2",
				document: doc({ components: [code("a2", { role: "service", symbol: "shared" })] }),
			},
		]);
		expect(r.document.components[0]!.role).toBe("entry");
		const roleConflict = r.sidecar.conflicts.find(
			(c) => c.nodeKey === "a" && c.field === "role",
		);
		expect(roleConflict?.values.map((v) => v.value)).toEqual(["entry", "service"]);
		// No conflict recorded for fields where only one side set a value.
		expect(r.sidecar.conflicts.some((c) => c.field === "purpose")).toBe(false);
	});

	test("relation and walkthrough id collisions disambiguate deterministically", () => {
		const r = mergeSubsystemModels([
			{
				id: "sg-1",
				document: doc({
					components: [code("a"), code("b")],
					relations: [{ id: "r1", from: "a", to: "b", relationType: "references" }],
					walkthroughs: [
						{
							id: "w1",
							title: "One",
							steps: [{ from: "a", to: "b", mechanism: "calls", file: "src/a.ts", line: 1, purl: "pkg:github/acme/app#src/a.ts", symbol: "a" }],
						},
					],
				}),
			},
			{
				id: "sg-2",
				document: doc({
					components: [code("c")],
					relations: [{ id: "r1", from: "c", to: "a", relationType: "references" }],
					walkthroughs: [
						{
							id: "w1",
							title: "Two",
							steps: [{ from: "c", to: "a", mechanism: "calls", file: "src/a.ts", line: 2, purl: "pkg:github/acme/app#src/a.ts", symbol: "c" }],
						},
					],
				}),
			},
		]);
		expect(r.document.relations.map((x) => x.id)).toEqual(["r1", "r1__dup1"]);
		expect((r.document.walkthroughs ?? []).map((w) => w.id)).toEqual(["w1", "w1__dup1"]);
		// Cross-model edge rebased through sg-2's alias space.
		expect(r.document.relations[1]).toMatchObject({ from: "c", to: "a" });
	});

	test("single-repo title and traceable description", () => {
		const r = mergeSubsystemModels([
			{ id: "sg-2", document: doc({ components: [code("b")] }) },
			{ id: "sg-1", document: doc({ components: [code("a")] }) },
		]);
		expect(r.document.title).toBe("Composed: pkg:github/acme/app");
		expect(r.document.description).toContain("sg-1");
		expect(r.document.description).toContain("sg-2");
		// Stable order regardless of input order: sg-1 first.
		expect(r.document.components.map((c) => c.alias)).toEqual(["a", "b"]);
	});

	test("empty input yields an empty document", () => {
		const r = mergeSubsystemModels([]);
		expect(r.document.components).toEqual([]);
		expect(r.document.relations).toEqual([]);
		expect(r.sidecar.conflicts).toEqual([]);
	});
});

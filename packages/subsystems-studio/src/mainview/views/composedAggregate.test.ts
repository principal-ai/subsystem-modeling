import { describe, expect, test } from "bun:test";
import { aggregateToFrames } from "./composedAggregate";
import type { SubsystemComponent, SubsystemModelDocument } from "../../shared/contract";

function comp(alias: string, extra: Partial<SubsystemComponent> = {}): SubsystemComponent {
	return {
		alias,
		name: alias,
		construct: "function",
		file: `${alias}.ts`,
		purl: "pkg:github/acme/app",
		symbol: alias,
		...extra,
	};
}

function doc(partial: Partial<SubsystemModelDocument>): SubsystemModelDocument {
	return { components: [], relations: [], ...partial };
}

describe("aggregateToFrames", () => {
	test("groups by module, process, and ungrouped bucket", () => {
		const g = aggregateToFrames(
			doc({
				components: [
					comp("a", { module: "src/a.ts", process: "app/host" }),
					comp("b", { module: "src/a.ts", process: "app/host" }),
					comp("c", { process: "app/host" }),
					comp("d", {}),
				],
			}),
		);
	 expect(g.frames.map((f) => f.id)).toEqual([
			"module:src/a.ts",
			"process:app/host",
			"ungrouped",
		]);
		expect(g.processes).toEqual(["app/host"]);
		const mod = g.frames[0]!;
		expect(mod.members.map((m) => m.alias)).toEqual(["a", "b"]);
		expect(mod.group).toEqual({ key: "app/host", kind: "process" });
		expect(g.frames[1]!.members.map((m) => m.alias)).toEqual(["c"]);
		expect(g.frames[2]!.members.map((m) => m.alias)).toEqual(["d"]);
	});

	test("mixed-process module takes the majority column, ties first-seen", () => {
		const g = aggregateToFrames(
			doc({
				components: [
					comp("a", { module: "src/a.ts", process: "p1" }),
					comp("b", { module: "src/a.ts", process: "p2" }),
					comp("c", { module: "src/a.ts", process: "p2" }),
				],
			}),
		);
		expect(g.frames).toHaveLength(1);
		expect(g.frames[0]!.group).toEqual({ key: "p2", kind: "process" });
	});

	test("file-less non-placeholders become external frames in one boundary", () => {
		const g = aggregateToFrames(
			doc({
				components: [
					comp("db-a", { construct: "external", file: "", process: "opencode/sqlite" }),
					comp("db-b", { construct: "external", file: "", process: "opencode/sqlite" }),
					comp("api", { construct: "external", file: "", process: "external/github" }),
					comp("actor", { construct: "custom_entity", file: "", process: "" }),
				],
			}),
		);
		// One frame per system key; all share the single external boundary.
		expect(g.frames.map((f) => [f.id, f.kind, f.group])).toEqual([
			["external:opencode/sqlite", "external", { key: "external", kind: "external" }],
			["external:external/github", "external", { key: "external", kind: "external" }],
			["external:unassigned", "external", { key: "external", kind: "external" }],
		]);
	});

	test("grounded code without a module stays in the process frame, not external", () => {
		const g = aggregateToFrames(
			doc({
				components: [
					comp("a", { file: "src/a.ts", process: "app/host" }),
					comp("plan", { file: "src/plan.ts", process: "app/host", proposed: true }),
				],
			}),
		);
		expect(g.frames.map((f) => [f.id, f.kind])).toEqual([["process:app/host", "process"]]);
		expect(g.frames[0]!.members.map((m) => m.alias)).toEqual(["a", "plan"]);
	});

	test("walkthrough steps become deduped frame edges; intra-frame skipped", () => {
		const g = aggregateToFrames(
			doc({
				components: [
					comp("a", { module: "src/a.ts", process: "p1" }),
					comp("b", { module: "src/b.ts", process: "p1" }),
					comp("c", { module: "src/a.ts", process: "p1" }),
				],
				walkthroughs: [
					{
						id: "w1",
						title: "One",
						steps: [
							{ from: "a", to: "b", mechanism: "calls", file: "src/a.ts", line: 1 },
							{ from: "a", to: "b", mechanism: "calls", file: "src/a.ts", line: 2 },
							{ from: "a", to: "c", mechanism: "reads", file: "src/a.ts", line: 3 },
							{ from: "ghost", to: "b", mechanism: "calls", file: "src/a.ts", line: 4 },
						],
					},
					{
						id: "w2",
						title: "Two",
						steps: [
							{ from: "b", to: "a", mechanism: "feeds", file: "src/b.ts", line: 9 },
						],
					},
				],
			}),
		);
		// a->c is intra-frame (same module) and ghost is unknown: both skipped.
		// p1 holds two frames, so it gets a hub pair — but both hops stay
		// inside the boundary, so edges remain direct (hubs only route
		// crossings) and carry their real endpoints as source/target.
		expect(g.hubs.map((h) => h.id)).toEqual([
			"hub:in:process:p1",
			"hub:out:process:p1",
		]);
		expect(g.edges).toEqual([
			{
				from: "module:src/a.ts",
				to: "module:src/b.ts",
				mechanisms: ["calls"],
				walkthroughIds: ["w1"],
				steps: 2,
				source: "module:src/a.ts",
				target: "module:src/b.ts",
			},
			{
				from: "module:src/b.ts",
				to: "module:src/a.ts",
				mechanisms: ["feeds"],
				walkthroughIds: ["w2"],
				steps: 1,
				source: "module:src/b.ts",
				target: "module:src/a.ts",
			},
		]);
	});

	test("multi-frame boundaries get hubs and inter-boundary hops route through them", () => {
		const g = aggregateToFrames(
			doc({
				components: [
					comp("a", { module: "src/a.ts", process: "p1" }),
					comp("b", { module: "src/b.ts", process: "p1" }),
					comp("c", { module: "src/c.ts", process: "p2" }),
					comp("d", { module: "src/d.ts", process: "p2" }),
				],
				walkthroughs: [
					{
						id: "w1",
						title: "One",
						steps: [
							{ from: "a", to: "c", mechanism: "calls", file: "src/a.ts", line: 1 },
						],
					},
				],
			}),
		);
		// Both boundaries have >1 frame: an intake/outtake pair each.
		expect(g.hubs.map((h) => [h.id, h.kind])).toEqual([
			["hub:in:process:p1", "intake"],
			["hub:out:process:p1", "outtake"],
			["hub:in:process:p2", "intake"],
			["hub:out:process:p2", "outtake"],
		]);
		// a->c becomes a → p1.out → p2.in → c, with real endpoints stamped.
		const byKey = new Map(g.edges.map((e) => [`${e.from}->${e.to}`, e]));
		expect([...byKey.keys()].sort()).toEqual([
			"hub:out:process:p1->hub:in:process:p2",
			"module:src/a.ts->hub:out:process:p1",
			"hub:in:process:p2->module:src/c.ts",
		].sort());
		expect(byKey.get("module:src/a.ts->hub:out:process:p1")!.source).toBe("module:src/a.ts");
		expect(byKey.get("hub:in:process:p2->module:src/c.ts")!.target).toBe("module:src/c.ts");
		expect(byKey.get("hub:out:process:p1->hub:in:process:p2")!.steps).toBe(1);
	});

	test("single-frame boundaries connect directly (no hub overhead)", () => {
		const g = aggregateToFrames(
			doc({
				components: [
					comp("a", { module: "src/a.ts", process: "p1" }),
					comp("c", { module: "src/c.ts", process: "p2" }),
				],
				walkthroughs: [
					{
						id: "w1",
						title: "One",
						steps: [{ from: "a", to: "c", mechanism: "calls", file: "src/a.ts", line: 1 }],
					},
				],
			}),
		);
		expect(g.hubs).toEqual([]);
		expect(g.edges).toEqual([
			{
				from: "module:src/a.ts",
				to: "module:src/c.ts",
				mechanisms: ["calls"],
				walkthroughIds: ["w1"],
				steps: 1,
				source: "module:src/a.ts",
				target: "module:src/c.ts",
			},
		]);
	});

	test("member models come from the sidecar", () => {
		const g = aggregateToFrames(
			doc({ components: [comp("a", { module: "src/a.ts" })] }),
			{
				nodes: [{ alias: "a", sourceAliases: ["a", "a2"], sourceModels: ["sg-1", "sg-2"] }],
				conflicts: [],
			},
		);
		expect(g.frames[0]!.members).toEqual([
			{ alias: "a", name: "a", file: "a.ts", construct: "function", models: ["sg-1", "sg-2"] },
		]);
		expect(g.frames[0]!.models).toEqual(["sg-1", "sg-2"]);
	});

	test("empty document yields no frames or edges", () => {
		const g = aggregateToFrames(doc({}));
		expect(g.processes).toEqual([]);
		expect(g.frames).toEqual([]);
		expect(g.edges).toEqual([]);
		expect(g.document).toEqual({ components: [], relations: [], walkthroughs: [] });
	});

	test("document carries frame nodes with rebased relations and walkthroughs", () => {
		const g = aggregateToFrames(
			doc({
				components: [
					comp("a", { module: "src/a.ts", process: "p1" }),
					comp("b", { module: "src/b.ts", process: "p1" }),
					comp("c", { module: "src/a.ts", process: "p1" }),
				],
				relations: [
					{ id: "r1", from: "a", to: "b", relationType: "imports" },
					{ id: "r2", from: "a", to: "c", relationType: "references" },
					{ id: "r3", from: "a", to: "ghost", relationType: "references" },
				],
				walkthroughs: [
					{
						id: "w1",
						title: "One",
						steps: [
							{ from: "a", to: "b", mechanism: "calls", file: "src/a.ts", line: 1 },
							{ from: "a", to: "c", mechanism: "reads", file: "src/a.ts", line: 2 },
						],
					},
					{
						id: "w2",
						title: "Empty after rebase",
						steps: [
							{ from: "a", to: "c", mechanism: "reads", file: "src/a.ts", line: 3 },
						],
					},
				],
			}),
		);
		// Frame nodes are fileless externals; purpose carries membership.
		// (Hub nodes ride the same document and are asserted separately.)
		expect(g.document.components.filter((c) => !c.alias.startsWith("hub:"))).toEqual([
			{
				alias: "module:src/a.ts",
				name: "a.ts",
				construct: "external",
				file: "",
				purl: "external",
				purpose: "2 members",
			},
			{
				alias: "module:src/b.ts",
				name: "b.ts",
				construct: "external",
				file: "",
				purl: "external",
				purpose: "1 member",
			},
		]);
		// Cross-frame relation rebased; intra-frame + dangling dropped.
		expect(g.document.relations).toEqual([
			{ id: "r1", from: "module:src/a.ts", to: "module:src/b.ts", relationType: "imports" },
		]);
		// Steps rebased with sites intact; emptied walkthrough dropped.
		expect(g.document.walkthroughs).toEqual([
			{
				id: "w1",
				title: "One",
				steps: [
					{ from: "module:src/a.ts", to: "module:src/b.ts", mechanism: "calls", file: "src/a.ts", line: 1 },
				],
			},
		]);
	});
});

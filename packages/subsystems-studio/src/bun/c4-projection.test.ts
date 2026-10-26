import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { C4Element } from "@principal-ai/subsystems-react";
import type {
	StoredSubsystemModel,
	SubsystemComponent,
	SubsystemTrail,
} from "../shared/contract";
import { upsertAcceptedC4Elements } from "./c4-element-store";
import {
	buildC4Projection,
	buildC4ProjectionForModel,
	repoKeysOf,
} from "./c4-projection";

const PURL = "pkg:github/acme/widget";

function component(over: {
	alias: string;
	process?: string;
	file?: string;
	construct?: SubsystemComponent["construct"];
	framework?: string;
	purl?: string;
}): SubsystemComponent {
	return {
		alias: over.alias,
		name: over.alias,
		construct: over.construct ?? "function",
		file: over.file ?? `src/${over.alias}.ts`,
		purl: over.purl ?? `${PURL}#src/${over.alias}.ts`,
		...(over.process !== undefined ? { process: over.process } : {}),
		...(over.framework !== undefined ? { framework: over.framework } : {}),
	};
}

function step(from: string, to: string, mechanism: SubsystemTrail["steps"][number]["mechanism"]) {
	return {
		from,
		to,
		mechanism,
		file: "src/step.ts",
		purl: `${PURL}#src/step.ts`,
		symbol: "step",
	};
}

function model(over: {
	title?: string;
	components: SubsystemComponent[];
	trails?: SubsystemTrail[];
}): StoredSubsystemModel {
	return {
		id: "sg-test",
		title: over.title ?? "Widget",
		components: over.components,
		...(over.trails ? { trails: over.trails } : {}),
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	};
}

function container(over: {
	id: string;
	process: string;
	label?: string;
}): C4Element {
	return {
		kind: "container",
		id: over.id,
		label: over.label ?? over.id,
		containerKind: "application",
		technology: "Bun",
		process: over.process,
		state: "accepted",
	};
}

const COMPONENTS = [
	component({ alias: "web-a", process: "app/web", framework: "React" }),
	component({ alias: "web-b", process: "app/web", framework: "React" }),
	component({
		alias: "github",
		process: "external/github",
		file: "",
		construct: "external",
	}),
	component({
		alias: "disk",
		process: "local/disk",
		file: "",
		construct: "store",
	}),
	component({ alias: "types", process: "core/types", construct: "interface" }),
	component({ alias: "loose" }),
];

const TRAILS: SubsystemTrail[] = [
	{
		id: "tl-a",
		title: "A",
		steps: [step("web-a", "web-b", "calls"), step("web-a", "github", "calls")],
	},
	{
		id: "tl-b",
		title: "B",
		steps: [step("web-b", "github", "calls"), step("web-b", "disk", "writes")],
	},
];

describe("buildC4Projection", () => {
	test("draft groups runtime processes, extracts externals, and leaves the rest unassigned", () => {
		const result = buildC4Projection({
			document: model({ components: COMPONENTS, trails: TRAILS }),
		});

		expect(result.source).toBe("draft");
		expect(result.repos).toEqual([PURL]);
		expect(result.model.system).toMatchObject({ label: "Widget", repoKey: PURL });

		const nodes = result.model.nodes;
		expect(nodes.filter((n) => n.kind === "container").map((n) => n.label)).toEqual([
			"app/web",
		]);
		expect(nodes.filter((n) => n.kind === "external-system").map((n) => n.label)).toEqual([
			"external/github",
			"local/disk",
		]);
		expect(result.unassignedComponents).toEqual(["loose", "types"]);

		const container = nodes.find((n) => n.kind === "container")!;
		expect(container.state).toBe("proposed");
		expect(result.memberships[container.id]).toEqual(["web-a", "web-b"]);

		expect(result.counts).toMatchObject({
			containers: 1,
			externals: 2,
			edges: 2,
			components: 6,
			unassignedComponents: 2,
		});
	});

	test("edges fold cross-boundary steps by endpoint and mechanism, with trail refs", () => {
		const result = buildC4Projection({
			document: model({ components: COMPONENTS, trails: TRAILS }),
		});
		const calls = result.model.edges.find((e) => e.label === "calls")!;
		const writes = result.model.edges.find((e) => e.label === "writes")!;

		expect(calls.mechanisms).toEqual(["calls"]);
		expect(calls.count).toBe(2);
		expect(calls.trailRefs).toEqual([
			{ trailId: "tl-a", stepIndices: [1] },
			{ trailId: "tl-b", stepIndices: [0] },
		]);
		expect(writes.count).toBe(1);
		expect(writes.trailRefs).toEqual([{ trailId: "tl-b", stepIndices: [1] }]);

		// Intra-container steps (web-a → web-b) fold into no line.
		expect(result.model.edges).toHaveLength(2);
	});

	test("auto uses accepted containers when one claims a real process key", () => {
		const result = buildC4Projection({
			document: model({ components: COMPONENTS, trails: TRAILS }),
			acceptedElements: [
				container({ id: "container:web", process: "app/web" }),
				{
					kind: "external-system",
					id: "external:github",
					label: "GitHub",
					members: ["github"],
					state: "accepted",
				},
			],
			source: "auto",
		});

		expect(result.source).toBe("accepted");
		expect(result.model.nodes.filter((n) => n.kind === "container")).toHaveLength(1);
		expect(result.model.nodes.filter((n) => n.kind === "external-system")).toHaveLength(1);
		// Only the external-calling step survives; disk is not an accepted element.
		expect(result.model.edges.map((e) => e.label)).toEqual(["calls"]);
	});

	test("auto falls back to draft when accepted containers do not match this model", () => {
		const result = buildC4Projection({
			document: model({ components: COMPONENTS, trails: TRAILS }),
			acceptedElements: [container({ id: "container:other", process: "other/unit" })],
		});

		expect(result.source).toBe("draft");
	});

	test("explicit accepted never falls back, and reports unbacked process keys", () => {
		const result = buildC4Projection({
			document: model({ components: COMPONENTS, trails: TRAILS }),
			acceptedElements: [container({ id: "container:other", process: "other/unit" })],
			source: "accepted",
		});

		expect(result.source).toBe("accepted");
		expect(result.model.nodes.filter((n) => n.kind === "container")).toHaveLength(1);
		expect(result.unbackedProcesses).toEqual(["app/web"]);
		expect(result.counts.unbackedProcesses).toBe(1);
	});

	test("multi-repo models use the title as the system label", () => {
		const result = buildC4Projection({
			document: model({
				components: [
					component({ alias: "a", process: "one", purl: "pkg:github/acme/one#src/a.ts" }),
					component({ alias: "b", process: "two", purl: "pkg:github/acme/two#src/b.ts" }),
				],
			}),
		});

		expect(result.repos).toEqual(["pkg:github/acme/one", "pkg:github/acme/two"]);
		expect(result.model.system.label).toBe("Widget");
		expect(result.model.system.repoKey).toBeUndefined();
	});

	test("repoKeysOf dedupes component purls", () => {
		expect(
			repoKeysOf([
				component({ alias: "a", purl: "pkg:github/acme/one#src/a.ts" }),
				component({ alias: "b", purl: "pkg:github/acme/one#src/b.ts" }),
				component({ alias: "c", purl: "pkg:github/acme/two#src/c.ts" }),
			]),
		).toEqual(["pkg:github/acme/one", "pkg:github/acme/two"]);
	});
});

describe("buildC4ProjectionForModel", () => {
	let root: string;
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "c4-projection-"));
		process.env["PRINCIPAL_C4_ELEMENTS_HOME"] = root;
	});
	afterEach(() => {
		delete process.env["PRINCIPAL_C4_ELEMENTS_HOME"];
		rmSync(root, { recursive: true, force: true });
	});

	test("reads the repo's accepted element set and projects it", async () => {
		await upsertAcceptedC4Elements(
			{
				purl: PURL,
				elements: [
					{
						id: "container:web",
						label: "Web",
						containerKind: "application",
						technology: "React",
						process: "app/web",
					},
				],
			},
			root,
		);

		const result = await buildC4ProjectionForModel(
			model({ components: COMPONENTS, trails: TRAILS }),
			"auto",
		);
		expect(result.source).toBe("accepted");
		expect(result.model.nodes.filter((n) => n.kind === "container")).toHaveLength(1);
	});

	test("no set on disk falls through to draft", async () => {
		const result = await buildC4ProjectionForModel(
			model({ components: COMPONENTS, trails: TRAILS }),
			"auto",
		);
		expect(result.source).toBe("draft");
	});
});

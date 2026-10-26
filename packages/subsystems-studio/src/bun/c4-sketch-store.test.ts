import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { C4Model } from "@principal-ai/subsystems-react";
import {
	createC4Sketch,
	deleteC4Sketch,
	getC4Sketch,
	listC4Sketches,
	updateC4Sketch,
	validateC4SketchModel,
} from "./c4-sketch-store";

const MODEL: C4Model = {
	view: "container",
	system: { id: "system:acme", label: "Acme" },
	nodes: [
		{
			kind: "container",
			id: "container:host",
			label: "Host",
			containerKind: "application",
			technology: "Bun",
			process: "acme/host",
			state: "accepted",
		},
		{
			kind: "component",
			id: "component:store",
			label: "Store",
			container: "container:host",
			technology: "",
			members: ["store"],
			state: "accepted",
		},
		{
			kind: "external-system",
			id: "external:github",
			label: "GitHub",
			members: ["github"],
			state: "accepted",
		},
		{
			kind: "person",
			id: "person:dev",
			label: "Developer",
			state: "accepted",
		},
	],
	edges: [
		{
			id: "e:host-github",
			source: "container:host",
			target: "external:github",
			label: "HTTPS",
			mechanisms: ["calls"],
			count: 1,
		},
	],
};

describe("c4 sketch store", () => {
	let root: string;
	const previous = process.env["PRINCIPAL_C4_SKETCHES_HOME"];

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "c4-sketches-"));
		process.env["PRINCIPAL_C4_SKETCHES_HOME"] = root;
	});

	afterEach(() => {
		if (previous === undefined) delete process.env["PRINCIPAL_C4_SKETCHES_HOME"];
		else process.env["PRINCIPAL_C4_SKETCHES_HOME"] = previous;
		rmSync(root, { recursive: true, force: true });
	});

	test("create forces proposed state and persists the authored model", async () => {
		const result = await createC4Sketch({
			title: "Acme architecture",
			repoKeys: ["pkg:github/acme/widget"],
			model: MODEL,
			author: "agent",
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const sketch = await getC4Sketch(result.sketch.id);
		expect(sketch).not.toBeNull();
		expect(sketch!.title).toBe("Acme architecture");
		expect(sketch!.repoKeys).toEqual(["pkg:github/acme/widget"]);
		expect(sketch!.model.nodes.every((node) => node.state === "proposed")).toBe(true);
		expect(sketch!.author).toBe("agent");
	});

	test("list returns summaries filtered by repo key", async () => {
		await createC4Sketch({
			title: "One",
			repoKeys: ["pkg:github/acme/one"],
			model: MODEL,
		});
		await createC4Sketch({
			title: "Two",
			repoKeys: ["pkg:github/acme/two"],
			model: MODEL,
		});

		const all = await listC4Sketches();
		expect(all).toHaveLength(2);
		expect(all[0]!.counts).toMatchObject({
			containers: 1,
			components: 1,
			externals: 1,
			persons: 1,
			edges: 1,
		});

		const one = await listC4Sketches({ repoKey: "pkg:github/acme/one" });
		expect(one.map((s) => s.title)).toEqual(["One"]);
	});

	test("update replaces the model and keeps the id", async () => {
		const created = await createC4Sketch({
			title: "Acme",
			repoKeys: [],
			model: MODEL,
		});
		if (!created.ok) throw new Error(created.error);

		const updated = await updateC4Sketch(created.sketch.id, {
			title: "Acme v2",
			repoKeys: ["pkg:github/acme/widget"],
		});
		expect(updated.ok).toBe(true);
		if (!updated.ok) return;
		expect(updated.sketch.id).toBe(created.sketch.id);
		expect(updated.sketch.title).toBe("Acme v2");
		expect(updated.sketch.repoKeys).toEqual(["pkg:github/acme/widget"]);
	});

	test("delete removes the sketch", async () => {
		const created = await createC4Sketch({
			title: "Gone",
			repoKeys: [],
			model: MODEL,
		});
		if (!created.ok) throw new Error(created.error);
		expect(await deleteC4Sketch(created.sketch.id)).toBe(true);
		expect(await getC4Sketch(created.sketch.id)).toBeNull();
		expect(await deleteC4Sketch(created.sketch.id)).toBe(false);
	});

	test("validation rejects broken references", async () => {
		const broken: C4Model = {
			...MODEL,
			edges: [
				{
					id: "e:missing",
					source: "container:host",
					target: "node:missing",
					label: "calls",
					mechanisms: ["calls"],
					count: 1,
				},
			],
		};
		const result = await createC4Sketch({
			title: "Broken",
			repoKeys: [],
			model: broken,
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("target references unknown node");
	});

	test("validation rejects duplicate ids and missing titles", async () => {
		expect(
			validateC4SketchModel({
				...MODEL,
				nodes: [...MODEL.nodes, MODEL.nodes[0]!],
			}),
		).toContain("duplicate node id: container:host");

		const result = await createC4Sketch({
			title: "  ",
			repoKeys: [],
			model: MODEL,
		});
		expect(result.ok).toBe(false);
	});
});

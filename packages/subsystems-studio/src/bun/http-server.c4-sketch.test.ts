import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	handleSubsystemModelRequest,
	type DeleteC4SketchHandler,
	type OpenC4SketchHandler,
} from "./http-server";

const noopOpen = async () => ({ ok: true });
const noopDelete = async () => ({ ok: true });
const noopShowcase = async () => ({ ok: true });

function request(path: string, init?: RequestInit): Request {
	return new Request(`http://127.0.0.1:3045${path}`, init);
}

function writeModel(root: string, id: string): void {
	const dir = join(root, ".principal", "subsystem-models");
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, `${id}.json`),
		JSON.stringify({
			id,
			title: "Acme model",
			components: [
				{
					alias: "host",
					name: "host",
					construct: "function",
					file: "src/host.ts",
					purl: "pkg:github/acme/widget#src/host.ts",
					process: "acme/host",
				},
				{
					alias: "github",
					name: "github",
					construct: "external",
					file: "",
					purl: "external:github",
					process: "external/github",
				},
			],
			trails: [
				{
					id: "tl-1",
					title: "Call",
					steps: [
						{
							from: "host",
							to: "github",
							mechanism: "calls",
							file: "src/host.ts",
							purl: "pkg:github/acme/widget#src/host.ts",
							symbol: "host",
						},
					],
				},
			],
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		}),
	);
}

const SKETCH_BODY = {
	title: "Acme sketch",
	repoKeys: ["pkg:github/acme/widget"],
	author: "agent",
	model: {
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
			},
			{
				kind: "external-system",
				id: "external:github",
				label: "GitHub",
				members: ["github"],
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
	},
};

describe("C4 sketch HTTP routes", () => {
	let modelsRoot: string;
	let sketchesRoot: string;
	let elementsRoot: string;
	const previousModels = process.env["PRINCIPAL_SUBSYSTEM_MODELS_HOME"];
	const previousSketches = process.env["PRINCIPAL_C4_SKETCHES_HOME"];
	const previousElements = process.env["PRINCIPAL_C4_ELEMENTS_HOME"];

	beforeEach(() => {
		modelsRoot = mkdtempSync(join(tmpdir(), "c4s-http-models-"));
		sketchesRoot = mkdtempSync(join(tmpdir(), "c4s-http-sketches-"));
		elementsRoot = mkdtempSync(join(tmpdir(), "c4s-http-elements-"));
		process.env["PRINCIPAL_SUBSYSTEM_MODELS_HOME"] = modelsRoot;
		process.env["PRINCIPAL_C4_SKETCHES_HOME"] = sketchesRoot;
		process.env["PRINCIPAL_C4_ELEMENTS_HOME"] = elementsRoot;
		writeModel(modelsRoot, "sg-1");
	});

	afterEach(() => {
		const restore = (key: string, value: string | undefined) => {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		};
		restore("PRINCIPAL_SUBSYSTEM_MODELS_HOME", previousModels);
		restore("PRINCIPAL_C4_SKETCHES_HOME", previousSketches);
		restore("PRINCIPAL_C4_ELEMENTS_HOME", previousElements);
		rmSync(modelsRoot, { recursive: true, force: true });
		rmSync(sketchesRoot, { recursive: true, force: true });
		rmSync(elementsRoot, { recursive: true, force: true });
	});

	test("create -> list -> get -> update -> delete", async () => {
		const created = await handleSubsystemModelRequest(
			request("/api/c4-sketches", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(SKETCH_BODY),
			}),
			noopOpen,
			noopDelete,
			noopShowcase,
		);
		expect(created.status).toBe(201);
		const createdBody = (await created.json()) as {
			ok: boolean;
			sketch: { id: string; model: { nodes: Array<{ state: string }> } };
		};
		expect(createdBody.ok).toBe(true);
		expect(createdBody.sketch.model.nodes.every((n) => n.state === "proposed")).toBe(true);
		const sketchId = createdBody.sketch.id;

		const listed = await handleSubsystemModelRequest(
			request("/api/c4-sketches?repo=pkg:github/acme/widget"),
			noopOpen,
			noopDelete,
			noopShowcase,
		);
		const listedBody = (await listed.json()) as { sketches: Array<{ id: string }> };
		expect(listedBody.sketches.map((s) => s.id)).toEqual([sketchId]);

		const got = await handleSubsystemModelRequest(
			request(`/api/c4-sketches/${sketchId}`),
			noopOpen,
			noopDelete,
			noopShowcase,
		);
		expect(got.status).toBe(200);

		const updated = await handleSubsystemModelRequest(
			request(`/api/c4-sketches/${sketchId}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: "Acme v2" }),
			}),
			noopOpen,
			noopDelete,
			noopShowcase,
		);
		const updatedBody = (await updated.json()) as { sketch: { title: string } };
		expect(updatedBody.sketch.title).toBe("Acme v2");

		const deleted = await handleSubsystemModelRequest(
			request(`/api/c4-sketches/${sketchId}`, { method: "DELETE" }),
			noopOpen,
			noopDelete,
			noopShowcase,
		);
		expect(deleted.status).toBe(200);

		const gone = await handleSubsystemModelRequest(
			request(`/api/c4-sketches/${sketchId}`),
			noopOpen,
			noopDelete,
			noopShowcase,
		);
		expect(gone.status).toBe(404);
	});

	test("create rejects an invalid model", async () => {
		const res = await handleSubsystemModelRequest(
			request("/api/c4-sketches", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					...SKETCH_BODY,
					model: {
						...SKETCH_BODY.model,
						edges: [
							{
								id: "e:bad",
								source: "container:host",
								target: "missing",
								label: "x",
								mechanisms: [],
								count: 0,
							},
						],
					},
				}),
			}),
			noopOpen,
			noopDelete,
			noopShowcase,
		);
		expect(res.status).toBe(400);
	});

	test("open forwards the sketch id", async () => {
		const calls: string[] = [];
		const onOpenC4Sketch: OpenC4SketchHandler = async (sketchId) => {
			calls.push(sketchId);
			return { ok: true, tabId: "9" };
		};
		const res = await handleSubsystemModelRequest(
			request("/api/c4-sketches/c4s-1/open", { method: "POST" }),
			noopOpen,
			noopDelete,
			noopShowcase,
			undefined,
			undefined,
			onOpenC4Sketch,
		);
		expect(res.status).toBe(200);
		expect(calls).toEqual(["c4s-1"]);
	});

	test("delete uses the host callback to close tabs", async () => {
		const deleted: string[] = [];
		const onDeleteC4Sketch: DeleteC4SketchHandler = async (sketchId) => {
			deleted.push(sketchId);
			return { ok: true };
		};
		const res = await handleSubsystemModelRequest(
			request("/api/c4-sketches/c4s-2", { method: "DELETE" }),
			noopOpen,
			noopDelete,
			noopShowcase,
			undefined,
			undefined,
			undefined,
			onDeleteC4Sketch,
		);
		expect(res.status).toBe(200);
		expect(deleted).toEqual(["c4s-2"]);
	});
});

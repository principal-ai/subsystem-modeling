import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	handleSubsystemModelRequest,
	type OpenC4TabHandler,
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
			title: "Widget",
			components: [
				{
					alias: "web",
					name: "web",
					construct: "function",
					file: "src/web.ts",
					purl: "pkg:github/acme/widget#src/web.ts",
					process: "app/web",
				},
				{
					alias: "api",
					name: "api",
					construct: "external",
					file: "",
					purl: "external:api",
					process: "external/api",
				},
			],
			trails: [
				{
					id: "tl-1",
					title: "Call",
					steps: [
						{
							from: "web",
							to: "api",
							mechanism: "calls",
							file: "src/web.ts",
							purl: "pkg:github/acme/widget#src/web.ts",
							symbol: "web",
						},
					],
				},
			],
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		}),
	);
}

describe("C4 HTTP routes", () => {
	let modelsRoot: string;
	let elementsRoot: string;
	const previousModels = process.env["PRINCIPAL_SUBSYSTEM_MODELS_HOME"];
	const previousElements = process.env["PRINCIPAL_C4_ELEMENTS_HOME"];

	beforeEach(() => {
		modelsRoot = mkdtempSync(join(tmpdir(), "c4-http-models-"));
		elementsRoot = mkdtempSync(join(tmpdir(), "c4-http-elements-"));
		process.env["PRINCIPAL_SUBSYSTEM_MODELS_HOME"] = modelsRoot;
		process.env["PRINCIPAL_C4_ELEMENTS_HOME"] = elementsRoot;
	});

	afterEach(() => {
		if (previousModels === undefined) delete process.env["PRINCIPAL_SUBSYSTEM_MODELS_HOME"];
		else process.env["PRINCIPAL_SUBSYSTEM_MODELS_HOME"] = previousModels;
		if (previousElements === undefined) delete process.env["PRINCIPAL_C4_ELEMENTS_HOME"];
		else process.env["PRINCIPAL_C4_ELEMENTS_HOME"] = previousElements;
		rmSync(modelsRoot, { recursive: true, force: true });
		rmSync(elementsRoot, { recursive: true, force: true });
	});

	test("GET /c4 returns a draft projection when no container is accepted", async () => {
		writeModel(modelsRoot, "sg-c4");

		const res = await handleSubsystemModelRequest(
			request("/api/subsystem-model/sg-c4/c4"),
			noopOpen,
			noopDelete,
			noopShowcase,
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			ok: boolean;
			source: string;
			model: { nodes: Array<{ kind: string }>; edges: unknown[] };
			counts: { containers: number; externals: number; edges: number };
		};
		expect(body.ok).toBe(true);
		expect(body.source).toBe("draft");
		expect(body.counts.containers).toBe(1);
		expect(body.counts.externals).toBe(1);
		expect(body.counts.edges).toBe(1);
	});

	test("GET /c4 rejects an unknown source", async () => {
		const res = await handleSubsystemModelRequest(
			request("/api/subsystem-model/sg-c4/c4?source=nope"),
			noopOpen,
			noopDelete,
			noopShowcase,
		);
		expect(res.status).toBe(400);
	});

	test("GET /c4 returns 404 for an unknown model", async () => {
		const res = await handleSubsystemModelRequest(
			request("/api/subsystem-model/missing/c4"),
			noopOpen,
			noopDelete,
			noopShowcase,
		);
		expect(res.status).toBe(404);
	});

	test("POST /c4/open forwards the source and returns the tab id", async () => {
		const calls: Array<{ id: string; source?: string }> = [];
		const onOpenC4: OpenC4TabHandler = async (id, source) => {
			calls.push({ id, source });
			return { ok: true, tabId: "7" };
		};
		const res = await handleSubsystemModelRequest(
			request("/api/subsystem-model/sg-c4/c4/open", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ source: "draft" }),
			}),
			noopOpen,
			noopDelete,
			noopShowcase,
			undefined,
			onOpenC4,
		);

		expect(res.status).toBe(200);
		expect(calls).toEqual([{ id: "sg-c4", source: "draft" }]);
		const body = (await res.json()) as { ok: boolean; tabId?: string };
		expect(body).toEqual({ ok: true, tabId: "7" });
	});

	test("POST /c4/open rejects an unknown source", async () => {
		const onOpenC4: OpenC4TabHandler = async () => ({ ok: true });
		const res = await handleSubsystemModelRequest(
			request("/api/subsystem-model/sg-c4/c4/open", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ source: "nope" }),
			}),
			noopOpen,
			noopDelete,
			noopShowcase,
			undefined,
			onOpenC4,
		);
		expect(res.status).toBe(400);
	});
});

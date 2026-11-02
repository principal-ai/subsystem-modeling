import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleSubsystemModelRequest } from "./http-server";

const noop = async () => ({ ok: true });

let home: string;
const previous = process.env["PRINCIPAL_SUBSYSTEM_MODELS_HOME"];

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "subsystem-model-notes-http-"));
	process.env["PRINCIPAL_SUBSYSTEM_MODELS_HOME"] = home;
});

afterEach(() => {
	if (previous === undefined) delete process.env["PRINCIPAL_SUBSYSTEM_MODELS_HOME"];
	else process.env["PRINCIPAL_SUBSYSTEM_MODELS_HOME"] = previous;
	rmSync(home, { recursive: true, force: true });
});

function request(path: string, init?: RequestInit): Request {
	return new Request(`http://127.0.0.1:3045${path}`, init);
}

async function create(body: Record<string, unknown>): Promise<Response> {
	return handleSubsystemModelRequest(
		request("/api/subsystem-model", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
		noop,
		noop,
		noop,
	);
}

test("POST /api/subsystem-model persists the description / notes split", async () => {
	const res = await create({
		title: "Notes model",
		description: "Short blurb.",
		notes: "## Overview\n\nLonger context.",
		components: [],
	});
	expect(res.status).toBe(201);
	const body = (await res.json()) as {
		graph: { description?: string; notes?: string };
	};
	expect(body.graph.description).toBe("Short blurb.");
	expect(body.graph.notes).toBe("## Overview\n\nLonger context.");
});

test("POST /api/subsystem-model rejects a description over 200 characters", async () => {
	const res = await create({
		title: "Notes cap",
		description: "x".repeat(201),
		components: [],
	});
	expect(res.status).toBe(400);
	const body = (await res.json()) as { error?: string };
	expect(body.error).toContain("200");
});

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleSubsystemModelRequest } from "./http-server";

const noop = async () => ({ ok: true });

let home: string;
const previous = process.env["PRINCIPAL_SUBSYSTEM_MODELS_HOME"];

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "subsystem-model-pr-http-"));
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

function handle(req: Request): Promise<Response | null> {
	return handleSubsystemModelRequest(req, noop, noop, noop);
}

function create(body: Record<string, unknown>): Promise<Response | null> {
	return handle(
		request("/api/subsystem-model", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
}

async function graphId(res: Response | null): Promise<string> {
	expect(res).not.toBeNull();
	const body = (await res!.json()) as { graph?: { id: string } };
	expect(body.graph?.id).toBeTruthy();
	return body.graph!.id;
}

describe("HTTP pull-request associations", () => {
	test("create accepts a single pullRequest and GET returns it", async () => {
		const created = await create({
			title: "PR model",
			components: [],
			pullRequest: { owner: "a", repo: "b", number: 7, title: "Add it" },
		});
		expect(created?.status).toBe(201);
		const id = await graphId(created);

		const listed = await handle(
			request(`/api/subsystem-model/${id}/pull-requests`),
		);
		expect(listed?.status).toBe(200);
		const body = (await listed!.json()) as {
			pullRequests: Array<{ owner: string; number: number }>;
		};
		expect(body.pullRequests).toEqual([
			expect.objectContaining({ owner: "a", number: 7 }),
		]);
	});

	test("POST adds and DELETE removes by owner/repo#number", async () => {
		const id = await graphId(
			await create({ title: "PR link", components: [] }),
		);

		const added = await handle(
			request(`/api/subsystem-model/${id}/pull-requests`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					pullRequests: [
						{ owner: "a", repo: "b", number: 1 },
						{ owner: "a", repo: "b", number: 2 },
					],
				}),
			}),
		);
		expect(added?.status).toBe(200);

		const removed = await handle(
			request(`/api/subsystem-model/${id}/pull-requests`, {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					pullRequests: [{ owner: "a", repo: "b", number: 1 }],
				}),
			}),
		);
		expect(removed?.status).toBe(200);
		const body = (await removed!.json()) as {
			graph: { pullRequests: Array<{ number: number }> };
		};
		expect(body.graph.pullRequests.map((ref) => ref.number)).toEqual([2]);
	});
});

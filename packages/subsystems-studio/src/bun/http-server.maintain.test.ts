import { describe, expect, test } from "bun:test";
import {
	handleSubsystemModelRequest,
	type MaintainHttpHandlers,
} from "./http-server";

const noopOpen = async () => ({ ok: true });
const noopDelete = async () => ({ ok: true });
const noopShowcase = async () => ({ ok: true });

function request(path: string, init?: RequestInit): Request {
	return new Request(`http://127.0.0.1:3045${path}`, init);
}

describe("maintain HTTP routes", () => {
	test("GET /maintain/plan returns the host plan", async () => {
		let asked = "";
		const maintain: MaintainHttpHandlers = {
			plan: async (graphId) => {
				asked = graphId;
				return {
					ok: true,
					graphId,
					title: "Model",
					verdict: "issues",
					route: {
						agent: "construct-fixer",
						layer: "construct",
						mode: "issues",
					},
					pendingCount: 2,
					pendingProposals: [],
					autoAccept: { enabled: false, confidenceThreshold: 0 },
				};
			},
			start: async () => ({ ok: true, started: true }),
			isRunning: () => false,
		};

		const res = await handleSubsystemModelRequest(
			request("/api/subsystem-model/sg-1/maintain/plan"),
			noopOpen,
			noopDelete,
			noopShowcase,
			maintain,
		);

		expect(res.status).toBe(200);
		expect(asked).toBe("sg-1");
		const body = (await res.json()) as { route?: { agent?: string } };
		expect(body.route?.agent).toBe("construct-fixer");
	});

	test("POST /maintain forwards the model override and returns 202", async () => {
		let seenModel: string | undefined;
		const maintain: MaintainHttpHandlers = {
			plan: async (graphId) => ({
				ok: true,
				graphId,
				route: null,
				pendingCount: 0,
				pendingProposals: [],
				autoAccept: { enabled: false, confidenceThreshold: 0 },
			}),
			start: async (_graphId, opts) => {
				seenModel = opts.model;
				return { ok: true, started: true, model: opts.model };
			},
			isRunning: () => false,
		};

		const res = await handleSubsystemModelRequest(
			request("/api/subsystem-model/sg-1/maintain", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ model: "provider/model" }),
			}),
			noopOpen,
			noopDelete,
			noopShowcase,
			maintain,
		);

		expect(res.status).toBe(202);
		expect(seenModel).toBe("provider/model");
	});

	test("maintain routes return 503 when the host did not wire a runner", async () => {
		const res = await handleSubsystemModelRequest(
			request("/api/subsystem-model/sg-1/maintain/plan"),
			noopOpen,
			noopDelete,
			noopShowcase,
		);
		expect(res.status).toBe(503);
	});
});

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	deleteSubsystemModelRuns,
	listSubsystemModelRuns,
	noteSubsystemModelRunFinish,
	noteSubsystemModelRunStart,
} from "./subsystem-model-runs";

let root: string;

beforeEach(async () => {
	root = await fs.mkdtemp(join(tmpdir(), "subsystem-model-runs-"));
});

afterEach(async () => {
	await fs.rm(root, { recursive: true, force: true });
});

describe("subsystem-model-runs", () => {
	test("start then finish updates the same entry (sessionId -> graphId pair)", async () => {
		const run = await noteSubsystemModelRunStart({
			root,
			graphId: "sg-1",
			graphTitle: "Auth flow",
			sessionId: "ses_abc",
			agent: "construct-verifier",
			model: "opencode-go/x",
		});
		expect(run.status).toBe("running");

		await noteSubsystemModelRunFinish({
			root,
			graphId: "sg-1",
			runId: run.id,
			sessionId: "ses_abc",
			status: "done",
			ok: true,
			summary: "2 proposals",
			verdict: "partially_verified",
			endedAt: "2026-01-01T00:00:05.000Z",
		});

		const runs = await listSubsystemModelRuns({ graphId: "sg-1", root });
		expect(runs).toHaveLength(1);
		expect(runs[0]).toMatchObject({
			id: run.id,
			graphId: "sg-1",
			graphTitle: "Auth flow",
			sessionId: "ses_abc",
			status: "done",
			ok: true,
			summary: "2 proposals",
			verdict: "partially_verified",
			endedAt: "2026-01-01T00:00:05.000Z",
		});
	});

	test("finish without a prior start appends a finished entry (skipped / pre-session failure)", async () => {
		await noteSubsystemModelRunFinish({
			root,
			graphId: "sg-2",
			graphTitle: "Billing",
			status: "skipped",
			verdict: "fully_verified",
			summary: "Fully verified — nothing for Maintain to propose",
		});
		const runs = await listSubsystemModelRuns({ graphId: "sg-2", root });
		expect(runs).toHaveLength(1);
		expect(runs[0]).toMatchObject({
			graphId: "sg-2",
			status: "skipped",
			verdict: "fully_verified",
		});
		expect(runs[0].sessionId).toBeUndefined();
	});

	test("start records commitsAtStart and a later finish preserves it", async () => {
		const run = await noteSubsystemModelRunStart({
			root,
			graphId: "sg-c",
			sessionId: "ses_c",
			commitsAtStart: { "pkg:github/acme/widget": "abc123" },
		});
		await noteSubsystemModelRunFinish({
			root,
			graphId: "sg-c",
			runId: run.id,
			status: "done",
			ok: true,
		});
		const runs = await listSubsystemModelRuns({ graphId: "sg-c", root });
		expect(runs).toHaveLength(1);
		expect(runs[0].commitsAtStart).toEqual({
			"pkg:github/acme/widget": "abc123",
		});
	});

	test("finish that creates the entry carries commitsAtStart (skipped run)", async () => {
		await noteSubsystemModelRunFinish({
			root,
			graphId: "sg-c2",
			status: "skipped",
			commitsAtStart: { "pkg:github/acme/widget": "def456" },
		});
		const runs = await listSubsystemModelRuns({ graphId: "sg-c2", root });
		expect(runs[0].commitsAtStart).toEqual({
			"pkg:github/acme/widget": "def456",
		});
	});

	test("match by sessionId when the run id is not carried through", async () => {
		await noteSubsystemModelRunStart({
			root,
			graphId: "sg-3",
			sessionId: "ses_xyz",
		});
		await noteSubsystemModelRunFinish({
			root,
			graphId: "sg-3",
			sessionId: "ses_xyz",
			status: "error",
			ok: false,
			error: "boom",
		});
		const runs = await listSubsystemModelRuns({ graphId: "sg-3", root });
		expect(runs).toHaveLength(1);
		expect(runs[0].status).toBe("error");
		expect(runs[0].error).toBe("boom");
	});

	test("lists every model's runs newest-first when no graphId is given", async () => {
		await noteSubsystemModelRunFinish({
			root,
			graphId: "sg-a",
			status: "skipped",
			startedAt: "2026-01-01T00:00:00.000Z",
		});
		await noteSubsystemModelRunFinish({
			root,
			graphId: "sg-b",
			status: "skipped",
			startedAt: "2026-02-01T00:00:00.000Z",
		});
		const runs = await listSubsystemModelRuns({ root });
		expect(runs.map((r) => r.graphId)).toEqual(["sg-b", "sg-a"]);
	});

	test("days filter drops older runs", async () => {
		await noteSubsystemModelRunFinish({
			root,
			graphId: "sg-old",
			status: "skipped",
			startedAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
			endedAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
		});
		await noteSubsystemModelRunFinish({
			root,
			graphId: "sg-new",
			status: "skipped",
			startedAt: new Date().toISOString(),
		});
		const runs = await listSubsystemModelRuns({ days: 2, root });
		expect(runs.map((r) => r.graphId)).toEqual(["sg-new"]);
	});

	test("delete removes the model's log", async () => {
		await noteSubsystemModelRunFinish({ root, graphId: "sg-del", status: "skipped" });
		await deleteSubsystemModelRuns("sg-del", root);
		expect(await listSubsystemModelRuns({ graphId: "sg-del", root })).toEqual([]);
	});
});

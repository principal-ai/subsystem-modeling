import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	SubsystemMaintenanceOutcome,
	SubsystemMaintenanceSnapshot,
	SubsystemMaintenanceStage,
} from "../shared/contract";
import {
	createMaintenanceRunStore,
	recordMaintenanceSequence,
	unreportedProposalCounts,
} from "./subsystem-maintenance-runs";
import { readMaintenanceSnapshot } from "./maintenance-status";
import type { StoredSubsystemModel } from "./subsystem-model-store";

let root: string;
let time: string;
let store: ReturnType<typeof createMaintenanceRunStore>;
const startTime = "2026-10-26T10:00:00.000Z";
const commitMap = { "pkg:github/acme/example": "abc123" };
const graph: StoredSubsystemModel = {
	id: "sg-1", title: "Example", components: [],
	createdAt: startTime, updatedAt: startTime,
	verifiedAtCommits: { "pkg:github/acme/example": "older-verified" },
};

function stage(runId: string, status: SubsystemMaintenanceStage["status"] = "running"): SubsystemMaintenanceStage {
	return {
		runId, agent: "trail-verifier", layer: "trail",
		sessionId: null, status, startedAt: startTime,
		endedAt: status === "running" ? null : "2026-10-26T10:00:30.000Z",
		commitsAtStart: commitMap, counts: unreportedProposalCounts(),
		summary: null, error: null,
	};
}

beforeEach(async () => {
	root = await fs.mkdtemp(join(tmpdir(), "maintenance-run-"));
	time = startTime;
	store = createMaintenanceRunStore({ root, owner: "host-a", now: () => time });
});

afterEach(async () => {
	await fs.rm(root, { recursive: true, force: true });
});

describe("durable maintenance attempts", () => {
	test("stable parent and agent identity, own provenance, ordered history and durable outcome", async () => {
		const first = await store.start({ graphId: graph.id, title: graph.title });
		const id = first.sequence.id;
		await store.context(graph.id, id, { title: graph.title, commitsAtStart: commitMap });
		await store.stage(graph.id, id, stage("agent-1"));
		await store.stage(graph.id, id, { ...stage("agent-1"), sessionId: "ses_1" });
		await store.stage(graph.id, id, { ...stage("agent-1", "done"), sessionId: "ses_1" });
		expect((await store.latest(graph.id))?.sequence.status).toBe("running");
		await store.stage(graph.id, id, {
			...stage("agent-2"), commitsAtStart: { "pkg:github/acme/example": "def456" },
		});
		await store.stage(graph.id, id, {
			...stage("agent-2", "done"), commitsAtStart: { "pkg:github/acme/example": "def456" },
		});
		time = "2026-10-26T10:01:00.000Z";
		await store.finish(graph.id, id, { outcome: "converged", summary: "Maintenance finished" });

		const reopened = createMaintenanceRunStore({ root, owner: "host-b", now: () => time });
		const saved = await reopened.latest(graph.id);
		expect(saved?.sequence).toEqual({
			id, status: "finished", outcome: "converged", startedAt: startTime, endedAt: time,
		});
		expect(saved?.stages.map((s) => s.runId)).toEqual(["agent-1", "agent-2"]);
		expect(saved?.stages[0]?.sessionId).toBe("ses_1");
		expect(saved?.stages[1]?.agent).toBe("trail-verifier");
		expect(saved?.stages[1]?.commitsAtStart).toEqual({ "pkg:github/acme/example": "def456" });
		expect(saved?.commitsAtStart).toEqual(commitMap);
		expect(saved?.verification).toBeNull();
		expect(saved?.verifiedAtCommits).toBeNull();
		expect(saved?.counts.proposalsCreated).toBeNull();
		expect(await fs.readdir(root)).toEqual(["sg-1.json"]);
	});

	test("separate attempts at the same commits have different execution ids", async () => {
		const first = await store.start({ graphId: graph.id, title: graph.title });
		await store.context(graph.id, first.sequence.id, { title: graph.title, commitsAtStart: commitMap });
		await store.finish(graph.id, first.sequence.id, { outcome: "stalled" });
		const second = await store.start({ graphId: graph.id, title: graph.title });
		await store.context(graph.id, second.sequence.id, { title: graph.title, commitsAtStart: commitMap });
		expect(second.sequence.id).not.toBe(first.sequence.id);
		expect((await store.latest(graph.id))?.commitsAtStart).toEqual(commitMap);
		expect(JSON.parse(await fs.readFile(join(root, "sg-1.json"), "utf8")).runs).toHaveLength(2);
	});

	test("reads change observedAt, not revision or updatedAt", async () => {
		const first = await store.start({ graphId: graph.id, title: graph.title });
		time = "2026-10-26T10:00:05.000Z";
		const next = await store.latest(graph.id);
		expect(next?.observedAt).toBe(time);
		expect(next?.updatedAt).toBe(first.updatedAt);
		expect(next?.revision).toBe(first.revision);
		time = "2026-10-26T10:00:10.000Z";
		await store.stage(graph.id, first.sequence.id, stage("agent-1"));
		expect((await store.latest(graph.id))?.updatedAt).toBe(time);
		expect((await store.latest(graph.id))?.revision).toBe(first.revision + 1);
		await store.stage(graph.id, first.sequence.id, stage("agent-1"));
		expect((await store.latest(graph.id))?.revision).toBe(first.revision + 1);
	});

	test("restart marks the parent unknown, never inferring an outcome from its agent", async () => {
		const first = await store.start({ graphId: graph.id, title: graph.title });
		await store.stage(graph.id, first.sequence.id, stage("agent-1"));
		const before = await store.latest(graph.id);
		time = "2026-10-26T10:01:00.000Z";
		const restarted = createMaintenanceRunStore({ root, owner: "host-b", now: () => time });
		const recovered = await restarted.latest(graph.id);
		expect(recovered?.sequence).toMatchObject({
			id: first.sequence.id, status: "unknown", outcome: null, endedAt: null,
		});
		expect(recovered?.stages[0]?.status).toBe("running");
		expect(recovered?.blocker).toContain("Agent sessions may still exist");
		expect(recovered?.revision).toBe((before?.revision ?? 0) + 1);
		expect((await restarted.latest(graph.id))?.revision).toBe(recovered?.revision);
		await expect(restarted.finish(graph.id, first.sequence.id, { outcome: "converged" })).rejects.toThrow("interrupted");
		const file = JSON.parse(await fs.readFile(join(root, "sg-1.json"), "utf8"));
		expect(file.runs[0].snapshot.sequence.status).toBe("unknown");
	});

	for (const outcome of ["converged", "needs_unblock", "stalled", "cap", "error"] satisfies SubsystemMaintenanceOutcome[]) {
		test(`preserves ${outcome} across restart, with an idempotent terminal write`, async () => {
			const started = await store.start({ graphId: graph.id, title: graph.title });
			const done = await store.finish(graph.id, started.sequence.id, { outcome });
			time = "2026-10-26T10:02:00.000Z";
			await store.finish(graph.id, started.sequence.id, { outcome });
			const reopened = createMaintenanceRunStore({ root, owner: "host-b" });
			const saved = await reopened.latest(graph.id);
			expect(saved?.sequence).toEqual(done?.sequence);
			expect(saved?.revision).toBe(done?.revision);
		});
	}

	test("concurrent stage updates do not lose history; callers cannot mutate saved objects", async () => {
		const started = await store.start({ graphId: graph.id, title: graph.title });
		await Promise.all(Array.from({ length: 12 }, (_, n) =>
			store.stage(graph.id, started.sequence.id, stage(`agent-${n}`, "done")),
		));
		const result = await store.latest(graph.id);
		expect(result?.stages.map((s) => s.runId)).toEqual(Array.from({ length: 12 }, (_, n) => `agent-${n}`));
		if (!result) throw new Error("Expected snapshot");
		result.stages.length = 0;
		expect((await store.latest(graph.id))?.stages).toHaveLength(12);
	});

	test("rejects overlapping attempts, active-stage convergence and backwards stage updates", async () => {
		const started = await store.start({ graphId: graph.id, title: graph.title });
		await expect(store.start({ graphId: graph.id, title: graph.title })).rejects.toThrow("already running");
		await store.stage(graph.id, started.sequence.id, stage("agent-1"));
		await expect(store.finish(graph.id, started.sequence.id, { outcome: "converged" })).rejects.toThrow("still active");
		await store.stage(graph.id, started.sequence.id, stage("agent-1", "done"));
		await expect(store.stage(graph.id, started.sequence.id, stage("agent-1"))).rejects.toThrow("completed");
	});

	test("corrupt history fails explicitly and is never replaced with an empty record", async () => {
		const path = join(root, "sg-1.json");
		await fs.writeFile(path, "{broken");
		await expect(store.latest(graph.id)).rejects.toThrow();
		await expect(store.start({ graphId: graph.id, title: graph.title })).rejects.toThrow();
		expect(await fs.readFile(path, "utf8")).toBe("{broken");
	});

	test("failed atomic replacement preserves the previous complete record", async () => {
		const run = await store.start({ graphId: graph.id, title: graph.title });
		const path = join(root, "sg-1.json");
		const before = await fs.readFile(path, "utf8");
		const rename = spyOn(fs, "rename").mockRejectedValueOnce(new Error("Disk unavailable"));
		try {
			await expect(store.stage(graph.id, run.sequence.id, stage("agent-1"))).rejects.toThrow("Disk unavailable");
		} finally {
			rename.mockRestore();
		}
		expect(await fs.readFile(path, "utf8")).toBe(before);
		expect(await fs.readdir(root)).toEqual(["sg-1.json"]);
		await store.stage(graph.id, run.sequence.id, stage("agent-1"));
		expect((await store.latest(graph.id))?.stages).toHaveLength(1);
	});

	test("does not steal a running attempt from another live process", async () => {
		const run = await store.start({ graphId: graph.id, title: graph.title });
		const path = join(root, "sg-1.json");
		const file = JSON.parse(await fs.readFile(path, "utf8"));
		file.runs[0].pid = process.ppid;
		await fs.writeFile(path, JSON.stringify(file));
		const other = createMaintenanceRunStore({ root, owner: "another-host" });
		expect((await other.latest(graph.id))?.sequence.status).toBe("running");
		await expect(other.start({ graphId: graph.id, title: graph.title })).rejects.toThrow("already running");
		await expect(other.stage(graph.id, run.sequence.id, stage("unowned"))).rejects.toThrow("another Studio host");
		await expect(other.evidence(graph.id, run.sequence.id, {
			counts: null, verification: null, verifiedAtCommits: null,
		})).rejects.toThrow("another Studio host");
	});

	test("a real process restart recovers an interrupted attempt and retains a completed outcome", async () => {
		const module = join(import.meta.dir, "subsystem-maintenance-runs.ts");
		async function child(script: string) {
			const proc = Bun.spawn({
				cmd: [process.execPath, "--no-env-file", "--eval", `
					import { maintenanceRuns } from ${JSON.stringify(module)};
					${script}
				`],
				env: { ...process.env, PRINCIPAL_SUBSYSTEM_MODELS_HOME: root },
				stdout: "pipe", stderr: "pipe",
			});
			const [stdout, stderr, code] = await Promise.all([
				new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited,
			]);
			expect(code).toBe(0);
			expect(stderr).toBe("");
			return JSON.parse(stdout);
		}
		const created = await child(`
			const interrupted = await maintenanceRuns.start({graphId:"sg-interrupted",title:"Interrupted"});
			const completed = await maintenanceRuns.start({graphId:"sg-completed",title:"Completed"});
			await maintenanceRuns.finish("sg-completed", completed.sequence.id, {outcome:"cap"});
			console.log(JSON.stringify({interrupted:interrupted.sequence.id,completed:completed.sequence.id}));
		`);
		const reopened = await child(`
			console.log(JSON.stringify({
				interrupted:await maintenanceRuns.latest("sg-interrupted"),
				completed:await maintenanceRuns.latest("sg-completed")
			}));
		`);
		expect(reopened.interrupted.sequence).toMatchObject({ id: created.interrupted, status: "unknown", outcome: null, endedAt: null });
		expect(reopened.completed.sequence).toMatchObject({ id: created.completed, status: "finished", outcome: "cap" });
	});

	test("retains a bounded complete attempt history", async () => {
		for (let n = 0; n < 23; n++) {
			const run = await store.start({ graphId: graph.id, title: graph.title });
			await store.stage(graph.id, run.sequence.id, stage(`agent-${n}`, "done"));
			await store.finish(graph.id, run.sequence.id, { outcome: "converged" });
		}
		const file = JSON.parse(await fs.readFile(join(root, "sg-1.json"), "utf8"));
		expect(file.runs).toHaveLength(20);
		expect(file.runs[0].snapshot.stages[0].runId).toBe("agent-22");
		expect(file.runs[19].snapshot.stages[0].runId).toBe("agent-3");
	});
});

describe("recorded sequence orchestration", () => {
	test("records all attempts, including a failed fallback, without finishing at a stage boundary", async () => {
		const result = await recordMaintenanceSequence({
			graphId: graph.id, store,
			execute: async (recorder) => {
				const persisted = await store.latest(graph.id);
				expect(persisted?.sequence.id).toBe(recorder.id);
				await recorder.context({ title: graph.title, commitsAtStart: commitMap });
				await recorder.stage(stage("fallback-1", "error"));
				expect((await store.latest(graph.id))?.sequence.status).toBe("running");
				await recorder.stage(stage("fallback-2", "done"));
				return { outcome: "needs_unblock" as const, stages: [{ summary: "Review required" }], blockedAt: { agent: "trail-verifier" } };
			},
		});
		expect((await store.latest(graph.id))?.sequence).toMatchObject({
			id: result.maintenanceRunId, status: "finished", outcome: "needs_unblock",
		});
		expect((await store.latest(graph.id))?.stages.map((s) => s.status)).toEqual(["error", "done"]);
	});

	test("uses a pre-created parent instead of minting another id", async () => {
		const started = await store.start({ graphId: graph.id, title: graph.title });
		const result = await recordMaintenanceSequence({
			graphId: graph.id, store, runId: started.sequence.id,
			execute: async () => ({ outcome: "converged" as const, stages: [] }),
		});
		expect(result.maintenanceRunId).toBe(started.sequence.id);
		expect(JSON.parse(await fs.readFile(join(root, "sg-1.json"), "utf8")).runs).toHaveLength(1);
	});

	test("thrown preamble errors are persisted without fabricating an agent", async () => {
		await expect(recordMaintenanceSequence({
			graphId: graph.id, store,
			execute: async () => { throw new Error("Preamble failed"); },
		})).rejects.toThrow("Preamble failed");
		const saved = await store.latest(graph.id);
		expect(saved?.sequence).toMatchObject({ status: "finished", outcome: "error" });
		expect(saved?.summary).toBe("Preamble failed");
		expect(saved?.stages).toEqual([]);
	});

	test("does not execute maintenance when parent persistence fails", async () => {
		const blocked = join(root, "blocked");
		await fs.writeFile(blocked, "not a directory");
		let ran = false;
		await expect(recordMaintenanceSequence({
			graphId: graph.id, store: createMaintenanceRunStore({ root: blocked }),
			execute: async () => { ran = true; return { outcome: "converged" as const, stages: [] }; },
		})).rejects.toThrow();
		expect(ran).toBe(false);
	});
});

describe("snapshot evidence", () => {
	test("unreported history stays absent, rather than reconstructing a parent from legacy runs", async () => {
		let read = false;
		expect(await readMaintenanceSnapshot(graph, {
			store, readCounts: async () => { read = true; return {}; },
		})).toBeNull();
		expect(read).toBe(false);
	});

	test("uses each run's own counts and independent audit, keeping observation-only reads stable", async () => {
		const run = await store.start({ graphId: graph.id, title: graph.title });
		await store.context(graph.id, run.sequence.id, { title: graph.title, commitsAtStart: commitMap });
		await store.stage(graph.id, run.sequence.id, stage("agent-1", "done"));
		await store.stage(graph.id, run.sequence.id, stage("agent-2", "done"));
		const verification: NonNullable<SubsystemMaintenanceSnapshot["verification"]> = {
			checkedAt: startTime, stale: true,
			lanes: { construct: "partial", "static-topology": "verified", "dynamic-topology": "none", trail: "issues" },
		};
		const opts = {
			store,
			readCounts: async () => ({
				"agent-1": { proposalsCreated: 2, proposalsApplied: 2, proposalsPending: 0 },
				"agent-2": { proposalsCreated: 3, proposalsApplied: 0, proposalsPending: 3 },
			}),
			readVerification: async () => verification,
		};
		const first = await readMaintenanceSnapshot(graph, opts);
		expect(first?.stages.map((s) => s.counts.proposalsCreated)).toEqual([2, 3]);
		expect(first?.counts).toEqual({ proposalsCreated: 5, proposalsApplied: 2, proposalsPending: 3, stagesFinished: 2 });
		expect(first?.verification).toEqual(verification);
		expect(first?.verifiedAtCommits).toEqual(graph.verifiedAtCommits);
		expect(first?.commitsAtStart).toEqual(commitMap);
		time = "2026-10-26T10:02:00.000Z";
		const second = await readMaintenanceSnapshot(graph, opts);
		expect(second?.revision).toBe(first?.revision);
		expect(second?.updatedAt).toBe(first?.updatedAt);
		expect(second?.observedAt).toBe(time);
		const unavailable = await readMaintenanceSnapshot(graph, {
			...opts, readCounts: async () => null, readVerification: async () => null,
		});
		expect(unavailable?.counts.proposalsCreated).toBeNull();
		expect(unavailable?.stages[0]?.counts.proposalsPending).toBeNull();
		expect(unavailable?.verification).toBeNull();
	});

	test("does not attach old evidence to a replacement attempt", async () => {
		const run = await store.start({ graphId: graph.id, title: graph.title });
		await store.stage(graph.id, run.sequence.id, stage("old-agent", "done"));
		let reads = 0;
		const snapshot = await readMaintenanceSnapshot(graph, {
			store,
			readVerification: async () => null,
			readCounts: async (_graphId, ids) => {
				reads++;
				if (reads === 1) {
					await store.finish(graph.id, run.sequence.id, { outcome: "converged" });
					const replacement = await store.start({ graphId: graph.id, title: graph.title });
					await store.stage(graph.id, replacement.sequence.id, stage("new-agent"));
				}
				return Object.fromEntries(ids.map((id) => [id, { proposalsCreated: 1, proposalsApplied: 0, proposalsPending: 1 }]));
			},
		});
		expect(reads).toBe(2);
		expect(snapshot?.sequence.id).not.toBe(run.sequence.id);
		expect(snapshot?.stages.map((s) => s.runId)).toEqual(["new-agent"]);
		expect(snapshot?.counts.proposalsCreated).toBe(1);
	});

	test("rejects delayed evidence from an earlier semantic revision", async () => {
		const run = await store.start({ graphId: graph.id, title: graph.title });
		await store.stage(graph.id, run.sequence.id, stage("agent-1"));
		const before = await store.latest(graph.id);
		await store.stage(graph.id, run.sequence.id, stage("agent-1", "done"));
		const result = await store.evidence(graph.id, run.sequence.id, {
			counts: null, verification: null, verifiedAtCommits: null,
			expectedRevision: before?.revision,
		});
		expect(result).toBeNull();
		expect((await store.latest(graph.id))?.stages[0]?.status).toBe("done");
	});

	test("an exited local orchestration is unknown even if its final persistence failed", async () => {
		const run = await store.start({ graphId: graph.id, title: graph.title });
		await store.stage(graph.id, run.sequence.id, stage("agent-1", "done"));
		const snapshot = await readMaintenanceSnapshot(graph, {
			store, isRunning: () => false, readCounts: async () => null, readVerification: async () => null,
		});
		expect(snapshot?.sequence.status).toBe("unknown");
		expect(snapshot?.sequence.outcome).toBeNull();
		expect(snapshot?.blocker).toContain("no longer tracks");
	});
});

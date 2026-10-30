import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	SubsystemMaintenanceSnapshot,
	SubsystemMaintenanceStage,
	SubsystemModelAuditReport,
	SubsystemModelProposal,
	SubsystemModelRun,
} from "../shared/contract";
import { handleSubsystemModelRequest, type MaintainHttpHandlers } from "./http-server";
import { upsertSubsystemModel, type StoredSubsystemModel } from "./subsystem-model-store";
import { maintenanceRuns, createMaintenanceRunStore, unreportedProposalCounts } from "./subsystem-maintenance-runs";
import { noteSubsystemModelRunFinish } from "./subsystem-model-runs";
import { proposalCountsForRuns } from "./proposal-store";
import { buildAuditFingerprint, saveSubsystemModelAudit } from "./audit-report-store";
import { assessSubsystemGraphifyReadiness } from "./graphify-store";
import { createOutcomeDelivery } from "./maintenance-outcome-delivery";

let home: string;
let graph: StoredSubsystemModel;
const previousHome = process.env["PRINCIPAL_SUBSYSTEM_MODELS_HOME"];
const timestamp = "2026-10-26T10:00:00.000Z";
const noop = async () => ({ ok: true });
const maintain: MaintainHttpHandlers = {
	isRunning: () => false,
	start: async () => ({ ok: true, started: true, maintenanceRunId: "pre-created-parent" }),
	plan: async (graphId) => ({
		ok: true, graphId, route: null, pendingCount: 0, pendingProposals: [],
		autoAccept: { enabled: false, confidenceThreshold: 0 },
	}),
};

function stage(runId: string): SubsystemMaintenanceStage {
	return {
		runId, sessionId: `session-${runId}`, agent: "trail-verifier", layer: "trail",
		startedAt: timestamp, endedAt: timestamp, status: "done",
		commitsAtStart: { "pkg:github/acme/example": "abc123" },
		counts: unreportedProposalCounts(), summary: null, error: null,
	};
}

function proposal(id: string, status: SubsystemModelProposal["status"], runId?: string): SubsystemModelProposal {
	return {
		id, graphId: graph.id, runId, status, createdAt: timestamp,
		lane: "trail", rationale: "Example", changes: [], preview: [],
	};
}

async function seedProposals(proposals: SubsystemModelProposal[]) {
	const root = join(home, ".principal", "subsystem-model-proposals");
	await fs.mkdir(root, { recursive: true });
	await fs.writeFile(join(root, `${graph.id}.json`), JSON.stringify({ version: 1, graphId: graph.id, proposals }));
}

function audit(): SubsystemModelAuditReport {
	return {
		graphId: graph.id, title: graph.title, checkedAt: timestamp, needsUpdate: false,
		checks: [], findings: [], boundaryChecks: [],
		summary: {
			components: 0, filesVerified: 0, symbolsVerified: 0, declarationsFresh: 0,
			constructsMatched: 0, signaturesMatched: 0, anchorsExact: 0, graphifyConfirmed: 0,
			externalsSkipped: 0, missingFiles: 0, missingSymbols: 0, trailFailures: 0,
			stepsUnconfirmed: 0, stepsStale: 0, stepsVerified: 0, staleDeclarations: 0,
			constructMismatches: 0, signatureMismatches: 0, weakAnchors: 0, unresolved: 0,
			ok: 0, modulesClaimed: 0, moduleFileOk: 0, moduleFileMismatch: 0,
			processNestsChecked: 0, processNestOk: 0, processNestDisagree: 0,
			processRequired: 0, processClaimed: 0, processMissing: 0,
		},
	};
}

async function status(id = graph.id) {
	return handleSubsystemModelRequest(
		new Request(`http://127.0.0.1:3045/api/subsystem-model/${id}/maintain/status`),
		noop, noop, noop, maintain,
	);
}

interface StatusBody {
	ok: boolean;
	graphId: string;
	running: boolean;
	runs: SubsystemModelRun[];
	snapshot: SubsystemMaintenanceSnapshot | null;
	delivery: Awaited<ReturnType<typeof maintenanceRuns.deliveryStatus>>;
}

beforeEach(async () => {
	home = await fs.mkdtemp(join(tmpdir(), "maintenance-status-http-"));
	process.env["PRINCIPAL_SUBSYSTEM_MODELS_HOME"] = home;
	graph = (await upsertSubsystemModel({ title: "Status example", components: [] }, { force: true })).record;
});

afterEach(async () => {
	if (previousHome === undefined) delete process.env["PRINCIPAL_SUBSYSTEM_MODELS_HOME"];
	else process.env["PRINCIPAL_SUBSYSTEM_MODELS_HOME"] = previousHome;
	await fs.rm(home, { recursive: true, force: true });
});

describe("maintenance status snapshot HTTP contract", () => {
	test("legacy agent history is returned without inventing a parent", async () => {
		await noteSubsystemModelRunFinish({ graphId: graph.id, runId: "legacy-agent", status: "done" });
		const response = await status();
		expect(response.status).toBe(200);
		const body = await response.json() as StatusBody;
		expect(body.ok).toBe(true);
		expect(body.running).toBe(false);
		expect(body.runs[0]?.id).toBe("legacy-agent");
		expect(body.snapshot).toBeNull();
		expect(body.delivery).toEqual({ latest: null, pending: 0, failed: 0 });
	});

	test("reports delivery diagnostics without the signing secret, endpoint or event body", async () => {
		const configured = createMaintenanceRunStore({
			root: join(home, ".principal", "subsystem-maintenance-runs"),
			delivery: (snapshot) => createOutcomeDelivery(snapshot, {
				PRINCIPAL_MAINTENANCE_WEBHOOK_URL: "http://127.0.0.1:3001/api/events/triggers/test",
				PRINCIPAL_MAINTENANCE_WEBHOOK_SECRET: Buffer.alloc(32, 7).toString("base64"),
			}),
		});
		const run = await configured.start({ graphId: graph.id, title: graph.title });
		await configured.finish(graph.id, run.sequence.id, { outcome: "stalled" });
		const response = await status();
		expect(response.status).toBe(200);
		const body = await response.json() as StatusBody;
		expect(body.delivery).toMatchObject({ pending: 1, failed: 0, latest: {
			eventId: `studio-maintenance-${run.sequence.id}`, status: "pending", attempts: 0,
		} });
		expect(body.delivery.latest).not.toHaveProperty("body");
		expect(body.delivery.latest).not.toHaveProperty("destinationHash");
	});

	test("joins only the parent attempt's proposals, including accepted and rejected records", async () => {
		const run = await maintenanceRuns.start({ graphId: graph.id, title: graph.title });
		await maintenanceRuns.context(graph.id, run.sequence.id, {
			title: graph.title, commitsAtStart: { "pkg:github/acme/example": "parent-commit" },
		});
		await maintenanceRuns.stage(graph.id, run.sequence.id, stage("a"));
		await maintenanceRuns.stage(graph.id, run.sequence.id, stage("b"));
		await maintenanceRuns.finish(graph.id, run.sequence.id, { outcome: "needs_unblock" });
		await seedProposals([
			proposal("p1", "accepted", "a"), proposal("p2", "accepted", "a"),
			proposal("p3", "pending", "a"), proposal("p4", "rejected", "a"),
			proposal("p5", "pending", "b"), proposal("p6", "pending", "b"),
			proposal("unrelated", "pending", "unrelated-run"), proposal("untagged", "pending"),
		]);

		const body = await (await status()).json() as StatusBody;
		expect(body.snapshot?.sequence).toMatchObject({ id: run.sequence.id, status: "finished", outcome: "needs_unblock" });
		expect(body.snapshot?.stages.map((s) => s.counts)).toEqual([
			{ proposalsCreated: 4, proposalsApplied: 2, proposalsPending: 1 },
			{ proposalsCreated: 2, proposalsApplied: 0, proposalsPending: 2 },
		]);
		expect(body.snapshot?.counts).toEqual({ proposalsCreated: 6, proposalsApplied: 2, proposalsPending: 3, stagesFinished: 2 });
		expect(body.snapshot?.commitsAtStart).toEqual({ "pkg:github/acme/example": "parent-commit" });
		expect(body.snapshot?.stages[0]?.commitsAtStart).toEqual({ "pkg:github/acme/example": "abc123" });
		expect(body.snapshot?.verification).toBeNull();
		expect(body.snapshot?.verifiedAtCommits).toBeNull();
		const unchanged = await (await status()).json() as StatusBody;
		expect(unchanged.snapshot?.revision).toBe(body.snapshot?.revision);
		expect(unchanged.snapshot?.updatedAt).toBe(body.snapshot?.updatedAt);

		await seedProposals([
			proposal("p1", "accepted", "a"), proposal("p2", "accepted", "a"),
			proposal("p3", "accepted", "a"), proposal("p4", "rejected", "a"),
			proposal("p5", "accepted", "b"), proposal("p6", "accepted", "b"),
		]);
		const resolved = await (await status()).json() as StatusBody;
		expect(resolved.snapshot?.stages[0]?.counts.proposalsPending).toBe(0);
		expect(resolved.snapshot?.sequence.outcome).toBe("needs_unblock");
		expect(resolved.snapshot?.counts.proposalsCreated).toBe(6);
		expect(resolved.snapshot?.revision).toBeGreaterThan(body.snapshot?.revision ?? 0);
	});

	test("freshness and lanes come from the saved audit, not convergence", async () => {
		const run = await maintenanceRuns.start({ graphId: graph.id, title: graph.title });
		await maintenanceRuns.finish(graph.id, run.sequence.id, { outcome: "converged" });
		const fingerprint = await buildAuditFingerprint({
			updatedAt: graph.updatedAt, components: graph.components,
			graphify: await assessSubsystemGraphifyReadiness(graph),
		});
		await saveSubsystemModelAudit(graph.id, audit(), fingerprint);
		const fresh = await (await status()).json() as StatusBody;
		expect(fresh.snapshot?.verification).toEqual({
			checkedAt: timestamp, stale: false,
			lanes: { construct: "none", "static-topology": "none", "dynamic-topology": "none", trail: "none" },
		});
		await saveSubsystemModelAudit(graph.id, audit(), "previous-inputs");
		const stale = await (await status()).json() as StatusBody;
		expect(stale.snapshot?.verification?.stale).toBe(true);
		expect(stale.snapshot?.sequence.outcome).toBe("converged");
		expect(stale.snapshot?.revision).toBeGreaterThan(fresh.snapshot?.revision ?? 0);
		await saveSubsystemModelAudit(graph.id, { ...audit(), checkedAt: "invalid" }, fingerprint);
		expect(((await (await status()).json()) as StatusBody).snapshot?.verification).toBeNull();
	});

	test("an interrupted parent is unknown even when a legacy agent row says done", async () => {
		const oldHost = createMaintenanceRunStore({
			root: join(home, ".principal", "subsystem-maintenance-runs"), owner: "previous-host",
		});
		const run = await oldHost.start({ graphId: graph.id, title: graph.title });
		await oldHost.stage(graph.id, run.sequence.id, stage("a"));
		await noteSubsystemModelRunFinish({
			graphId: graph.id, runId: "a", maintenanceRunId: run.sequence.id, status: "done",
		});
		const body = await (await status()).json() as StatusBody;
		expect(body.running).toBe(false);
		expect(body.runs[0]?.maintenanceRunId).toBe(run.sequence.id);
		expect(body.snapshot?.sequence).toMatchObject({ status: "unknown", outcome: null, endedAt: null });
	});

	test("corrupt proposal evidence is unreported rather than a fabricated zero", async () => {
		const run = await maintenanceRuns.start({ graphId: graph.id, title: graph.title });
		await maintenanceRuns.stage(graph.id, run.sequence.id, stage("a"));
		await seedProposals([]);
		const path = join(home, ".principal", "subsystem-model-proposals", `${graph.id}.json`);
		await fs.writeFile(path, "{broken");
		const response = await status();
		expect(response.status).toBe(200);
		const body = await response.json() as StatusBody;
		expect(body.snapshot?.stages[0]?.counts).toEqual(unreportedProposalCounts());
		expect(body.snapshot?.counts.proposalsPending).toBeNull();
	});

	test("corrupt parent history returns unavailable, not an empty successful response", async () => {
		const root = join(home, ".principal", "subsystem-maintenance-runs");
		await fs.mkdir(root, { recursive: true });
		await fs.writeFile(join(root, `${graph.id}.json`), "{broken");
		expect((await status()).status).toBe(503);
	});

	test("unknown model stays 404 and start response preserves the durable run id", async () => {
		expect((await status("sg-does-not-exist")).status).toBe(404);
		const response = await handleSubsystemModelRequest(
			new Request(`http://127.0.0.1:3045/api/subsystem-model/${graph.id}/maintain`, { method: "POST" }),
			noop, noop, noop, maintain,
		);
		expect(response.status).toBe(202);
		expect(await response.json()).toMatchObject({ maintenanceRunId: "pre-created-parent" });
	});
});

describe("measured proposal counts", () => {
	test("an absent proposal file is a measured empty set for a newly recorded agent", async () => {
		expect(await proposalCountsForRuns(graph.id, ["a"])).toEqual({
			a: { proposalsCreated: 0, proposalsApplied: 0, proposalsPending: 0 },
		});
	});

	test("malformed records and duplicate ids never count as zero or as extra proposals", async () => {
		await seedProposals([]);
		const path = join(home, ".principal", "subsystem-model-proposals", `${graph.id}.json`);
		for (const doc of [
			{ version: 1, graphId: graph.id },
			{ version: 2, graphId: graph.id, proposals: [] },
			{ version: 1, graphId: "another-model", proposals: [] },
			{ version: 1, graphId: graph.id, proposals: [{ ...proposal("a", "pending"), status: "unknown" }] },
			{ version: 1, graphId: graph.id, proposals: [proposal("a", "pending"), proposal("a", "pending")] },
		]) {
			await fs.writeFile(path, JSON.stringify(doc));
			expect(await proposalCountsForRuns(graph.id, ["a"])).toBeNull();
		}
	});
});

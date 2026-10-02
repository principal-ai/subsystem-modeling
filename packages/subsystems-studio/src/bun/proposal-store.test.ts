import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SubsystemModelProposal } from "../shared/contract";
import {
	deleteAllPendingSubsystemModelProposals,
	listSubsystemModelProposals,
	rejectSubsystemModelProposal,
} from "./proposal-store";

const GRAPH_ID = "sg-test-atomic";

let home: string;
let root: string;

function proposalsDir(): string {
	return join(home, ".principal", "subsystem-model-proposals");
}

function path(graphId = GRAPH_ID): string {
	return join(proposalsDir(), `${graphId}.json`);
}

function proposal(id: string, status: "pending" | "accepted" | "rejected") {
	return {
		id,
		graphId: GRAPH_ID,
		status,
		createdAt: "2026-10-02T03:50:40.279Z",
		lane: "construct",
		rationale: `rationale for ${id}`,
		changes: [],
		preview: [],
	} satisfies SubsystemModelProposal;
}

function seed(graphId: string, proposals: unknown[]): void {
	mkdirSync(proposalsDir(), { recursive: true });
	writeFileSync(
		join(proposalsDir(), `${graphId}.json`),
		`${JSON.stringify({ version: 1, graphId, proposals }, null, 2)}\n`,
		"utf8",
	);
}

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "proposal-store-"));
	process.env["PRINCIPAL_SUBSYSTEM_MODELS_HOME"] = home;
	root = proposalsDir();
});

afterEach(() => {
	delete process.env["PRINCIPAL_SUBSYSTEM_MODELS_HOME"];
	rmSync(home, { recursive: true, force: true });
});

describe("proposal store durability", () => {
	test("a write leaves valid JSON and no tmp residue", async () => {
		seed(GRAPH_ID, [proposal("sp-a", "pending")]);
		await rejectSubsystemModelProposal(GRAPH_ID, "sp-a");

		const raw = readFileSync(path(), "utf8");
		expect(JSON.parse(raw)).toMatchObject({
			version: 1,
			graphId: GRAPH_ID,
			proposals: [{ id: "sp-a", status: "rejected" }],
		});
		expect(readdirSync(root)).toEqual([`${GRAPH_ID}.json`]);
	});

	test("a failed write leaves the previous file intact", async () => {
		seed(GRAPH_ID, [proposal("sp-a", "pending"), proposal("sp-b", "pending")]);
		const before = readFileSync(path(), "utf8");

		// Block the tmp write by occupying its path with a directory, so the
		// write fails exactly where a crash would: after the old file is still
		// the only complete copy on disk.
		const tmp = join(root, `.${GRAPH_ID}.${process.pid}.json.tmp`);
		mkdirSync(tmp, { recursive: true });

		await expect(rejectSubsystemModelProposal(GRAPH_ID, "sp-a")).rejects.toThrow();

		// The old version survived whole — this is the guarantee the bare
		// writeFile broke.
		expect(readFileSync(path(), "utf8")).toBe(before);
		expect(await listSubsystemModelProposals(GRAPH_ID)).toHaveLength(2);

		rmSync(tmp, { recursive: true, force: true });
	});

	test("a write repairs a corrupt store file", async () => {
		// Reproduce the shape found on disk: a complete document followed by
		// NUL padding, which JSON.parse rejects outright.
		seed(GRAPH_ID, [proposal("sp-a", "pending")]);
		writeFileSync(path(), `${readFileSync(path(), "utf8")}\x00\x00\x00`, "utf8");
		expect(() => JSON.parse(readFileSync(path(), "utf8"))).toThrow();

		// Unreadable as history, but the next write replaces it wholesale, so
		// the corruption is recoverable rather than permanent.
		expect(await listSubsystemModelProposals(GRAPH_ID)).toEqual([]);

		seed(GRAPH_ID, [proposal("sp-a", "pending")]);
		await rejectSubsystemModelProposal(GRAPH_ID, "sp-a");

		expect(JSON.parse(readFileSync(path(), "utf8"))).toMatchObject({
			proposals: [{ id: "sp-a", status: "rejected" }],
		});
	});
});

describe("deleteAllPendingSubsystemModelProposals", () => {
	test("skips files it cannot parse instead of wiping them", async () => {
		seed("sg-good", [proposal("sp-a", "pending"), proposal("sp-b", "accepted")]);
		mkdirSync(proposalsDir(), { recursive: true });
		writeFileSync(join(proposalsDir(), "sg-corrupt.json"), "{oops\x00", "utf8");

		const res = await deleteAllPendingSubsystemModelProposals();

		expect(res.deleted).toBe(1);
		expect(res.graphIds).toEqual(["sg-good"]);
		expect(JSON.parse(readFileSync(join(proposalsDir(), "sg-good.json"), "utf8")))
			.toMatchObject({ proposals: [{ id: "sp-b", status: "accepted" }] });
	});
});
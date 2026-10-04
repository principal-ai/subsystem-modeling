import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	acceptSubsystemModelProposal,
	createSubsystemModelProposal,
} from "./proposal-store";
import { createSubsystemModel } from "./subsystem-model-store";
import { readC4ElementSet } from "./c4-element-store";
import { registerProjectInAlexandria } from "./alexandria";
import type { SubsystemComponent } from "@principal-ai/subsystems-react";

/**
 * The two dynamic-topology change kinds, end to end:
 *
 *   - `c4-container` — accept lands the container in the accepted-only
 *     element store (not the model); the boundary then reads `verified`.
 *   - `consolidation` — accept rewrites the MODEL's `process` fields (the
 *     read side never folds, so a model edit is the only way two names for
 *     one deployable unit become one).
 *
 * Both tmp homes are set before imports touch disk: models to a tmpdir via
 * the store's env override, the element store via its own.
 */

let tmp: string;

const KEY = "pkg:github/a/repo-a";

beforeAll(() => {
	tmp = mkdtempSync(join(tmpdir(), "c4-proposal-"));
	// repoA is a real git checkout so commit-provenance capture has a HEAD.
	const repoA = join(tmp, "repo-a");
	{
		const { mkdirSync, writeFileSync } = require("node:fs");
		mkdirSync(join(repoA, "src"), { recursive: true });
		writeFileSync(join(repoA, "src", "main.ts"), "export const main = 1;\n", "utf8");
		const runGit = (args: string[]) => {
			const r = spawnSync("git", ["-C", repoA, ...args], {
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
			});
			if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
		};
		runGit(["init"]);
		runGit(["config", "user.email", "test@example.com"]);
		runGit(["config", "user.name", "test"]);
		runGit(["add", "-A"]);
		runGit(["commit", "-m", "init"]);
	}
	registerProjectInAlexandria(repoA, "https://github.com/a/repo-a.git");
	process.env["PRINCIPAL_ALEXANDRIA_HOME"] = join(tmp, "alexandria");
	process.env["PRINCIPAL_SUBSYSTEM_MODELS_HOME"] = tmp;
	process.env["PRINCIPAL_C4_ELEMENTS_HOME"] = tmp;
});

afterAll(() => {
	rmSync(tmp, { recursive: true, force: true });
	delete process.env["PRINCIPAL_ALEXANDRIA_HOME"];
	delete process.env["PRINCIPAL_SUBSYSTEM_MODELS_HOME"];
	delete process.env["PRINCIPAL_C4_ELEMENTS_HOME"];
});

// Two spellings for what is one deployable unit — the discrepancy the
// consolidation change kind exists to fix.
const components: SubsystemComponent[] = [
	{
		alias: "main",
		name: "main",
		construct: "function",
		file: "src/main.ts",
		purl: `${KEY}#src/main.ts`,
		process: "studio/host",
	},
	{
		alias: "runner",
		name: "runWorker",
		construct: "function",
		file: "src/main.ts",
		purl: `${KEY}#src/main.ts`,
		process: "principal/host",
	},
];

async function createModel(): Promise<string> {
	const created = await createSubsystemModel({
		title: `c4-proposal-${Math.random().toString(36).slice(2)}`,
		components: components.map((c) => ({ ...c })),
	});
	return created.id;
}

describe("c4-container proposal change", () => {
	test("accept upserts the element store — the model is untouched", async () => {
		const graphId = await createModel();
		const created = await createSubsystemModelProposal({
			graphId,
			rationale: "the host is one deployable unit",
			runId: "run-42",
			changes: [
				{
					target: "c4-container",
					purl: KEY,
					container: {
						id: "container:studio/host",
						label: "Studio host",
						containerKind: "application",
						technology: "Bun",
						process: "studio/host",
					},
				},
			],
		});
		expect(created.ok).toBe(true);
		if (!created.ok) return;
		expect(created.proposal.lane).toBe("dynamic-topology");

		const accepted = await acceptSubsystemModelProposal(graphId, created.proposal.id);
		expect(accepted.ok).toBe(true);

		// The element store holds the accepted container, attributed to the run.
		const set = await readC4ElementSet(KEY);
		expect(set.elements).toHaveLength(1);
		expect(set.elements[0]).toMatchObject({
			id: "container:studio/host",
			state: "accepted",
			process: "studio/host",
			technology: "Bun",
		});
	});

	test("validation rejects an unknown containerKind and a blank process", async () => {
		const graphId = await createModel();
		const badKind = await createSubsystemModelProposal({
			graphId,
			rationale: "r",
			changes: [
				{
					target: "c4-container",
					purl: KEY,
					container: {
						id: "c",
						label: "c",
						containerKind: "queue" as never,
						technology: "Bun",
						process: "studio/host",
					},
				},
			],
		});
		expect(badKind.ok).toBe(false);
		if (!badKind.ok) expect(badKind.error).toContain("containerKind");

		const blankProcess = await createSubsystemModelProposal({
			graphId,
			rationale: "r",
			changes: [
				{
					target: "c4-container",
					purl: KEY,
					container: {
						id: "c",
						label: "c",
						containerKind: "application",
						technology: "Bun",
						process: "  ",
					},
				},
			],
		});
		expect(blankProcess.ok).toBe(false);
		if (!blankProcess.ok) expect(blankProcess.error).toContain("process");
	});
});

describe("consolidation proposal change", () => {
	test("accept rewrites the model's process fields to the canonical key", async () => {
		const graphId = await createModel();
		const created = await createSubsystemModelProposal({
			graphId,
			rationale: "two spellings, one deployable unit",
			changes: [
				{
					target: "consolidation",
					processKeys: ["studio/host", "principal/host"],
					canonicalKey: "studio/host",
				},
			],
		});
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		const accepted = await acceptSubsystemModelProposal(graphId, created.proposal.id);
		expect(accepted.ok).toBe(true);

		// Re-read the model: both components now carry the canonical key.
		const { getSubsystemModel } = await import("./subsystem-model-store");
		const after = await getSubsystemModel(graphId);
		expect(after?.components.map((c) => c.process)).toEqual([
			"studio/host",
			"studio/host",
		]);
	});

	test("canonicalKey must be one of processKeys, and keys must exist in the model", async () => {
		const graphId = await createModel();

		const notMember = await createSubsystemModelProposal({
			graphId,
			rationale: "r",
			changes: [
				{
					target: "consolidation",
					processKeys: ["studio/host", "principal/host"],
					canonicalKey: "other/host",
				},
			],
		});
		expect(notMember.ok).toBe(false);
		if (!notMember.ok) expect(notMember.error).toContain("canonicalKey");

		const unknownKey = await createSubsystemModelProposal({
			graphId,
			rationale: "r",
			changes: [
				{
					target: "consolidation",
					processKeys: ["studio/host", "ghost/host"],
					canonicalKey: "studio/host",
				},
			],
		});
		expect(unknownKey.ok).toBe(false);
		if (!unknownKey.ok) expect(unknownKey.error).toContain("unknown process key");
	});
});

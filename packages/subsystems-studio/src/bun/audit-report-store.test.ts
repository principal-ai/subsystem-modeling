import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	SubsystemModelAuditBoundaryCheck,
	SubsystemModelAuditCheck,
	SubsystemModelAuditReport,
} from "../shared/contract";
import {
	buildAuditFingerprint,
	summarizeLanes,
	summarizeVerification,
} from "./audit-report-store";
import { cacheSlotDir, clearGitProbeCache } from "./graphify-store";

function initRepo(): { repo: string; head: string } {
	const repo = mkdtempSync(join(tmpdir(), "audit-fp-repo-"));
	spawnSync("git", ["init"], { cwd: repo, stdio: "ignore" });
	spawnSync("git", ["config", "user.email", "t@t.com"], {
		cwd: repo,
		stdio: "ignore",
	});
	spawnSync("git", ["config", "user.name", "t"], {
		cwd: repo,
		stdio: "ignore",
	});
	writeFileSync(join(repo, "a.txt"), "x\n");
	spawnSync("git", ["add", "."], { cwd: repo, stdio: "ignore" });
	spawnSync("git", ["commit", "-m", "init"], { cwd: repo, stdio: "ignore" });
	const head = spawnSync("git", ["rev-parse", "HEAD"], {
		cwd: repo,
		encoding: "utf8",
	}).stdout.trim();
	return { repo, head };
}

describe("buildAuditFingerprint", () => {
	test("includes current checkout slotKey, not an older slot", async () => {
		const storeRoot = mkdtempSync(join(tmpdir(), "audit-fp-store-"));
		const { repo, head } = initRepo();
		const purl = "pkg:github/acme/fp";

		const oldSlot = cacheSlotDir(purl, "oldhead", null, storeRoot);
		mkdirSync(oldSlot, { recursive: true });
		writeFileSync(
			join(oldSlot, "graph.json"),
			JSON.stringify({ nodes: [], links: [] }),
		);
		writeFileSync(
			join(oldSlot, "meta.json"),
			JSON.stringify({
				purl,
				purlKey: purl,
				headSha: "oldhead",
				dirtyHash: null,
				slotKey: "oldhead",
				repoRoot: repo,
				builtAt: "2020-01-01T00:00:00.000Z",
				nodeCount: 0,
				edgeCount: 0,
			}),
		);

		const currentSlot = cacheSlotDir(purl, head, null, storeRoot);
		mkdirSync(currentSlot, { recursive: true });
		writeFileSync(
			join(currentSlot, "graph.json"),
			JSON.stringify({ nodes: [{ id: "1" }], links: [] }),
		);
		writeFileSync(
			join(currentSlot, "meta.json"),
			JSON.stringify({
				purl,
				purlKey: purl,
				headSha: head,
				dirtyHash: null,
				slotKey: head,
				repoRoot: repo,
				builtAt: "2026-06-01T00:00:00.000Z",
				nodeCount: 1,
				edgeCount: 0,
			}),
		);

		const fp = await buildAuditFingerprint({
			updatedAt: "2026-01-01T00:00:00.000Z",
			components: [
				{
					alias: "c1",
					file: "a.ts",
					symbol: "foo",
					construct: "function",
					purl,
				},
			],
			graphify: {
				status: "possible",
				purls: [{ purl, status: "ready", repoRoot: repo }],
			},
			storeRoot,
		});

		expect(fp).toContain(`:${head}:`);
		expect(fp).toContain("2026-06-01T00:00:00.000Z");
		expect(fp).not.toContain("oldhead");
		expect(fp).not.toContain("2020-01-01");
	});

	test("changes when HEAD moves even if only an old slot exists", async () => {
		const storeRoot = mkdtempSync(join(tmpdir(), "audit-fp-store-"));
		const { repo, head } = initRepo();
		const purl = "pkg:github/acme/fp-move";

		const oldSlot = cacheSlotDir(purl, "oldhead", null, storeRoot);
		mkdirSync(oldSlot, { recursive: true });
		writeFileSync(
			join(oldSlot, "graph.json"),
			JSON.stringify({ nodes: [], links: [] }),
		);
		writeFileSync(
			join(oldSlot, "meta.json"),
			JSON.stringify({
				purl,
				purlKey: purl,
				headSha: "oldhead",
				dirtyHash: null,
				slotKey: "oldhead",
				repoRoot: repo,
				builtAt: "2020-01-01T00:00:00.000Z",
				nodeCount: 0,
				edgeCount: 0,
			}),
		);

		const before = await buildAuditFingerprint({
			updatedAt: "2026-01-01T00:00:00.000Z",
			components: [{ alias: "c1", purl }],
			graphify: {
				status: "not_ready",
				purls: [{ purl, status: "missing", repoRoot: repo }],
			},
			storeRoot,
		});
		expect(before).toContain(head);

		writeFileSync(join(repo, "b.txt"), "y\n");
		spawnSync("git", ["add", "."], { cwd: repo, stdio: "ignore" });
		spawnSync("git", ["commit", "-m", "two"], { cwd: repo, stdio: "ignore" });
		clearGitProbeCache();
		const head2 = spawnSync("git", ["rev-parse", "HEAD"], {
			cwd: repo,
			encoding: "utf8",
		}).stdout.trim();

		const after = await buildAuditFingerprint({
			updatedAt: "2026-01-01T00:00:00.000Z",
			components: [{ alias: "c1", purl }],
			graphify: {
				status: "not_ready",
				purls: [{ purl, status: "missing", repoRoot: repo }],
			},
			storeRoot,
		});
		expect(after).toContain(head2);
		expect(after).not.toBe(before);
	});
});

function componentCheck(
	over: Partial<SubsystemModelAuditCheck>,
): SubsystemModelAuditCheck {
	return {
		componentAlias: "c",
		fileExists: true,
		symbolDeclared: true,
		declarationFreshness: "fresh",
		constructMatch: true,
		signature: "match",
		anchor: "exact",
		graphify: "confirmed",
		verdict: "ok",
		...over,
	};
}

function boundaryCheck(
	over: Partial<SubsystemModelAuditBoundaryCheck>,
): SubsystemModelAuditBoundaryCheck {
	return {
		componentAlias: "c",
		kind: "module_file",
		verdict: "ok",
		...over,
	};
}

function report(
	over: Partial<SubsystemModelAuditReport> = {},
): SubsystemModelAuditReport {
	return {
		graphId: "g",
		title: "t",
		checkedAt: "2026-01-01T00:00:00.000Z",
		needsUpdate: false,
		summary: {
			components: 0,
			filesVerified: 0,
			symbolsVerified: 0,
			declarationsFresh: 0,
			constructsMatched: 0,
			signaturesMatched: 0,
			anchorsExact: 0,
			graphifyConfirmed: 0,
			externalsSkipped: 0,
			missingFiles: 0,
			missingSymbols: 0,
			trailFailures: 0,
			stepsUnconfirmed: 0,
			stepsStale: 0,
			stepsVerified: 0,
			staleDeclarations: 0,
			constructMismatches: 0,
			signatureMismatches: 0,
			weakAnchors: 0,
			unresolved: 0,
			ok: 0,
			modulesClaimed: 0,
			moduleFileOk: 0,
			moduleFileMismatch: 0,
			processNestsChecked: 0,
			processNestOk: 0,
			processNestDisagree: 0,
			processRequired: 0,
			processClaimed: 0,
			processMissing: 0,
		},
		checks: [],
		findings: [],
		...over,
	};
}

describe("summarizeVerification", () => {
	test("fully confirmed model reads 100% with no blocking", () => {
		const v = summarizeVerification(
			report({
				checks: [componentCheck({}), componentCheck({ componentAlias: "c2" })],
				boundaryChecks: [boundaryCheck({})],
			}),
		);
		expect(v.verified).toBe(3);
		expect(v.open).toBe(0);
		expect(v.blocking).toBe(0);
		expect(v.coverage).toBe(1);
		expect(v.byLayer.construct.verified).toBe(2);
		expect(v.byLayer.boundary.verified).toBe(1);
	});

	test("unconfirmed construct claim is open, not blocking", () => {
		const v = summarizeVerification(
			report({
				checks: [
					componentCheck({}),
					componentCheck({
						componentAlias: "gap",
						signature: "skipped",
					}),
				],
			}),
		);
		expect(v.verified).toBe(1);
		expect(v.open).toBe(1);
		expect(v.blocking).toBe(0);
		expect(v.coverage).toBe(0.5);
		expect(v.byLayer.construct.open).toBe(1);
	});

	test("unclassified construct on an exact anchor is open, not verified", () => {
		const v = summarizeVerification(
			report({
				checks: [
					componentCheck({}),
					componentCheck({
						componentAlias: "unclassified",
						constructInferred: "unknown",
						constructMatch: null,
					}),
				],
			}),
		);
		expect(v.verified).toBe(1);
		expect(v.open).toBe(1);
		expect(v.coverage).toBe(0.5);
	});

	test("hard failures count as blocking", () => {
		const v = summarizeVerification(
			report({
				checks: [
					componentCheck({}),
					componentCheck({
						componentAlias: "bad",
						fileExists: false,
						verdict: "issue",
					}),
				],
				boundaryChecks: [boundaryCheck({ verdict: "issue" })],
			}),
		);
		expect(v.open).toBe(2);
		expect(v.blocking).toBe(2);
		expect(v.coverage).toBe(1 / 3);
	});

	test("externals and proposed components are n/a and excluded", () => {
		const v = summarizeVerification(
			report({
				checks: [
					componentCheck({
						componentAlias: "ext",
						graphify: "skipped",
						verdict: "skipped",
						fileExists: null,
						constructMatch: null,
						signature: "n/a",
						anchor: "n/a",
					}),
				],
			}),
		);
		expect(v.na).toBe(1);
		expect(v.verified).toBe(0);
		expect(v.open).toBe(0);
		expect(v.coverage).toBe(1);
	});

	test("a node_modules anchor is n/a, not a blocked claim", () => {
		// What the audit emits for an installed-dependency path: skipped, like an
		// external. It must not read as an environment `blocked` claim — nothing
		// about cloning a repo or building a cache closes it.
		const v = summarizeVerification(
			report({
				checks: [
					componentCheck({}),
					componentCheck({
						componentAlias: "highlighter-store",
						graphify: "skipped",
						verdict: "skipped",
						fileExists: null,
						constructMatch: null,
						signature: "n/a",
						anchor: "n/a",
					}),
				],
			}),
		);
		expect(v.verified).toBe(1);
		expect(v.na).toBe(1);
		expect(v.blocked).toBe(0);
		expect(v.open).toBe(0);
	});

	test("unresolved repo and unbuilt cache are blocked, not open", () => {
		const v = summarizeVerification(
			report({
				checks: [
					componentCheck({ componentAlias: "c", fileExists: true }),
					componentCheck({
						componentAlias: "no-repo",
						fileExists: null,
						graphify: "unavailable",
						verdict: "skipped",
						constructMatch: null,
						signature: "n/a",
						anchor: "n/a",
					}),
					componentCheck({
						componentAlias: "no-cache",
						fileExists: true,
						graphify: "unavailable",
						constructMatch: null,
						signature: "n/a",
						anchor: "n/a",
					}),
				],
			}),
		);
		expect(v.verified).toBe(1);
		expect(v.blocked).toBe(2);
		expect(v.open).toBe(0);
		expect(v.coverage).toBe(1);
	});

	test("all-blocked model reads 0%, not 100%", () => {
		const v = summarizeVerification(
			report({
				checks: [
					componentCheck({
						componentAlias: "no-repo",
						fileExists: null,
						graphify: "unavailable",
						verdict: "skipped",
						constructMatch: null,
						signature: "n/a",
						anchor: "n/a",
					}),
				],
			}),
		);
		expect(v.verified).toBe(0);
		expect(v.open).toBe(0);
		expect(v.blocked).toBe(1);
		expect(v.coverage).toBe(0);
	});

	test("module/file boundary gaps land in the boundary layer", () => {
		const v = summarizeVerification(
			report({
				boundaryChecks: [
					boundaryCheck({}),
					boundaryCheck({ componentAlias: "b2", verdict: "gap" }),
				],
			}),
		);
		expect(v.byLayer.boundary.verified).toBe(1);
		expect(v.byLayer.boundary.open).toBe(1);
		expect(v.byLayer.construct.na).toBe(0);
	});
});

describe("summarizeLanes", () => {
	test("maps checks onto the four lanes", () => {
		const lanes = summarizeLanes(
			report({
				checks: [componentCheck({})],
				boundaryChecks: [
					boundaryCheck({}),
					boundaryCheck({ componentAlias: "p", kind: "process_nest" }),
				],
			}),
			{ hasTrails: true },
		);
		expect(lanes).toEqual({
			construct: "verified",
			"static-topology": "verified",
			"dynamic-topology": "verified",
			trail: "verified",
		});
	});

	test("gaps -> partial, hard fails -> issues, absent -> none", () => {
		const lanes = summarizeLanes(
			report({
				checks: [
					componentCheck({ componentAlias: "gap", signature: "skipped" }),
				],
				boundaryChecks: [boundaryCheck({ verdict: "issue" })],
			}),
			{ hasTrails: false },
		);
		expect(lanes.construct).toBe("partial");
		expect(lanes["static-topology"]).toBe("issues");
		expect(lanes["dynamic-topology"]).toBe("none");
		expect(lanes.trail).toBe("none");
	});

	test("an unverified process container gaps the dynamic-topology lane", () => {
		// All process CLAIMS can be internally consistent (green under the old
		// tally) while no container claims the boundary — the element-store
		// check must count, or the lane icon lies against the issues list.
		const lanes = summarizeLanes(
			report({
				checks: [componentCheck({})],
				boundaryChecks: [
					boundaryCheck({ componentAlias: "p", kind: "process_claim" }),
					boundaryCheck({
						componentAlias: "p",
						kind: "process_container",
						process: "app/host",
						verdict: "gap",
					}),
				],
			}),
			{ hasTrails: false },
		);
		expect(lanes["dynamic-topology"]).toBe("partial");
	});

	test("an unmatched symbol is a red construct lane, not a yellow gap", () => {		// The file exists but the symbol is absent — emitted at check verdict
		// `issue` (error finding). A mere `ok` verdict would tally as open and
		// paint the lane yellow, understating a broken claim as unconfirmed.
		const lanes = summarizeLanes(
			report({
				checks: [
					componentCheck({}),
					componentCheck({
						componentAlias: "symbol-unmatched",
						fileExists: true,
						symbolDeclared: false,
						anchor: "file-only",
						graphify: "weak",
						verdict: "issue",
					}),
				],
			}),
			{ hasTrails: false },
		);
		expect(lanes.construct).toBe("issues");
	});

	test("trail failures -> issues when trails exist", () => {
		const base = report();
		const lanes = summarizeLanes(
			report({ summary: { ...base.summary, trailFailures: 2 } }),
			{ hasTrails: true },
		);
		expect(lanes.trail).toBe("issues");
	});

	test("construct is never none when the model has components", () => {
		const base = report();
		const lanes = summarizeLanes(
			report({ summary: { ...base.summary, components: 3 } }),
			{ hasTrails: false },
		);
		expect(lanes.construct).toBe("partial");
		expect(lanes["static-topology"]).toBe("none");
	});

	/*
	 * Dynamic topology must distinguish "process stated, nothing wrong" from
	 * "no process information at all". Both used to tally zero.
	 */
	test("a claimed process verifies dynamic topology with no module present", () => {
		const lanes = summarizeLanes(
			report({
				checks: [componentCheck({})],
				boundaryChecks: [
					boundaryCheck({ componentAlias: "a", kind: "process_claim" }),
					boundaryCheck({ componentAlias: "b", kind: "process_claim" }),
				],
			}),
			{ hasTrails: true },
		);
		expect(lanes["dynamic-topology"]).toBe("verified");
		// No module claims, so static topology still has nothing to check.
		expect(lanes["static-topology"]).toBe("none");
	});

	test("no process information at all leaves dynamic topology none", () => {
		const lanes = summarizeLanes(
			report({
				checks: [componentCheck({})],
				boundaryChecks: [
					boundaryCheck({
						componentAlias: "a",
						kind: "skipped",
						verdict: "skipped",
					}),
				],
			}),
			{ hasTrails: true },
		);
		expect(lanes["dynamic-topology"]).toBe("none");
	});

	test("a missing process claim is partial, never a hard fail", () => {
		const lanes = summarizeLanes(
			report({
				checks: [componentCheck({})],
				boundaryChecks: [
					boundaryCheck({ componentAlias: "a", kind: "process_claim" }),
					boundaryCheck({
						componentAlias: "b",
						kind: "process_claim",
						verdict: "gap",
					}),
				],
			}),
			{ hasTrails: true },
		);
		expect(lanes["dynamic-topology"]).toBe("partial");
	});
});

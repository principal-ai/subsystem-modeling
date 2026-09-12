import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildAuditFingerprint } from "./audit-report-store";
import { cacheSlotDir } from "./graphify-store";

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
	test("includes current checkout slotKey, not an older slot", () => {
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

		const fp = buildAuditFingerprint({
			updatedAt: "2026-01-01T00:00:00.000Z",
			components: [
				{
					id: "c1",
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

	test("changes when HEAD moves even if only an old slot exists", () => {
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

		const before = buildAuditFingerprint({
			updatedAt: "2026-01-01T00:00:00.000Z",
			components: [{ id: "c1", purl }],
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
		const head2 = spawnSync("git", ["rev-parse", "HEAD"], {
			cwd: repo,
			encoding: "utf8",
		}).stdout.trim();

		const after = buildAuditFingerprint({
			updatedAt: "2026-01-01T00:00:00.000Z",
			components: [{ id: "c1", purl }],
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

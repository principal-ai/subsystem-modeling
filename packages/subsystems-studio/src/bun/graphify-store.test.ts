import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
	cacheSlotDir,
	cacheSlotKey,
	cachedGraphJsonPath,
	dirtyFingerprint,
	ensureCurrentGraphifyCachesForModel,
	getCachedGraphifyGraph,
	gitHeadSha,
	sanitizePurlDirName,
	assessSubsystemGraphifyReadiness,
} from "./graphify-store";

describe("sanitizePurlDirName", () => {
	test("strips pkg: and lowercases", () => {
		expect(sanitizePurlDirName("pkg:github/Principal-AI/Foo")).toBe(
			"github-principal-ai-foo",
		);
	});

	test("collapses odd characters", () => {
		expect(sanitizePurlDirName("pkg:generic/local/my repo!")).toBe(
			"generic-local-my-repo",
		);
	});
});

describe("cacheSlotKey", () => {
	test("clean vs dirty", () => {
		expect(cacheSlotKey("abc", null)).toBe("abc");
		expect(cacheSlotKey("abc", "deadbeef")).toBe("abc+deadbeef");
	});
});

describe("cache paths", () => {
	test("nest under store root by purl dir + slot", () => {
		const root = "/tmp/gf-store";
		expect(cacheSlotDir("pkg:github/a/b", "abc123", null, root)).toBe(
			join(root, "github-a-b", "abc123"),
		);
		expect(cacheSlotDir("pkg:github/a/b", "abc123", "d4f8", root)).toBe(
			join(root, "github-a-b", "abc123+d4f8"),
		);
		expect(cachedGraphJsonPath("pkg:github/a/b", "abc123", "d4f8", root)).toBe(
			join(root, "github-a-b", "abc123+d4f8", "graph.json"),
		);
	});
});

describe("dirtyFingerprint", () => {
	function initRepo(): string {
		const dir = mkdtempSync(join(tmpdir(), "gf-dirty-"));
		const run = (args: string[]) => {
			const r = spawnSync("git", ["-C", dir, ...args], {
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
			});
			if (r.status !== 0) {
				throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
			}
		};
		run(["init"]);
		run(["config", "user.email", "test@example.com"]);
		run(["config", "user.name", "test"]);
		writeFileSync(join(dir, "a.ts"), "export const a = 1;\n");
		run(["add", "a.ts"]);
		run(["commit", "-m", "init"]);
		return dir;
	}

	test("null when clean", () => {
		const dir = initRepo();
		expect(dirtyFingerprint(dir)).toBeNull();
	});

	test("stable for same dirt, changes when content changes", () => {
		const dir = initRepo();
		writeFileSync(join(dir, "a.ts"), "export const a = 2;\n");
		const first = dirtyFingerprint(dir);
		expect(first).toBeTruthy();
		expect(dirtyFingerprint(dir)).toBe(first);

		writeFileSync(join(dir, "a.ts"), "export const a = 3;\n");
		const second = dirtyFingerprint(dir);
		expect(second).toBeTruthy();
		expect(second).not.toBe(first);
	});

	test("picks up untracked files", () => {
		const dir = initRepo();
		expect(dirtyFingerprint(dir)).toBeNull();
		writeFileSync(join(dir, "new.ts"), "export const n = 1;\n");
		const fp = dirtyFingerprint(dir);
		expect(fp).toBeTruthy();
	});
});

describe("getCachedGraphifyGraph", () => {
	test("returns null when slot missing", async () => {
		const root = mkdtempSync(join(tmpdir(), "gf-store-"));
		const hit = await getCachedGraphifyGraph("pkg:github/nope/missing", {
			headSha: "deadbeef",
			dirtyHash: null,
			storeRoot: root,
		});
		expect(hit).toBeNull();
	});

	test("reads meta when dirty slot present", async () => {
		const root = mkdtempSync(join(tmpdir(), "gf-store-"));
		const purl = "pkg:github/a/b";
		const head = "abc123def";
		const dirty = "d4f8e1a2b3c4d5e6";
		const slot = cacheSlotDir(purl, head, dirty, root);
		mkdirSync(slot, { recursive: true });
		writeFileSync(
			join(slot, "graph.json"),
			JSON.stringify({ nodes: [{ id: "1" }], links: [] }),
		);
		writeFileSync(
			join(slot, "meta.json"),
			JSON.stringify({
				purl,
				purlKey: purl,
				headSha: head,
				dirtyHash: dirty,
				slotKey: cacheSlotKey(head, dirty),
				repoRoot: "/repo",
				builtAt: "2026-01-01T00:00:00.000Z",
				nodeCount: 1,
				edgeCount: 0,
			}),
		);
		const hit = await getCachedGraphifyGraph(purl, {
			headSha: head,
			dirtyHash: dirty,
			storeRoot: root,
		});
		expect(hit?.meta.nodeCount).toBe(1);
		expect(hit?.meta.dirtyHash).toBe(dirty);
		expect(hit?.path).toBe(join(slot, "graph.json"));
	});

	test("returns null when exact dirty slot misses", async () => {
		const root = mkdtempSync(join(tmpdir(), "gf-store-"));
		const purl = "pkg:github/a/b";
		const head = "abc123def";
		const dirty = "d4f8e1a2b3c4d5e6";
		const slot = cacheSlotDir(purl, head, dirty, root);
		mkdirSync(slot, { recursive: true });
		writeFileSync(
			join(slot, "graph.json"),
			JSON.stringify({ nodes: [{ id: "1" }], links: [] }),
		);
		writeFileSync(
			join(slot, "meta.json"),
			JSON.stringify({
				purl,
				purlKey: purl,
				headSha: head,
				dirtyHash: dirty,
				slotKey: cacheSlotKey(head, dirty),
				repoRoot: "/repo",
				builtAt: "2026-01-01T00:00:00.000Z",
				nodeCount: 1,
				edgeCount: 0,
			}),
		);
		const miss = await getCachedGraphifyGraph(purl, {
			headSha: head,
			dirtyHash: "ffffffffffff",
			storeRoot: root,
		});
		expect(miss).toBeNull();
	});
});

describe("assessSubsystemGraphifyReadiness", () => {
	test("empty components → unavailable", () => {
		const r = assessSubsystemGraphifyReadiness({ components: [] });
		expect(r.status).toBe("unavailable");
		expect(r.purls).toEqual([]);
	});

	test("building set marks running", () => {
		const purl = "pkg:github/acme/widget";
		const r = assessSubsystemGraphifyReadiness(
			{ components: [{ purl }], repoRoot: "/no/such/root" },
			new Set([purl]),
		);
		expect(r.status).toBe("running");
		expect(r.purls[0]?.status).toBe("building");
	});

	test("missing local root and no cache → unavailable", () => {
		const purl = "pkg:github/acme/does-not-exist-xyz";
		const root = mkdtempSync(join(tmpdir(), "gf-store-"));
		const r = assessSubsystemGraphifyReadiness(
			{ components: [{ purl }] },
			undefined,
			root,
		);
		expect(r.status).toBe("unavailable");
		expect(r.purls[0]?.status).toBe("unavailable");
	});

	test("old cached slot without matching checkout → unavailable", () => {
		const root = mkdtempSync(join(tmpdir(), "gf-store-"));
		const purl = "pkg:github/acme/cached-only";
		const slot = cacheSlotDir(purl, "oldhead", "olddirty", root);
		mkdirSync(slot, { recursive: true });
		writeFileSync(
			join(slot, "graph.json"),
			JSON.stringify({ nodes: [], links: [] }),
		);
		writeFileSync(
			join(slot, "meta.json"),
			JSON.stringify({
				purl,
				purlKey: purl,
				headSha: "oldhead",
				dirtyHash: "olddirty",
				slotKey: "oldhead+olddirty",
				repoRoot: "/somewhere",
				builtAt: "2026-01-01T00:00:00.000Z",
				nodeCount: 0,
				edgeCount: 0,
			}),
		);
		const r = assessSubsystemGraphifyReadiness(
			{ components: [{ purl }] },
			undefined,
			root,
		);
		expect(r.status).toBe("unavailable");
		expect(r.purls[0]?.status).toBe("unavailable");
	});

	test("current HEAD slot present → ready", () => {
		const storeRoot = mkdtempSync(join(tmpdir(), "gf-store-"));
		const repo = mkdtempSync(join(tmpdir(), "gf-repo-"));
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
		expect(head.length).toBeGreaterThan(0);

		const purl = "pkg:github/acme/current-slot";
		const slot = cacheSlotDir(purl, head, null, storeRoot);
		mkdirSync(slot, { recursive: true });
		writeFileSync(
			join(slot, "graph.json"),
			JSON.stringify({ nodes: [], links: [] }),
		);
		writeFileSync(
			join(slot, "meta.json"),
			JSON.stringify({
				purl,
				purlKey: purl,
				headSha: head,
				dirtyHash: null,
				slotKey: head,
				repoRoot: repo,
				builtAt: "2026-01-01T00:00:00.000Z",
				nodeCount: 0,
				edgeCount: 0,
			}),
		);

		const r = assessSubsystemGraphifyReadiness(
			{ components: [{ purl }], repoRoot: repo },
			undefined,
			storeRoot,
		);
		expect(r.status).toBe("possible");
		expect(r.purls[0]?.status).toBe("ready");
	});

	test("checkout present but only old slot → missing", () => {
		const storeRoot = mkdtempSync(join(tmpdir(), "gf-store-"));
		const repo = mkdtempSync(join(tmpdir(), "gf-repo-"));
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

		const purl = "pkg:github/acme/stale-slot";
		const slot = cacheSlotDir(purl, "oldhead", null, storeRoot);
		mkdirSync(slot, { recursive: true });
		writeFileSync(
			join(slot, "graph.json"),
			JSON.stringify({ nodes: [], links: [] }),
		);
		writeFileSync(
			join(slot, "meta.json"),
			JSON.stringify({
				purl,
				purlKey: purl,
				headSha: "oldhead",
				dirtyHash: null,
				slotKey: "oldhead",
				repoRoot: repo,
				builtAt: "2026-01-01T00:00:00.000Z",
				nodeCount: 0,
				edgeCount: 0,
			}),
		);

		const r = assessSubsystemGraphifyReadiness(
			{ components: [{ purl }], repoRoot: repo },
			undefined,
			storeRoot,
		);
		expect(r.status).toBe("not_ready");
		expect(r.purls[0]?.status).toBe("missing");
	});
});

describe("ensureCurrentGraphifyCachesForModel", () => {
	test("reports failure when no repoRoot can be resolved", async () => {
		const storeRoot = mkdtempSync(join(tmpdir(), "gf-ensure-"));
		const purl = "pkg:github/acme/no-checkout-xyz";
		const r = await ensureCurrentGraphifyCachesForModel(
			{ components: [{ purl, construct: "function" }] },
			{ storeRoot },
		);
		expect(r.ensured).toEqual([]);
		expect(r.failed[0]?.purl).toBe(purl);
	});

	test("hits existing current HEAD(+dirty) slot without re-extract", async () => {
		const repo = mkdtempSync(join(tmpdir(), "gf-ensure-repo-"));
		spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
		spawnSync("git", ["config", "user.email", "t@t.com"], { cwd: repo });
		spawnSync("git", ["config", "user.name", "t"], { cwd: repo });
		writeFileSync(join(repo, "a.ts"), "export const a = 1;\n");
		spawnSync("git", ["add", "."], { cwd: repo });
		spawnSync("git", ["commit", "-m", "init"], { cwd: repo });

		const head = gitHeadSha(repo);
		expect(head).toBeTruthy();
		const dirty = dirtyFingerprint(repo);
		const storeRoot = mkdtempSync(join(tmpdir(), "gf-ensure-store-"));
		const purl = "pkg:github/acme/ensure-hit";
		const slot = cacheSlotDir(purl, head!, dirty, storeRoot);
		mkdirSync(slot, { recursive: true });
		writeFileSync(
			join(slot, "graph.json"),
			JSON.stringify({ nodes: [{ id: "1" }], links: [] }),
		);
		writeFileSync(
			join(slot, "meta.json"),
			JSON.stringify({
				purl,
				purlKey: purl,
				headSha: head,
				dirtyHash: dirty,
				slotKey: cacheSlotKey(head!, dirty),
				repoRoot: repo,
				builtAt: "2026-01-01T00:00:00.000Z",
				nodeCount: 1,
				edgeCount: 0,
			}),
		);

		const r = await ensureCurrentGraphifyCachesForModel(
			{
				components: [{ purl, construct: "function" }],
				repoRoot: repo,
			},
			{ storeRoot, bin: "/nonexistent/graphify-should-not-run" },
		);
		expect(r.failed).toEqual([]);
		expect(r.ensured).toEqual([purl]);
	});
});

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConstructInventoryService, listConstructInventory, listConstructRepositories } from "./construct-inventory";
import type { GraphifyRepoEntry } from "./graphify-store";
import type { ConstructInventoryRepo, VerifiedConstructRepo } from "../shared/contract";

let root: string;
const purl = "pkg:github/test/inventory";
beforeAll(async () => {
	root = await fs.mkdtemp(join(tmpdir(), "construct-inventory-test-"));
	await fs.mkdir(join(root, "packages/nested"), { recursive: true });
	await fs.writeFile(join(root, "root.ts"), "export function rootFunction() {}\n");
	await fs.writeFile(join(root, "packages/nested/value.ts"), "export function nestedFunction() {}\n");
	await fs.writeFile(join(root, "graph.json"), JSON.stringify({
		nodes: [
			{ id: "root", label: "rootFunction()", source_file: "root.ts", source_location: "L1", file_type: "code" },
			{ id: "nested", label: "nestedFunction()", source_file: "packages/nested/value.ts", source_location: "L1", file_type: "code" },
		], links: [],
	}));
});
afterAll(async () => { await fs.rm(root, { recursive: true, force: true }); });

function repo(overrides: Partial<GraphifyRepoEntry> = {}): GraphifyRepoEntry {
	return {
		purl, owner: "test", name: "inventory", path: root, headSha: "a".repeat(40), dirtyHash: null,
		slotKey: "slot", status: "ready",
		cached: { slotKey: "slot", nodeCount: 2, edgeCount: 0, builtAt: "2026-01-01T00:00:00Z",
			graphJsonPath: join(root, "graph.json"), matchesCurrent: true },
		...overrides,
	};
}

describe("graph-backed Constructs inventory", () => {
	test("lists only model-referenced repositories, including models without audits, without graph discovery", async () => {
		const saved: VerifiedConstructRepo = {
			repoKey: purl, owner: "test", name: "inventory", hasPackageInfo: false, isMonorepo: false,
			packages: [{ path: "", name: "", constructs: [{
				modelId: "one", modelTitle: "One", alias: "root", name: "rootFunction", symbol: "rootFunction",
				file: "root.ts", packageRelativeFile: "root.ts", construct: "function", purl, repoKey: purl,
				startLine: 1, endLine: 1, contentHash: "saved-hash", auditedAt: "2026-10-16T00:00:00Z",
			}] }],
		};
		const result = await listConstructRepositories({
			models: async () => [
				{ components: [{ purl: `${purl}#root` }, { purl: purl.toUpperCase() }, { purl: "external:internal" }, { purl: "pkg:npm/dependency" }] },
				{ components: [{ purl }, { purl: "pkg:github/test/unaudited" }] },
			],
			verified: async () => [saved, { ...saved, repoKey: "pkg:github/test/unrelated" }],
		});
		expect(result.map((repo) => repo.repoKey)).toEqual([purl, "pkg:github/test/unaudited"]);
		expect(result[0]?.modelCount).toBe(2);
		expect(result[0]?.inventorySource).toBe("model-audits");
		expect(result[0]?.packages[0]?.constructs[0]?.graphNodeIds).toEqual([]);
		expect(result[0]?.packages[0]?.constructs[0]?.span?.contentHash).toBe("saved-hash");
		expect(result[1]?.packages).toEqual([]);
	});

	test("does not load audited inventories at all when no model references a repository", async () => {
		const result = await listConstructRepositories({
			models: async () => [{ components: [{ purl: "external:internal" }] }],
			verified: async () => { throw new Error("Must not read unrelated audits or graphs."); },
		});
		expect(result).toEqual([]);
	});

	test("lists graph-only symbols, groups by deepest package, and treats model links as optional metadata", async () => {
		const [result] = await listConstructInventory(undefined, {
			listRepos: async () => [repo()],
			associations: async () => new Map([[`${purl}\0root.ts\0rootFunction`, [
				{ modelId: "one", modelTitle: "One", alias: "root" },
				{ modelId: "two", modelTitle: "Two", alias: "shared" },
			]]]),
			loadPackages: async () => ({
				isMonorepo: true,
				packages: [{ path: "", name: "root" }, { path: "packages", name: "outer" }, { path: "packages/nested", name: "nested" }],
			}),
		});
		expect(result?.coverage.verified).toBe(2);
		expect(result?.packages.map((pkg) => pkg.path)).toEqual(["", "packages/nested"]);
		const rootSymbol = result?.packages[0]?.constructs[0]!;
		const nestedSymbol = result?.packages[1]?.constructs[0]!;
		expect(rootSymbol.models).toHaveLength(2);
		expect(nestedSymbol.models).toEqual([]);
		expect(nestedSymbol.packageRelativeFile).toBe("value.ts");
		expect(nestedSymbol.file).toBe("packages/nested/value.ts");
		expect(nestedSymbol.verification.status).toBe("verified");
	});

	test("keeps registered repositories visible but never uses an older graph as the current inventory", async () => {
		const stale = repo({ status: "missing" });
		stale.cached = { ...stale.cached!, matchesCurrent: false, graphJsonPath: join(root, "nonexistent.json") };
		const result = await listConstructInventory(undefined, {
			listRepos: async () => [stale, repo({ purl: "pkg:github/test/new", status: "building", cached: null })],
			associations: async () => new Map(),
			loadPackages: async () => { throw new Error("Must not discover packages for a missing graph."); },
		});
		expect(result).toHaveLength(2);
		expect(result[0]?.graphStatus).toBe("missing");
		expect(result[0]?.packages).toEqual([]);
		expect(result[0]?.error).toBeUndefined();
		expect(result[1]?.graphStatus).toBe("building");
		expect(result[1]?.packages).toEqual([]);
	});

	test("surfaces a broken graph without hiding other repositories or claiming zero-symbol coverage", async () => {
		const broken = repo();
		broken.cached = { ...broken.cached!, graphJsonPath: join(root, "missing.json") };
		const result = await listConstructInventory(undefined, {
			listRepos: async () => [broken, repo()],
			associations: async () => new Map(),
			loadPackages: async () => null,
		});
		expect(result[0]?.error).toContain("Could not load or verify");
		expect(result[1]?.coverage.verified).toBe(2);
		expect(result[1]?.packages).toHaveLength(1);
	});

	test("passes the selected PURL to discovery instead of checking every registered checkout", async () => {
		let selected: string | undefined;
		await listConstructInventory(undefined, {
			listRepos: async (_root, _building, onlyPurl) => { selected = onlyPurl; return []; },
		}, purl);
		expect(selected).toBe(purl);
	});
});

function inventory(repoKey = purl): ConstructInventoryRepo {
	return {
		repoKey, owner: "test", name: "inventory", graphStatus: "ready",
		packages: [], hasPackageInfo: false, isMonorepo: false,
		coverage: { verified: 0, unresolved: 0, unsupported: 0, error: 0 },
	};
}

describe("background selected-repository inventory", () => {
	test("passive inventory RPC reads never start a graph verification job", async () => {
		let calls = 0;
		const service = new ConstructInventoryService(async () => { calls++; return inventory(); });
		expect(service.peek(purl)).toEqual({ loading: false, repo: undefined, error: undefined });
		await service.wait();
		expect(calls).toBe(0);
	});

	test("returns immediately, deduplicates work and caches only until the next freshness check", async () => {
		let now = 1;
		let calls = 0;
		let release!: () => void;
		const gate = new Promise<void>((resolve) => { release = resolve; });
		const service = new ConstructInventoryService(async () => { calls++; await gate; return inventory(); }, () => now);
		expect(service.get(purl).loading).toBe(true);
		expect(calls).toBe(0);
		expect(service.get(purl).loading).toBe(true);
		await Promise.resolve();
		expect(calls).toBe(1);
		release();
		await service.wait();
		expect(service.get(purl).loading).toBe(false);
		expect(calls).toBe(1);
		now += 15_001;
		expect(service.get(purl).loading).toBe(true);
		await service.wait();
		expect(calls).toBe(2);
		service.invalidate(purl);
		expect(service.get(purl).loading).toBe(true);
		await service.wait();
		expect(calls).toBe(3);
	});

	test("bounds concurrency and replaces obsolete queued selections", async () => {
		const calls: string[] = [];
		let release!: () => void;
		const gate = new Promise<void>((resolve) => { release = resolve; });
		const service = new ConstructInventoryService(async (key) => {
			calls.push(key);
			if (key === purl) await gate;
			return inventory(key);
		});
		service.get(purl);
		service.get("pkg:github/test/obsolete");
		service.get("pkg:github/test/current");
		await Promise.resolve();
		expect(calls).toEqual([purl]);
		release();
		await service.wait();
		expect(calls).toEqual([purl, "pkg:github/test/current"]);
		expect(service.get("pkg:github/test/current").loading).toBe(false);
	});

	test("does not treat a change event during verification as a fresh completed inventory", async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => { release = resolve; });
		const service = new ConstructInventoryService(async () => { await gate; return inventory(); });
		service.get(purl);
		await Promise.resolve();
		service.invalidate(purl);
		release();
		await service.wait();
		expect(service.get(purl).loading).toBe(true);
		await service.wait();
		expect(service.get(purl).loading).toBe(false);
	});

	test("drops queued work when the user returns to the active repository", async () => {
		const calls: string[] = [];
		let release!: () => void;
		const gate = new Promise<void>((resolve) => { release = resolve; });
		const service = new ConstructInventoryService(async (key) => {
			calls.push(key); await gate; return inventory(key);
		});
		service.get(purl);
		service.get("pkg:github/test/obsolete");
		service.get(purl);
		release();
		await service.wait();
		expect(calls).toEqual([purl]);
	});

	test("reports a background operational failure instead of claiming an empty inventory", async () => {
		const service = new ConstructInventoryService(async () => { throw new Error("fixture failure"); });
		service.get(purl);
		await service.wait();
		const result = service.get(purl);
		expect(result.loading).toBe(false);
		expect(result.repo).toBeUndefined();
		expect(result.error).toContain("Could not load");
	});
});

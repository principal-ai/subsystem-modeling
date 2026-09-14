import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
	cachedPackagesJsonPath,
	ensureCurrentPackageCachesForModel,
	ensurePackageLayers,
	getCachedPackageLayers,
	packageLayerCacheSlotDir,
} from "./package-layer-store";
import { cacheSlotKey } from "./graphify-store";
import {
	runPackageLayerDiscover,
	walkRepoFiles,
} from "./package-layer-runner";

function initRepo(): string {
	const dir = mkdtempSync(join(tmpdir(), "pkg-layers-"));
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
	writeFileSync(
		join(dir, "package.json"),
		JSON.stringify(
			{
				name: "@acme/root",
				version: "1.0.0",
				private: true,
				workspaces: ["packages/*"],
			},
			null,
			2,
		),
	);
	mkdirSync(join(dir, "packages", "core"), { recursive: true });
	writeFileSync(
		join(dir, "packages", "core", "package.json"),
		JSON.stringify(
			{
				name: "@acme/core",
				version: "0.1.0",
				dependencies: { lodash: "^4.0.0" },
			},
			null,
			2,
		),
	);
	writeFileSync(join(dir, "packages", "core", "index.ts"), "export const x = 1;\n");
	run(["add", "."]);
	run(["commit", "-m", "init"]);
	return dir;
}

describe("walkRepoFiles", () => {
	test("finds package.json manifests and skips node_modules", async () => {
		const dir = initRepo();
		mkdirSync(join(dir, "node_modules", "lodash"), { recursive: true });
		writeFileSync(
			join(dir, "node_modules", "lodash", "package.json"),
			JSON.stringify({ name: "lodash" }),
		);
		const files = await walkRepoFiles(dir);
		const paths = files.map((f) => f.path);
		expect(paths).toContain("package.json");
		expect(paths).toContain("packages/core/package.json");
		expect(paths.some((p) => p.startsWith("node_modules/"))).toBe(false);
	});
});

describe("runPackageLayerDiscover", () => {
	test("discovers root + workspace packages", async () => {
		const dir = initRepo();
		const result = await runPackageLayerDiscover({ repoRoot: dir });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.packageCount).toBeGreaterThanOrEqual(2);
		expect(result.data.summary.isMonorepo).toBe(true);
		const names = result.data.packages.map((p) => p.packageData.name);
		expect(names).toContain("@acme/root");
		expect(names).toContain("@acme/core");
	});
});

describe("package layer cache paths", () => {
	test("nest under store root by purl dir + slot", () => {
		const root = "/tmp/pkg-store";
		expect(
			packageLayerCacheSlotDir("pkg:github/a/b", "abc123", null, root),
		).toBe(join(root, "github-a-b", "abc123"));
		expect(
			cachedPackagesJsonPath("pkg:github/a/b", "abc123", "d4f8", root),
		).toBe(join(root, "github-a-b", "abc123+d4f8", "packages.json"));
	});
});

describe("getCachedPackageLayers", () => {
	test("returns null when slot missing", async () => {
		const root = mkdtempSync(join(tmpdir(), "pkg-store-"));
		const hit = await getCachedPackageLayers("pkg:github/nope/missing", {
			headSha: "deadbeef",
			dirtyHash: null,
			storeRoot: root,
		});
		expect(hit).toBeNull();
	});

	test("reads meta when dirty slot present", async () => {
		const root = mkdtempSync(join(tmpdir(), "pkg-store-"));
		const purl = "pkg:github/a/b";
		const head = "abc123def";
		const dirty = "d4f8e1a2b3c4d5e6";
		const slot = packageLayerCacheSlotDir(purl, head, dirty, root);
		mkdirSync(slot, { recursive: true });
		writeFileSync(
			join(slot, "packages.json"),
			JSON.stringify({
				packages: [],
				summary: {
					isMonorepo: false,
					totalPackages: 0,
					workspacePackages: [],
					totalDependencies: 0,
					totalDevDependencies: 0,
					availableScripts: [],
				},
			}),
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
				packageCount: 0,
				isMonorepo: false,
			}),
		);
		const hit = await getCachedPackageLayers(purl, {
			headSha: head,
			dirtyHash: dirty,
			storeRoot: root,
		});
		expect(hit?.meta.packageCount).toBe(0);
		expect(hit?.meta.dirtyHash).toBe(dirty);
		expect(hit?.path).toBe(join(slot, "packages.json"));
	});
});

describe("ensurePackageLayers", () => {
	test("builds then hits cache", async () => {
		const dir = initRepo();
		const storeRoot = mkdtempSync(join(tmpdir(), "pkg-ensure-"));
		const purl = "pkg:github/acme/widget";

		const built = await ensurePackageLayers({
			purl,
			repoRoot: dir,
			storeRoot,
		});
		expect(built.ok).toBe(true);
		if (!built.ok) return;
		expect(built.status).toBe("built");
		expect(built.packageCount).toBeGreaterThanOrEqual(2);
		expect(built.isMonorepo).toBe(true);

		const hit = await ensurePackageLayers({
			purl,
			repoRoot: dir,
			storeRoot,
		});
		expect(hit.ok).toBe(true);
		if (!hit.ok) return;
		expect(hit.status).toBe("hit");
		expect(hit.slotKey).toBe(built.slotKey);
		expect(hit.packagesJsonPath).toBe(built.packagesJsonPath);
	});

	test("force rebuilds", async () => {
		const dir = initRepo();
		const storeRoot = mkdtempSync(join(tmpdir(), "pkg-force-"));
		const purl = "pkg:github/acme/widget";

		const first = await ensurePackageLayers({
			purl,
			repoRoot: dir,
			storeRoot,
		});
		expect(first.ok).toBe(true);

		const forced = await ensurePackageLayers({
			purl,
			repoRoot: dir,
			storeRoot,
			force: true,
		});
		expect(forced.ok).toBe(true);
		if (!forced.ok) return;
		expect(forced.status).toBe("built");
	});
});

describe("ensureCurrentPackageCachesForModel", () => {
	test("ensures distinct component purls", async () => {
		const dir = initRepo();
		const storeRoot = mkdtempSync(join(tmpdir(), "pkg-model-"));
		const purl = "pkg:github/acme/widget";
		const r = await ensureCurrentPackageCachesForModel(
			{
				components: [
					{ purl, construct: "function" },
					{ purl, construct: "class" },
					{ purl: "pkg:github/other/missing", construct: "function" },
					{ purl, construct: "external" },
				],
				repoRoots: { [purl]: dir },
			},
			{ storeRoot },
		);
		expect(r.ensured).toContain(purl);
		expect(r.failed.some((f) => f.purl.includes("other/missing"))).toBe(true);
	});
});

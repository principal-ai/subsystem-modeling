import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
	createSubsystemModel,
	fileDeclaresSymbol,
	getSubsystemModel,
	graphIdFromWatchFilename,
	migrateLegacySubsystemGraphsDir,
	normalizeDeclarationProvenance,
	purlRepoKey,
	resolveRepoRootForComponent,
	shouldRestampOpened,
	stampVerifiedCommits,
	SUBSYSTEM_DECLARATION_PROVENANCES,
	SUBSYSTEM_EDGE_MECHANISMS,
	SUBSYSTEM_EDGE_MECHANISMS_COVER_PUBLISHED_UNION,
	subsystemModelFilePath,
	updateSubsystemModel,
	verifyModelFiles,
	type SubsystemComponent,
	type SubsystemWalkthroughStep,
} from "./subsystem-model-store";
import { registerProjectInAlexandria } from "./alexandria";

let tmp: string;
let repoA: string;
let repoB: string;

beforeAll(() => {
	tmp = mkdtempSync(join(tmpdir(), "sgverify-"));
	// Resolution is Alexandria-backed: point the registry at a temp home and
	// register the fixture checkouts so purls resolve to them.
	process.env["PRINCIPAL_ALEXANDRIA_HOME"] = tmp;
	repoA = join(tmp, "repo-a");
	repoB = join(tmp, "repo-b");
	mkdirSync(join(repoA, "src"), { recursive: true });
	mkdirSync(join(repoB, "deep"), { recursive: true });
	writeFileSync(join(repoA, "exists.ts"), "export {};\n", "utf8");
	writeFileSync(
		join(repoA, "src", "seam.ts"),
		["function a() {}", "const store = createStore();", "writer(store, a());", ""].join("\n"),
		"utf8",
	);
	writeFileSync(
		join(repoA, "declares.ts"),
		[
			"import { helper } from './helper';",
			"export async function exportedFn() {}",
			"function privateFn() {}",
			"export const STORE = createAnalysisStore();",
			"export class Widget {}",
			"interface Shape { a: number }",
			"type Alias = string;",
			"// buildAgentSessionsView mentioned in a comment",
			"callSite(buildAgentSessionsView);",
		].join("\n"),
		"utf8",
	);
	writeFileSync(join(repoB, "deep", "other.py"), "x = 1\n", "utf8");
	// repoA is a real git checkout so commit-provenance capture has a HEAD.
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
	registerProjectInAlexandria(repoA, "https://github.com/a/repo-a.git");
	registerProjectInAlexandria(repoB, "https://github.com/a/repo-b.git");
	// Keep the model store (create / stamp writes) in the temp home too.
	process.env["PRINCIPAL_SUBSYSTEM_MODELS_HOME"] = tmp;
});

afterAll(() => {
	rmSync(tmp, { recursive: true, force: true });
	delete process.env["PRINCIPAL_ALEXANDRIA_HOME"];
	delete process.env["PRINCIPAL_SUBSYSTEM_MODELS_HOME"];
});

describe("purlRepoKey (store mirror)", () => {
	test("strips fragments", () => {
		expect(purlRepoKey("pkg:github/a/b#src/x.ts")).toBe("pkg:github/a/b");
	});
});

describe("graphIdFromWatchFilename", () => {
	test("maps graph json files and ignores index / junk", () => {
		expect(graphIdFromWatchFilename("sg-1-abc.json")).toBe("sg-1-abc");
		expect(graphIdFromWatchFilename("_index.json")).toBeNull();
		expect(graphIdFromWatchFilename("readme.md")).toBeNull();
		expect(graphIdFromWatchFilename(null)).toBeNull();
	});
});

describe("shouldRestampOpened", () => {
	test("stamps on first open", () => {
		expect(shouldRestampOpened(undefined, Date.now())).toBe(true);
	});

	test("suppresses re-stamps inside the window (focus clicks)", () => {
		const now = Date.now();
		expect(shouldRestampOpened(new Date(now - 5_000).toISOString(), now)).toBe(false);
	});

	test("restamps once the suppress window elapses", () => {
		const now = Date.now();
		expect(shouldRestampOpened(new Date(now - 60_000).toISOString(), now)).toBe(true);
	});

	test("treats unparseable stamps as never opened", () => {
		expect(shouldRestampOpened("not-a-date", Date.now())).toBe(true);
	});
});

describe("subsystemModelFilePath", () => {
	test("resolves under ~/.principal/subsystem-models", () => {
		const p = subsystemModelFilePath("sg-1-abc");
		expect(p.endsWith("/.principal/subsystem-models/sg-1-abc.json")).toBe(true);
	});
});

describe("migrateLegacySubsystemGraphsDir", () => {
	test("moves json files from legacy dir into empty target", async () => {
		const base = mkdtempSync(join(tmpdir(), "sg-migrate-"));
		const legacyRoot = join(base, "subsystem-graphs");
		const root = join(base, "subsystem-models");
		mkdirSync(legacyRoot, { recursive: true });
		writeFileSync(join(legacyRoot, "sg-1.json"), '{"id":"sg-1"}', "utf8");
		writeFileSync(join(legacyRoot, "_index.json"), '{"version":1,"entries":[]}', "utf8");

		const moved = await migrateLegacySubsystemGraphsDir({ legacyRoot, root });
		expect(moved).toBe(true);
		expect(existsSync(join(root, "sg-1.json"))).toBe(true);
		expect(existsSync(join(root, "_index.json"))).toBe(true);
		expect(existsSync(legacyRoot)).toBe(false);
		rmSync(base, { recursive: true, force: true });
	});

	test("leaves legacy alone when target already has models", async () => {
		const base = mkdtempSync(join(tmpdir(), "sg-migrate-skip-"));
		const legacyRoot = join(base, "subsystem-graphs");
		const root = join(base, "subsystem-models");
		mkdirSync(legacyRoot, { recursive: true });
		mkdirSync(root, { recursive: true });
		writeFileSync(join(legacyRoot, "sg-old.json"), "{}", "utf8");
		writeFileSync(join(root, "sg-new.json"), "{}", "utf8");

		const moved = await migrateLegacySubsystemGraphsDir({ legacyRoot, root });
		expect(moved).toBe(false);
		expect(existsSync(join(legacyRoot, "sg-old.json"))).toBe(true);
		rmSync(base, { recursive: true, force: true });
	});
});

describe("resolveRepoRootForComponent", () => {
	test("resolves a component purl to its Alexandria checkout", () => {
		expect(resolveRepoRootForComponent("pkg:github/a/repo-a#src/x.ts")).toBe(repoA);
		expect(resolveRepoRootForComponent("pkg:github/a/repo-b")).toBe(repoB);
	});

	test("returns undefined for unregistered repos and empty purls", () => {
		expect(resolveRepoRootForComponent("pkg:github/a/never-registered")).toBeUndefined();
		expect(resolveRepoRootForComponent(undefined)).toBeUndefined();
	});
});

describe("verifyModelFiles", () => {
	test("buckets components into verified / missing / unresolved", async () => {		const result = await verifyModelFiles({
			components: [
				{ alias: "a1", name: "A", construct: "function", file: "exists.ts", purl: "pkg:github/a/repo-a" },
				{ alias: "b1", name: "B", construct: "function", file: "deep/other.py", purl: "pkg:github/a/repo-b" },
				{ alias: "m1", name: "M", construct: "function", file: "nope.ts", purl: "pkg:github/a/repo-a" },
				{ alias: "u1", name: "U", construct: "function", file: "somewhere.ts", purl: "pkg:github/a/repo-remote" },
				{ alias: "f1", name: "F", construct: "function", file: "", purl: "pkg:github/a/repo-a" },
			],
			relations: [],
		});

		expect(result.verifiedCount).toBe(2);
		expect(result.missingCount).toBe(1);
		expect(result.unresolvedCount).toBe(1);
		expect(result.missing).toEqual([{ componentAlias: "m1", file: "nope.ts" }]);
	});
});

describe("fileDeclaresSymbol", () => {
	test("matches declarations across keyword forms", () => {
		const src = "export async function exportedFn() {}\nfunction privateFn() {}\nconst STORE = 1;\nclass Widget {}\ninterface Shape {}\ntype Alias = string;";
		for (const sym of ["exportedFn", "privateFn", "STORE", "Widget", "Shape", "Alias"]) {
			expect(fileDeclaresSymbol(src, sym)).toBe(true);
		}
	});

	test("does not count mentions, imports, or call sites", () => {
		const src = "import { helper } from './h';\n// helper documented here\nrun(helper);";
		expect(fileDeclaresSymbol(src, "helper")).toBe(false);
	});

	test("qualified symbols match on their last segment", () => {
		expect(fileDeclaresSymbol("function openSessionEventsTab() {}", "host.openSessionEventsTab")).toBe(true);
	});

	test("empty or whitespace-only symbols never verify", () => {
		expect(fileDeclaresSymbol("function f() {}", "")).toBe(false);
		expect(fileDeclaresSymbol("function f() {}", "   ")).toBe(false);
	});

	test("regex metacharacters in symbol names are escaped", () => {
		expect(fileDeclaresSymbol("const we$ird = 1;", "we$ird")).toBe(true);
		expect(fileDeclaresSymbol("const plain = 1;", "we$ird")).toBe(false);
	});
});

describe("verifyModelFiles symbol pass", () => {
	test("no longer text-checks symbols (graphify owns that)", async () => {
		const result = await verifyModelFiles({
			components: [
				{ alias: "ok-exported", name: "A", construct: "function", file: "declares.ts", purl: "pkg:github/a/repo-a", symbol: "exportedFn" },
				{ alias: "ok-private", name: "B", construct: "function", file: "declares.ts", purl: "pkg:github/a/repo-a", symbol: "privateFn" },
				{ alias: "ok-qualified", name: "C", construct: "class", file: "declares.ts", purl: "pkg:github/a/repo-a", symbol: "ns.Widget" },
				{ alias: "bad-symbol", name: "D", construct: "function", file: "declares.ts", purl: "pkg:github/a/repo-a", symbol: "notDeclaredAnywhere" },
				{ alias: "mention-only", name: "E", construct: "function", file: "declares.ts", purl: "pkg:github/a/repo-a", symbol: "buildAgentSessionsView" },
				{ alias: "no-symbol", name: "F", construct: "function", file: "exists.ts", purl: "pkg:github/a/repo-a" },
			],
			relations: [],
		});

		expect(result.verifiedCount).toBe(6);
		expect(result.symbolsVerified).toBe(0);
		expect(result.symbolsMissing).toEqual([]);
	});
});

describe("declaration provenance", () => {
	const fnDetail = { kind: "function" as const, parameters: [], callers: [], callees: [] };

	test("pins the provenance set", () => {
		expect([...SUBSYSTEM_DECLARATION_PROVENANCES]).toEqual(["verified", "authored"]);
	});

	test("normalize defaults missing provenance to authored and strips orphan claims", () => {
		const components = [
			{ alias: "a", declaration: fnDetail }, // -> authored
			{ alias: "b", declarationProvenance: "verified", other: 1 }, // no declaration -> stripped
			{ alias: "c", declaration: fnDetail, declarationProvenance: "verified" }, // untouched
		];
		normalizeDeclarationProvenance(components);
		expect(components[0]["declarationProvenance"]).toBe("authored");
		expect(components[1]["declarationProvenance"]).toBeUndefined();
		expect(components[2]["declarationProvenance"]).toBe("verified");
	});

	test("normalize backfills per-construct arrays the published renderer requires", () => {
		const components = [
			{ alias: "f", declaration: { kind: "function", parameters: [{ name: "id", type: "string" }] } },
			{ alias: "c", declaration: { kind: "class", methods: [] } },
			{ alias: "t", declaration: { kind: "type" } },
			{ alias: "e", declaration: { kind: "custom_entity" } },
		];
		normalizeDeclarationProvenance(components);
		const d = (alias: string) =>
			(components.find((x) => x["alias"] === alias)?.["declaration"] ?? {}) as Record<string, unknown>;
		expect(Object.keys(d("f"))).toContain("callers");
		expect(d("f")["callees"]).toEqual([]);
		expect(d("c")["extends"]).toEqual([]);
		expect(d("c")["references"]).toEqual([]);
		expect(d("t")["usedBy"]).toEqual([]);
		expect(d("e")["attributes"]).toEqual([]);
		// existing arrays are never overwritten
		expect(d("f")["parameters"]).toEqual([{ name: "id", type: "string" }]);
	});

	test("verification counts details by provenance", async () => {
		// `declarationProvenance` ships in the next @principal-ai/subsystems-react
		// publish; until then the store treats it as payload-level JSON, so the
		// fixture is typed loosely here.
		const components = [
			{ alias: "v1", name: "V1", construct: "function", file: "declares.ts", purl: "pkg:github/a/repo-a", symbol: "exportedFn", declaration: fnDetail, declarationProvenance: "verified" },
			{ alias: "a1", name: "A1", construct: "function", file: "declares.ts", purl: "pkg:github/a/repo-a", symbol: "privateFn", declaration: fnDetail },
		] as unknown as Parameters<typeof verifyModelFiles>[0]["components"];
		const result = await verifyModelFiles({
			components,
			relations: [],
		});
		expect(result.declarationsVerified).toBe(1);
		expect(result.declarationsAuthored).toBe(1); // defaulted from missing
	});
});

describe("relation and walkthrough mechanism sets", () => {
	test("pins the combined edge-mechanism union for drift checks", () => {
		expect([...SUBSYSTEM_EDGE_MECHANISMS]).toEqual([
			"extends",
			"inherits",
			"implements",
			"mixes_in",
			"method",
			"calls",
			"uses",
			"feeds",
			"produces",
			"writes",
			"reads",
			"watches",
			"registers-into",
		]);
		expect(SUBSYSTEM_EDGE_MECHANISMS_COVER_PUBLISHED_UNION).toBe(true);
	});
});

describe("walkthrough verify pass", () => {
	test("resolves steps to real site lines and flags stuck/blank/misfit sites", async () => {
		// `src/seam.ts` lives in the registered repo-a checkout (see beforeAll).
		const components: SubsystemComponent[] = [
			{ alias: "a", name: "a", construct: "function", symbol: "a", file: "src/seam.ts", purl: "pkg:github/a/repo-a" },
			{ alias: "store", name: "store", construct: "store", file: "src/seam.ts", purl: "pkg:github/a/repo-a" },
		];
		const result = await verifyModelFiles({
			components,
			relations: [],
			walkthroughs: [
				{
					id: "wt",
					title: "save",
					steps: [
						{ from: "a", to: "store", mechanism: "calls", file: "src/seam.ts", line: 3, purl: "pkg:github/a/repo-a#src/seam.ts", symbol: "a" },
						{ from: "a", to: "store", mechanism: "calls", file: "src/seam.ts", line: 999, purl: "pkg:github/a/repo-a#src/seam.ts", symbol: "a" },
						{ from: "a", to: "store", mechanism: "calls", file: "src/nope.ts", line: 1, purl: "pkg:github/a/repo-a#src/nope.ts", symbol: "a" },
						{ from: "a", to: "store", mechanism: "calls", file: "src/seam.ts", line: 4, purl: "pkg:github/a/repo-a#src/seam.ts", symbol: "a" },
					],
				},
				{
					// Legacy graph: step purls predate the requirement, so the
					// endpoint purl fallback resolves the site instead.
					id: "wt-legacy",
					title: "legacy",
					steps: [
						{ from: "a", to: "store", mechanism: "calls", file: "src/seam.ts", line: 3, symbol: "a" } as SubsystemWalkthroughStep,
					],
				},
			],
		});

		expect(result.walkthroughsChecked).toBe(2);
		const reasons = result.walkthroughsFailed.map((f) => f.reason);
		expect(reasons.some((r) => r.includes("out of range"))).toBe(true);
		expect(reasons.some((r) => r.includes("not found"))).toBe(true);
		expect(reasons.some((r) => r.includes("blank"))).toBe(true);
	});
});

describe("commit provenance", () => {
	const KEY = "pkg:github/a/repo-a";
	const components: SubsystemComponent[] = [
		{
			alias: "a",
			name: "a",
			construct: "function",
			symbol: "a",
			file: "exists.ts",
			purl: `${KEY}#exists.ts`,
		},
	];

	test("create captures createdAtCommits for each purl, immutable across updates", async () => {
		const created = await createSubsystemModel({
			title: "prov",
			components,
			relations: [],
		});
		const commits = created.createdAtCommits ?? {};
		expect(commits[KEY]).toMatch(/^[0-9a-f]{40}$/);
		expect(created.verifiedAtCommits).toBeUndefined();

		const updated = await updateSubsystemModel(created.id, {
			description: "edit",
		});
		expect(updated?.createdAtCommits).toEqual(commits);
	});

	test("stampVerifiedCommits records verified pins; update preserves them", async () => {
		const created = await createSubsystemModel({
			title: "prov2",
			components,
			relations: [],
		});
		const pin = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
		const stamped = await stampVerifiedCommits(created.id, { [KEY]: pin });
		expect(stamped?.verifiedAtCommits).toEqual({ [KEY]: pin });

		const updated = await updateSubsystemModel(created.id, {
			description: "edit again",
		});
		expect(updated?.verifiedAtCommits).toEqual({ [KEY]: pin });
		expect(updated?.createdAtCommits).toEqual(created.createdAtCommits);
	});

	test("legacy records without the fields read cleanly as unpinned", async () => {
		const legacyDir = join(tmp, ".principal", "subsystem-models");
		mkdirSync(legacyDir, { recursive: true });
		writeFileSync(
			join(legacyDir, "sg-legacy-1.json"),
			JSON.stringify({
				id: "sg-legacy-1",
				title: "legacy",
				components,
				relations: [],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			}),
			"utf8",
		);
		const read = await getSubsystemModel("sg-legacy-1");
		expect(read).not.toBeNull();
		expect(read?.createdAtCommits).toBeUndefined();
		expect(read?.verifiedAtCommits).toBeUndefined();
	});
});


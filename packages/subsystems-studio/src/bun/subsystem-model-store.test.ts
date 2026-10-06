import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
	createSubsystemModel,
	getSubsystemModel,
	graphIdFromWatchFilename,
	isRepoPurl,
	modelIdentityKey,
	normalizeDeclarationProvenance,
	normalizeModelTitle,
	purlRepoKey,
	resolveRepoRootForComponent,
	shouldRestampOpened,
	stampVerifiedCommits,
	SUBSYSTEM_DECLARATION_PROVENANCES,
	SUBSYSTEM_EDGE_MECHANISMS,
	SUBSYSTEM_EDGE_MECHANISMS_COVER_PUBLISHED_UNION,
	subsystemModelFilePath,
	updateSubsystemModel,
	upsertSubsystemModel,
	verifyModelFiles,
	type SubsystemComponent,
	type SubsystemTrailStep,
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

describe("resolveRepoRootForComponent", () => {
	test("resolves a component purl to its Alexandria checkout", () => {
		expect(resolveRepoRootForComponent("pkg:github/a/repo-a#src/x.ts")).toBe(repoA);
		expect(resolveRepoRootForComponent("pkg:github/a/repo-b")).toBe(repoB);
	});

	test("returns undefined for unregistered repos and empty purls", () => {
		expect(resolveRepoRootForComponent("pkg:github/a/never-registered")).toBeUndefined();
		expect(resolveRepoRootForComponent(undefined)).toBeUndefined();
	});

	test("returns undefined for internal / non-repo purls", () => {
		expect(
			resolveRepoRootForComponent("external:file:~/.principal/subsystem-models"),
		).toBeUndefined();
		expect(resolveRepoRootForComponent("external:proposed")).toBeUndefined();
	});
});

describe("isRepoPurl", () => {
	test("is true only for pkg:github repos", () => {
		expect(isRepoPurl("pkg:github/a/b#src/x.ts")).toBe(true);
		expect(isRepoPurl("pkg:github/A/B")).toBe(true);
	});

	test("is false for internal / pseudo purls", () => {
		expect(isRepoPurl("external:file:~/.principal/subsystem-models")).toBe(false);
		expect(isRepoPurl("external:proposed")).toBe(false);
		expect(isRepoPurl("pkg:npm/lodash")).toBe(false);
		expect(isRepoPurl(undefined)).toBe(false);
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
		});

		expect(result.verifiedCount).toBe(2);
		expect(result.missingCount).toBe(1);
		expect(result.unresolvedCount).toBe(1);
		expect(result.missing).toEqual([{ componentAlias: "m1", file: "nope.ts" }]);
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
		});

		expect(result.verifiedCount).toBe(6);
		expect(result.symbolsVerified).toBe(0);
		expect(result.symbolsMissing).toEqual([]);
	});
});

describe("declaration provenance", () => {
	const fnDetail = { kind: "function" as const, parameters: [] };

	test("pins the provenance set", () => {
		expect([...SUBSYSTEM_DECLARATION_PROVENANCES]).toEqual(["verified", "authored"]);
	});

	test("normalize leaves provenance alone", () => {
		// A declaration with no provenance is valid — both fields are optional on
		// a component — and an unrecognised value is the schema's problem to
		// report, not something to silently relabel as hand-written.
		const components = [
			{ alias: "a", declaration: fnDetail },
			{ alias: "c", declaration: fnDetail, declarationProvenance: "verified" },
		];
		normalizeDeclarationProvenance(components);
		expect(components[0]["declarationProvenance"]).toBeUndefined();
		expect(components[1]["declarationProvenance"]).toBe("verified");
	});

	test("normalize is a no-op — no reshaping of caller payloads", () => {
		// The call-graph buckets are gone from the document, so an honest
		// declaration no longer needs padding to satisfy the schema.
		const components = [
			{ alias: "f", declaration: { kind: "function", parameters: [{ name: "id", type: "string" }] } },
			{ alias: "c", declaration: { kind: "class", methods: [] } },
		];
		normalizeDeclarationProvenance(components);
		const d = (alias: string) =>
			(components.find((x) => x["alias"] === alias)?.["declaration"] ?? {}) as Record<string, unknown>;
		expect(Object.keys(d("f"))).toEqual(["kind", "parameters"]);
		expect(d("f")["parameters"]).toEqual([{ name: "id", type: "string" }]);
		expect(Object.keys(d("c"))).toEqual(["kind", "methods"]);
	});

	test("verification counts all declarations as authored (provenance deprecated)", async () => {
		// declarationProvenance is deprecated — verification now tracks at the
		// model level via verifiedAtCommits. All declarations count as authored.
		const components = [
			{ alias: "v1", name: "V1", construct: "function", file: "declares.ts", purl: "pkg:github/a/repo-a", symbol: "exportedFn", declaration: fnDetail, declarationProvenance: "verified" },
			{ alias: "a1", name: "A1", construct: "function", file: "declares.ts", purl: "pkg:github/a/repo-a", symbol: "privateFn", declaration: fnDetail },
		] as unknown as Parameters<typeof verifyModelFiles>[0]["components"];
		const result = await verifyModelFiles({
			components,
		});
		// declarationsVerified is always 0 now (deprecated)
		expect(result.declarationsVerified).toBe(0);
		// Both components have declarations, so both count as authored
		expect(result.declarationsAuthored).toBe(2);
	});
});

describe("edge mechanism sets", () => {
	test("pins the combined edge-mechanism union for drift checks", () => {
		expect([...SUBSYSTEM_EDGE_MECHANISMS]).toEqual([
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

describe("trail verify pass", () => {
	test("resolves steps to real site lines and flags stuck/blank/misfit sites", async () => {
		// `src/seam.ts` lives in the registered repo-a checkout (see beforeAll).
		const components: SubsystemComponent[] = [
			{ alias: "a", name: "a", construct: "function", symbol: "a", file: "src/seam.ts", purl: "pkg:github/a/repo-a" },
			{ alias: "store", name: "store", construct: "store", file: "src/seam.ts", purl: "pkg:github/a/repo-a" },
		];
		const result = await verifyModelFiles({
			components,
			trails: [
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
						{ from: "a", to: "store", mechanism: "calls", file: "src/seam.ts", line: 3, symbol: "a" } as SubsystemTrailStep,
					],
				},
			],
		});

		expect(result.trailsChecked).toBe(2);
		const reasons = result.trailsFailed.map((f) => f.reason);
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

describe("model identity dedup", () => {
	const A = "pkg:github/a/repo-a";
	const B = "pkg:github/a/repo-b";
	const comp = (purl: string, symbol: string): SubsystemComponent => ({
		alias: symbol,
		name: symbol,
		construct: "function",
		symbol,
		file: "exists.ts",
		purl: `${purl}#exists.ts`,
	});

	test("normalizes title case and whitespace", () => {
		expect(normalizeModelTitle("  Audit   Flow ")).toBe("audit flow");
	});

	test("identity key is null only when no purl is referenced", () => {
		expect(modelIdentityKey("x", [{ purl: "external:proposed" }])).toBe(
			`x\u0000external:proposed`,
		);
		expect(modelIdentityKey("x", [{}])).toBeNull();
	});

	test("same title + same repo set folds onto the existing record", async () => {
		const first = await upsertSubsystemModel({
			title: "dedup subject",
			components: [comp(A, "one")],
		});
		expect(first.action).toBe("created");

		const second = await upsertSubsystemModel({
			title: "  Dedup   Subject ",
			components: [comp(A, "one"), comp(A, "two")],
		});
		expect(second.action).toBe("updated");
		expect(second.record.id).toBe(first.record.id);
		expect(second.record.createdAt).toBe(first.record.createdAt);
		expect(second.record.components).toHaveLength(2);
	});

	test("different repo set does not fold", async () => {
		const first = await upsertSubsystemModel({
			title: "repo scoped",
			components: [comp(A, "one")],
		});
		const second = await upsertSubsystemModel({
			title: "repo scoped",
			components: [comp(B, "one")],
		});
		expect(second.action).toBe("created");
		expect(second.record.id).not.toBe(first.record.id);
	});

	test("force always creates a new record", async () => {
		const first = await upsertSubsystemModel({
			title: "forced",
			components: [comp(A, "one")],
		});
		const second = await upsertSubsystemModel(
			{ title: "forced", components: [comp(A, "one")] },
			{ force: true },
		);
		expect(second.action).toBe("created");
		expect(second.record.id).not.toBe(first.record.id);
	});
});


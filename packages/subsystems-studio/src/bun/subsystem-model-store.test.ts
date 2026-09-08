import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	fileDeclaresSymbol,
	findComponentConstructProblems,
	findDetailProvenanceProblems,
	findEdgeMechanismProblems,
	findThroughlineProblems,
	graphIdFromWatchFilename,
	migrateLegacySubsystemGraphsDir,
	normalizeDetailProvenance,
	purlRepoKey,
	resolveRepoRootForComponent,
	shouldRestampOpened,
	SUBSYSTEM_COMPONENT_CONSTRUCTS,
	SUBSYSTEM_DETAIL_PROVENANCES,
	SUBSYSTEM_EDGE_MECHANISMS,
	SUBSYSTEM_EDGE_MECHANISMS_COVER_PUBLISHED_UNION,
	subsystemModelFilePath,
	verifyModelFiles,
	type SubsystemComponent,
	type SubsystemComponentEdge,
} from "./subsystem-model-store";

let tmp: string;
let repoA: string;
let repoB: string;

beforeAll(() => {
	tmp = mkdtempSync(join(tmpdir(), "sgverify-"));
	repoA = join(tmp, "repo-a");
	repoB = join(tmp, "repo-b");
	mkdirSync(repoA, { recursive: true });
	mkdirSync(join(repoB, "deep"), { recursive: true });
	writeFileSync(join(repoA, "exists.ts"), "export {};\n", "utf8");
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
});

afterAll(() => {
	rmSync(tmp, { recursive: true, force: true });
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
	test("multi-repo graphs require an explicit per-repo entry (no cross-repo reads)", () => {
		const graph = {
			repoRoot: "/default/root",
			repoRoots: { "pkg:github/a/b": "/repos/b" },
		};
		expect(resolveRepoRootForComponent(graph, "pkg:github/a/b#src/x.ts")).toBe("/repos/b");
		expect(resolveRepoRootForComponent(graph, "pkg:github/x/y")).toBeUndefined();
		expect(resolveRepoRootForComponent(graph, undefined)).toBeUndefined();
	});

	test("single-repo graphs apply the default root to everyone", () => {
		expect(resolveRepoRootForComponent({ repoRoot: "/only/root" }, "pkg:github/x/y")).toBe("/only/root");
		expect(resolveRepoRootForComponent({ repoRoot: "/only/root" }, undefined)).toBe("/only/root");
	});
});

describe("findEdgeMechanismProblems", () => {
	test("accepts known mechanisms and flags unknown ones", () => {
		expect(SUBSYSTEM_EDGE_MECHANISMS.length).toBeGreaterThan(0);
		expect(findEdgeMechanismProblems([{ id: "e1", from: "a", to: "b", mechanism: "imports" }])).toEqual([]);
		const problems = findEdgeMechanismProblems([
			{ id: "ok", from: "a", to: "b", mechanism: "calls" },
			{ id: "bad", from: "a", to: "b", mechanism: "teleports" },
		]);
		expect(problems).toHaveLength(1);
		expect(problems[0]!).toContain('edge "bad"');
		expect(problems[0]!).toContain("teleports");
	});
});

describe("verifyModelFiles", () => {
	test("buckets components into verified / missing / unresolved", async () => {		const result = await verifyModelFiles({
			components: [
				{ id: "a1", name: "A", construct: "module", file: "exists.ts", purl: "pkg:github/a/repo-a" },
				{ id: "b1", name: "B", construct: "module", file: "deep/other.py", purl: "pkg:github/a/repo-b" },
				{ id: "m1", name: "M", construct: "module", file: "nope.ts", purl: "pkg:github/a/repo-a" },
				{ id: "u1", name: "U", construct: "module", file: "somewhere.ts", purl: "pkg:github/a/repo-remote" },
				{ id: "f1", name: "F", construct: "module", file: "", purl: "pkg:github/a/repo-a" },
			],
			edges: [],
			repoRoot: repoA,
			repoRoots: {
				"pkg:github/a/repo-a": repoA,
				"pkg:github/a/repo-b": repoB,
			},
		});

		expect(result.verifiedCount).toBe(2);
		expect(result.missingCount).toBe(1);
		expect(result.unresolvedCount).toBe(1);
		expect(result.missing).toEqual([{ componentId: "m1", file: "nope.ts" }]);
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
		expect(fileDeclaresSymbol("function analyzeSessionInBackground() {}", "host.analyzeSessionInBackground")).toBe(true);
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
	test("counts declared symbols and lists undeclared ones", async () => {
		const result = await verifyModelFiles({
			components: [
				{ id: "ok-exported", name: "A", construct: "function", file: "declares.ts", purl: "pkg:github/a/repo-a", symbol: "exportedFn" },
				{ id: "ok-private", name: "B", construct: "function", file: "declares.ts", purl: "pkg:github/a/repo-a", symbol: "privateFn" },
				{ id: "ok-qualified", name: "C", construct: "class", file: "declares.ts", purl: "pkg:github/a/repo-a", symbol: "ns.Widget" },
				{ id: "bad-symbol", name: "D", construct: "function", file: "declares.ts", purl: "pkg:github/a/repo-a", symbol: "notDeclaredAnywhere" },
				{ id: "mention-only", name: "E", construct: "function", file: "declares.ts", purl: "pkg:github/a/repo-a", symbol: "buildAgentSessionsView" },
				{ id: "no-symbol", name: "F", construct: "module", file: "exists.ts", purl: "pkg:github/a/repo-a" },
			],
			edges: [],
			repoRoots: { "pkg:github/a/repo-a": repoA },
		});

		expect(result.verifiedCount).toBe(6);
		expect(result.symbolsVerified).toBe(3);
		expect(result.symbolsMissing.map((m) => m.componentId).sort()).toEqual(["bad-symbol", "mention-only"]);
	});
});

describe("detail provenance", () => {
	const fnDetail = { construct: "function" as const, parameters: [], callers: [], callees: [] };

	test("pins the provenance set", () => {
		expect([...SUBSYSTEM_DETAIL_PROVENANCES]).toEqual(["verified", "authored"]);
	});

	test("accepts explicit verified/authored, flags anything else", () => {
		const ok = [
			{ id: "a", detail: fnDetail, detailProvenance: "verified" },
			{ id: "b", detail: fnDetail, detailProvenance: "authored" },
			{ id: "c" }, // no detail at all
		];
		expect(findDetailProvenanceProblems(ok)).toEqual([]);
		const bad = [
			{ id: "x", detail: fnDetail, detailProvenance: "graphify" },
			{ id: "y", detail: fnDetail, detailProvenance: 42 },
		];
		expect(findDetailProvenanceProblems(bad)).toHaveLength(2);
		expect(findDetailProvenanceProblems(bad)[0]).toContain('"graphify"');
		expect(findDetailProvenanceProblems(undefined)).toEqual([]);
	});

	test("normalize defaults missing provenance to authored and strips orphan claims", () => {
		const components = [
			{ id: "a", detail: fnDetail }, // -> authored
			{ id: "b", detailProvenance: "verified", other: 1 }, // no detail -> stripped
			{ id: "c", detail: fnDetail, detailProvenance: "verified" }, // untouched
		];
		normalizeDetailProvenance(components);
		expect(components[0]["detailProvenance"]).toBe("authored");
		expect(components[1]["detailProvenance"]).toBeUndefined();
		expect(components[2]["detailProvenance"]).toBe("verified");
	});

	test("normalize backfills per-construct arrays the published renderer requires", () => {
		const components = [
			{ id: "f", detail: { kind: "function", parameters: [{ name: "id", type: "string" }] } },
			{ id: "c", detail: { kind: "class", methods: [] } },
			{ id: "t", detail: { kind: "type" } },
			{ id: "m", detail: { kind: "module" } },
			{ id: "e", detail: { kind: "custom_entity" } },
		];
		normalizeDetailProvenance(components);
		const d = (id: string) =>
			(components.find((x) => x["id"] === id)?.["detail"] ?? {}) as Record<string, unknown>;
		expect(Object.keys(d("f"))).toContain("callers");
		expect(d("f")["callees"]).toEqual([]);
		expect(d("c")["extends"]).toEqual([]);
		expect(d("c")["references"]).toEqual([]);
		expect(d("t")["usedBy"]).toEqual([]);
		expect(d("m")["imports"]).toEqual([]);
		expect(d("e")["attributes"]).toEqual([]);
		// existing arrays are never overwritten
		expect(d("f")["parameters"]).toEqual([{ name: "id", type: "string" }]);
	});

	test("verification counts details by provenance", async () => {
		// `detailProvenance` ships in the next @principal-ai/subsystems-react
		// publish; until then the store treats it as payload-level JSON, so the
		// fixture is typed loosely here.
		const components = [
			{ id: "v1", name: "V1", construct: "function", file: "declares.ts", purl: "pkg:github/a/repo-a", symbol: "exportedFn", detail: fnDetail, detailProvenance: "verified" },
			{ id: "a1", name: "A1", construct: "function", file: "declares.ts", purl: "pkg:github/a/repo-a", symbol: "privateFn", detail: fnDetail },
		] as unknown as Parameters<typeof verifyModelFiles>[0]["components"];
		const result = await verifyModelFiles({
			components,
			edges: [],
			repoRoots: { "pkg:github/a/repo-a": repoA },
		});
		expect(result.detailsVerified).toBe(1);
		expect(result.detailsAuthored).toBe(1); // defaulted from missing
	});
});

describe("findEdgeMechanismProblems", () => {
	test("pins the mechanism set (mirror of SubsystemEdgeMechanism)", () => {
		expect([...SUBSYSTEM_EDGE_MECHANISMS]).toEqual([
			"imports",
			"imports_from",
			"re_exports",
			"defines",
			"calls",
			"extends",
			"inherits",
			"implements",
			"mixes_in",
			"uses",
			"method",
			"references",
			"contains",
			"feeds",
			"produces",
			"writes",
			"reads",
			"watches",
			"registers-into",
		]);
		expect(SUBSYSTEM_EDGE_MECHANISMS_COVER_PUBLISHED_UNION).toBe(true);
	});

	test("accepts every allowed mechanism", () => {
		const edges = SUBSYSTEM_EDGE_MECHANISMS.map((mechanism, i) => ({
			id: `e${i}`,
			from: "a",
			to: "b",
			mechanism,
		}));
		expect(findEdgeMechanismProblems(edges)).toEqual([]);
	});

	test("flags unknown labels with the allowed set in the message", () => {
		const problems = findEdgeMechanismProblems([
			{ id: "bad-1", from: "a", to: "b", mechanism: "Electrobun RPC: analyzeSession" },
			{ id: "ok", from: "a", to: "b", mechanism: "calls" },
			{ id: "bad-2", from: "a", to: "b", mechanism: "spawns worker" },
		]);
		expect(problems).toHaveLength(2);
		expect(problems[0]).toContain('"bad-1"');
		expect(problems[0]).toContain("registers-into");
		expect(problems[1]).toContain('"bad-2"');
	});

	test("flags non-string and missing mechanisms", () => {
		expect(findEdgeMechanismProblems([{ id: "n1", mechanism: 42 }])).toHaveLength(1);
		expect(findEdgeMechanismProblems([{ id: "n2" }])).toHaveLength(1);
		expect(findEdgeMechanismProblems([])).toEqual([]);
		expect(findEdgeMechanismProblems(undefined)).toEqual([]);
	});
});

describe("findComponentConstructProblems", () => {
	test("pins the authored construct set (published union minus module)", () => {
		expect([...SUBSYSTEM_COMPONENT_CONSTRUCTS]).toEqual([
			"class",
			"function",
			"method",
			"interface",
			"type_alias",
			"enum",
			"store",
			"external",
			"custom_entity",
		]);
	});

	test("accepts every authored construct", () => {
		const components = SUBSYSTEM_COMPONENT_CONSTRUCTS.map((construct, i) => ({
			id: `c${i}`,
			name: `C${i}`,
			construct,
			file: "src/x.ts",
			purl: "pkg:github/a/b",
		}));
		expect(findComponentConstructProblems(components)).toEqual([]);
	});

	test("rejects module with the subsystem-reference policy in the message", () => {
		const problems = findComponentConstructProblems([
			{ id: "mod1", construct: "module", file: "src/mod.ts", purl: "pkg:github/a/b" },
		]);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain('"mod1"');
		expect(problems[0]).toContain("own subsystem");
		expect(problems[0]).toContain("separate graph");
	});

	test("rejects off-vocabulary conceptual kinds", () => {
		const problems = findComponentConstructProblems([
			{ id: "s1", construct: "service", file: "src/s.ts", purl: "pkg:github/a/b" },
			{ id: "s2", construct: "variable", file: "src/s2.ts", purl: "pkg:github/a/b" },
		]);
		expect(problems).toHaveLength(2);
	});

	test("flags non-string and missing kinds; tolerates absent input", () => {
		expect(findComponentConstructProblems([{ id: "n1", construct: 7 }])).toHaveLength(1);
		expect(findComponentConstructProblems([{ id: "n2" }])).toHaveLength(1);
		expect(findComponentConstructProblems([])).toEqual([]);
		expect(findComponentConstructProblems(undefined)).toEqual([]);
	});
});

describe("findThroughlineProblems", () => {
	const edges = [
		{ id: "e1", from: "a", to: "b", mechanism: "calls" },
		{ id: "e2", from: "b", to: "store", mechanism: "writes" },
	];

	test("tolerates absent throughlines", () => {
		expect(findThroughlineProblems(edges, undefined)).toEqual([]);
	});

	test("accepts a well-formed throughline whose steps reference existing edges", () => {
		const problems = findThroughlineProblems(edges, [
			{ id: "tl", title: "save", steps: [{ edgeId: "e1", file: "src/a.ts", line: 3 }] },
		]);
		expect(problems).toEqual([]);
	});

	test("rejects non-array throughlines", () => {
		expect(findThroughlineProblems(edges, {})[0]).toContain("must be an array");
	});

	test("rejects missing id / title / steps and unknown edge references", () => {
		const missingId = findThroughlineProblems(edges, [
			{ id: "", title: "t", steps: [{ edgeId: "e1", file: "a.ts", line: 3 }] },
		]);
		expect(missingId.join("; ")).toContain("id is required");

		const missingTitle = findThroughlineProblems(edges, [
			{ id: "tl", title: "", steps: [{ edgeId: "e1", file: "a.ts", line: 3 }] },
		]);
		expect(missingTitle.join("; ")).toContain("title is required");

		const badEdge = findThroughlineProblems(edges, [
			{ id: "tl", title: "t", steps: [{ edgeId: "nope", file: "a.ts", line: 3 }] },
		]);
		expect(badEdge.join("; ")).toContain('"nope"');
	});

	test("rejects non-positive or non-integer line", () => {
		const problems = findThroughlineProblems(edges, [
			{ id: "tl", title: "t", steps: [{ edgeId: "e1", file: "a.ts", line: 0 }] },
		]);
		expect(problems.join("; ")).toContain("positive 1-based integer");
	});
});

describe("throughline verify pass", () => {
	test("resolves steps to real site lines and flags stuck/blank/misfit sites", async () => {
		const local = mkdtempSync(join(tmpdir(), "tl-verify-"));
		try {
			mkdirSync(join(local, "src"), { recursive: true });
			writeFileSync(
				join(local, "src", "seam.ts"),
				["function a() {}", "const store = createStore();", "writer(store, a());", ""].join("\n"),
				"utf8",
			);
			const components: SubsystemComponent[] = [
				{ id: "a", name: "a", construct: "function", symbol: "a", file: "src/seam.ts", purl: "pkg:github/a/repo-a" },
				{ id: "store", name: "store", construct: "store", file: "src/seam.ts", purl: "pkg:github/a/repo-a" },
			];
			const edges: SubsystemComponentEdge[] = [
				{ id: "e1", from: "a", to: "store", mechanism: "calls", refs: ["writer", "createStore"] },
			];
			const result = await verifyModelFiles({
				components,
				edges,
				throughlines: [
					{
						id: "tl",
						title: "save",
						steps: [
							{ edgeId: "e1", file: "src/seam.ts", line: 3 }, // "writer(store, a());" — affinity via 'writer'
							{ edgeId: "e1", file: "src/seam.ts", line: 999 }, // out of range
							{ edgeId: "missing", file: "src/seam.ts", line: 1 }, // unknown edge
							{ edgeId: "e1", file: "src/nope.ts", line: 1 }, // missing file
							{ edgeId: "e1", file: "src/seam.ts", line: 4 }, // blank line
						],
					},
				],
				repoRoots: { "pkg:github/a/repo-a": local },
			});

			expect(result.throughlinesChecked).toBe(1); // only the line-3 step resolves
			const reasons = result.throughlinesFailed.map((f) => f.reason);
			expect(reasons.some((r) => r.includes("out of range"))).toBe(true);
			expect(reasons.some((r) => r.includes("is not in the graph"))).toBe(true);
			expect(reasons.some((r) => r.includes("not found"))).toBe(true);
			expect(reasons.some((r) => r.includes("blank"))).toBe(true);
		} finally {
			rmSync(local, { recursive: true, force: true });
		}
	});
});

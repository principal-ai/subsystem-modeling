import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GraphifyNode } from "../../../subsystems-react/src/graphify/types";
import { hashContentRange } from "./declaration-ref";
import {
	declarationForSymbol,
	diffConstructIdentities,
	enclosingDeclaration,
	graphCandidateIdentities,
	graphHistoryTargets,
	matchGraphHistoryConstructs,
	verifyGraphConstructs,
} from "./graph-constructs";

const purl = "pkg:github/test/graph-inventory";
let root: string;
beforeAll(async () => { root = await fs.mkdtemp(join(tmpdir(), "graph-constructs-test-")); });
afterAll(async () => { await fs.rm(root, { recursive: true, force: true }); });

function node(file: string, label: string, line: number, id = `${file}:${label}:${line}`): GraphifyNode {
	return { id, label, file_type: "code", source_file: file, source_location: `L${line}` };
}
function verify(nodes: GraphifyNode[], strict = false) {
	return verifyGraphConstructs({ purl, repoRoot: root, nodes, strict });
}

describe("source-verified Graphify inventory", () => {
	test("discovers declarations without models and derives qualified identities, kinds and hashes", async () => {
		const content = [
			"export class Alpha {",
			"  run(value: number) { return value; }",
			"}",
			"export class Beta {",
			"  run(value: number) { return value + 1; }",
			"}",
			"export const calculate = (n: number) => n * 2;",
			"export interface Config { value: number; }",
		].join("\r\n");
		await fs.writeFile(join(root, "symbols.ts"), content);
		const nodes = [
			node("symbols.ts", "Alpha", 1), node("symbols.ts", "run()", 2),
			node("symbols.ts", "Beta", 4), node("symbols.ts", "run()", 5),
			node("symbols.ts", "calculate()", 7), node("symbols.ts", "Config", 8),
			node("symbols.ts", "calculate()", 7, "duplicate-graph-node"),
			node("symbols.ts", "symbols.ts", 1),
			{ ...node("symbols.ts", "external()", 1), source_location: "" },
			{ ...node("symbols.ts", "paper", 1), file_type: "document" as const },
		];
		const result = await verify(nodes);
		expect(result.coverage).toEqual({ verified: 6, unresolved: 0, unsupported: 0, error: 0 });
		expect(result.constructs.map((row) => row.symbol)).toEqual(["Alpha", "Alpha.run", "Beta", "Beta.run", "calculate", "Config"]);
		const calculate = result.constructs.find((row) => row.symbol === "calculate")!;
		expect(calculate.models).toEqual([]);
		expect(calculate.construct).toBe("function");
		expect(calculate.graphNodeIds).toHaveLength(2);
		expect(calculate.span?.contentHash).toBe(hashContentRange(content, 7, 7)!);
		expect(graphHistoryTargets(result)).toHaveLength(6);
	});

	test("reports unsupported files, failed names, malformed declarations and duplicate identities honestly", async () => {
		await fs.writeFile(join(root, "unsupported.cs"), "public class Unknown {}");
		await fs.writeFile(join(root, "duplicates.ts"), "function same() {}\nfunction same() {}\n");
		await fs.writeFile(join(root, "malformed.ts"), "function broken() { const = ; }\n");
		const result = await verify([
			node("unsupported.cs", "Unknown", 1),
			node("duplicates.ts", "same()", 1), node("duplicates.ts", "same()", 2),
			node("duplicates.ts", "notTheName()", 1),
			node("malformed.ts", "broken()", 1),
		]);
		expect(result.coverage).toEqual({ verified: 0, unresolved: 4, unsupported: 1, error: 0 });
		expect(result.constructs.every((row) => !row.span)).toBe(true);
		expect(result.constructs.find((row) => row.symbol === "broken")?.verification.evidence).toContain("parse error");
		expect(graphHistoryTargets(result)).toEqual([]);
	});

	test("does not anchor a reference/call to a nearby declaration or accept the wrong qualification", async () => {
		await fs.writeFile(join(root, "references.ts"), "invoke();\nfunction invoke() {}\nclass Actual { run() {} }\n");
		const result = await verify([
			node("references.ts", "invoke()", 1),
			node("references.ts", "Wrong.run()", 3),
		]);
		expect(result.coverage.unresolved).toBe(2);
		expect(result.coverage.verified).toBe(0);
	});

	test("supports decorated Python declarations and distinct Go receiver identities", async () => {
		await fs.writeFile(join(root, "symbols.py"), "@decorator\ndef calculate(value):\n    return value\n");
		await fs.writeFile(join(root, "symbols.go"), "package symbols\ntype First struct{}\ntype Second struct{}\nfunc (f *First) Run() {}\nfunc (s *Second) Run() {}\n");
		const result = await verify([
			node("symbols.py", "calculate()", 1),
			node("symbols.go", "Run()", 4), node("symbols.go", "Run()", 5),
		]);
		expect(result.coverage.verified).toBe(3);
		expect(result.constructs.map((row) => row.symbol)).toEqual(["First.Run", "Second.Run", "calculate"]);
	});

	test("derives method qualification from Java, Rust, Ruby, PHP and decorated Python source", async () => {
		const examples = [
			{ file: "worker.java", content: "class Worker { int run() { return 1; } }\n", line: 1 },
			{ file: "worker.rs", content: "struct Worker;\nimpl Worker { fn run(&self) {} }\n", line: 2 },
			{ file: "worker.rb", content: "class Worker\n def run\n  1\n end\nend\n", line: 2 },
			{ file: "worker.php", content: "<?php\nclass Worker { function run() { return 1; } }\n", line: 2 },
			{ file: "worker.py", content: "class Worker:\n @decorator\n def run(self):\n  return 1\n", line: 2 },
		];
		for (const example of examples) {
			await fs.writeFile(join(root, example.file), example.content);
			const result = await verify([node(example.file, "run()", example.line)]);
			expect(result.constructs[0]?.verification.status).toBe("verified");
			expect(result.constructs[0]?.symbol).toBe("Worker.run");
			expect(result.constructs[0]?.construct).toBe("method");
		}
	});

	test("does not follow symlinks outside the checkout and marks them as errors, not fatal", async () => {
		await fs.symlink("/etc/passwd", join(root, "outside.ts"));
		const nodes = [node("outside.ts", "secret", 1)];
		expect((await verify(nodes)).coverage.error).toBe(1);
		// Strict mode no longer aborts the run for one unreadable file.
		expect((await verify(nodes, true)).coverage.error).toBe(1);
	});

	test("reuses file parsing without reusing stale source fingerprints", async () => {
		const nodes = [node("changing.ts", "value()", 1)];
		await fs.writeFile(join(root, "changing.ts"), "export function value() { return 1; }\n");
		const first = await verify(nodes);
		await fs.writeFile(join(root, "changing.ts"), "export function value() { return 2; }\n");
		const second = await verify(nodes);
		expect(first.constructs[0]!.span?.contentHash).not.toBe(second.constructs[0]!.span?.contentHash);
	});

	test("matches renamed files without crossing unresolved gaps or mixing same-named methods", async () => {
		await fs.writeFile(join(root, "old.ts"), "class First {\n run() { return 1; }\n}\nclass Second {\n run() { return 2; }\n}\n");
		const nodes = [node("old.ts", "run()", 2), node("old.ts", "run()", 5)];
		const targets = [
			{ id: "first", name: "First.run", symbol: "First.run", file: "new.ts", construct: "method" },
			{ id: "second", name: "Second.run", symbol: "Second.run", file: "new.ts", construct: "method" },
		];
		const matched = await matchGraphHistoryConstructs({
			purl, repoRoot: root, nodes, targets, renames: new Map([["new.ts", "old.ts"]]),
		});
		expect(matched.map((observation) => observation.status)).toEqual(["matched", "matched"]);
		expect(matched[0]?.contentHash).not.toBe(matched[1]?.contentHash);
		const stopped = await matchGraphHistoryConstructs({
			purl, repoRoot: root, nodes, targets, renames: new Map([["new.ts", "old.ts"]]),
			newer: [{ targetId: "first", status: "unresolved", evidence: "missing at newer commit" }, matched[1]!],
		});
		expect(stopped[0]?.status).toBe("unresolved");
		expect(stopped[1]?.status).toBe("matched");
		const wrongKind = await matchGraphHistoryConstructs({
			purl, repoRoot: root, nodes, targets: [{ ...targets[0]!, construct: "function" }],
			renames: new Map([["new.ts", "old.ts"]]),
		});
		expect(wrongKind[0]?.status).toBe("unresolved");
		expect(wrongKind[0]?.evidence).toContain("kind");
	});

	test("confirms source absence, but rejects omitted nodes, errors, ambiguity, references and possible renames", async () => {
		const file = "introduction.ts";
		const latest = "export function newlyAdded() { return 4729; }\n";
		await fs.writeFile(join(root, file), latest);
		const targets = graphHistoryTargets(await verify([node(file, "newlyAdded()", 1)]));
		const newer = await matchGraphHistoryConstructs({ purl, repoRoot: root, nodes: [node(file, "newlyAdded()", 1)], targets, renames: new Map() });
		for (const example of [
			{ content: "export const stable = 123;\n", expected: "absent", nodes: [] },
			{ content: latest, expected: "unresolved", nodes: [] },
			{ content: "const = ;\n", expected: "unresolved", nodes: [] },
			{ content: "newlyAdded();\n", expected: "unresolved", nodes: [] },
			{ content: `${latest}${latest}`, expected: "unresolved", nodes: [node(file, "newlyAdded()", 1), node(file, "newlyAdded()", 2)] },
			{ content: "export function formerName() { return 4729; }\n", expected: "unresolved", nodes: [node(file, "formerName()", 1)] },
			{ content: "export function formerName() { return 4728; }\n", expected: "unresolved", nodes: [node(file, "formerName()", 1)] },
			{ content: "export function unindexedFormerName() { return 4728; }\n", expected: "unresolved", nodes: [] },
		] as const) {
			await fs.writeFile(join(root, file), example.content);
			const older = await matchGraphHistoryConstructs({
				purl, repoRoot: root, targets, newer, renames: new Map(), nodes: example.nodes,
				detectIntroductions: true, adjacent: true, sourceTree: new Map([[file, "file"]]),
			});
			expect(older[0]?.status).toBe(example.expected);
			if (example.expected === "absent") expect(older[0]?.absence).toBe("confirmed");
		}
	});

	test("requires adjacent Git snapshots and regular supported source, and does not cross unknown gaps", async () => {
		const file = "boundary.ts";
		await fs.writeFile(join(root, file), "function boundaryAdded() { return 928; }\n");
		const targets = graphHistoryTargets(await verify([node(file, "boundaryAdded()", 1)]));
		const newer = await matchGraphHistoryConstructs({ purl, repoRoot: root, nodes: [node(file, "boundaryAdded()", 1)], targets, renames: new Map() });
		const input = { purl, repoRoot: root, targets, newer, renames: new Map<string, string>(), nodes: [],
			detectIntroductions: true, adjacent: true, sourceTree: new Map<string, "file" | "other">() };
		expect((await matchGraphHistoryConstructs({ ...input, adjacent: false }))[0]?.status).toBe("unresolved");
		expect((await matchGraphHistoryConstructs({ ...input, sourceTree: undefined }))[0]?.status).toBe("unresolved");
		expect((await matchGraphHistoryConstructs({ ...input, detectIntroductions: false }))[0]?.status).toBe("unresolved");
		expect((await matchGraphHistoryConstructs({ ...input, sourceTree: new Map([[file, "other"]]) }))[0]?.status).toBe("unresolved");
		await fs.writeFile(join(root, "earlier.cs"), "class Earlier {}");
		expect((await matchGraphHistoryConstructs({ ...input,
			renames: new Map([[file, "earlier.cs"]]), sourceTree: new Map([["earlier.cs", "file"]]),
		}))[0]?.status).toBe("unresolved");
		const absent = await matchGraphHistoryConstructs(input);
		expect(absent[0]?.status).toBe("absent");
		const stopped = await matchGraphHistoryConstructs({ ...input, newer: absent });
		expect(stopped[0]?.status).toBe("not-traced");
		const unknown = await matchGraphHistoryConstructs({ ...input,
			newer: [{ targetId: targets[0]!.id, status: "unresolved", evidence: "Earlier gap" }],
		});
		expect(unknown[0]?.status).toBe("unresolved");
		await fs.unlink(join(root, file));
		// A missing/unreadable file is unresolved, not a fatal run failure.
		const missing = await matchGraphHistoryConstructs({ ...input, sourceTree: new Map([[file, "file"]]) });
		expect(missing[0]?.status).toBe("unresolved");
	});

	test("does not call a cross-file declaration move an introduction", async () => {
		await fs.writeFile(join(root, "moved-new.ts"), "function movedDeclaration() { return 727; }\n");
		const targets = graphHistoryTargets(await verify([node("moved-new.ts", "movedDeclaration()", 1)]));
		const newer = await matchGraphHistoryConstructs({
			purl, repoRoot: root, nodes: [node("moved-new.ts", "movedDeclaration()", 1)], targets, renames: new Map(),
		});
		await fs.writeFile(join(root, "moved-old.ts"), "function movedDeclaration() { return 726; }\n");
		const older = await matchGraphHistoryConstructs({
			purl, repoRoot: root, nodes: [node("moved-old.ts", "movedDeclaration()", 1)],
			targets, newer, renames: new Map(), detectIntroductions: true, adjacent: true,
			sourceTree: new Map([["moved-old.ts", "file"]]),
		});
		expect(older[0]?.status).toBe("unresolved");
		expect(older[0]?.evidence).toContain("move or rename");
	});

	test("can confirm an addition beside a surviving sibling after following a file rename", async () => {
		await fs.writeFile(join(root, "siblings-new.ts"), "function survivingSibling() { return 13; }\nfunction freshSibling() { return 27; }\n");
		const nodes = [node("siblings-new.ts", "survivingSibling()", 1), node("siblings-new.ts", "freshSibling()", 2)];
		const targets = graphHistoryTargets(await verify(nodes));
		const newer = await matchGraphHistoryConstructs({ purl, repoRoot: root, nodes, targets, renames: new Map() });
		await fs.writeFile(join(root, "siblings-old.ts"), "function survivingSibling() { return 13; }\n");
		const older = await matchGraphHistoryConstructs({
			purl, repoRoot: root, nodes: [node("siblings-old.ts", "survivingSibling()", 1)], targets, newer,
			renames: new Map([["siblings-new.ts", "siblings-old.ts"]]), detectIntroductions: true,
			adjacent: true, sourceTree: new Map([["siblings-old.ts", "file"]]),
		});
		expect(older.map((observation) => observation.status)).toEqual(["matched", "absent"]);
		expect(older[0]?.file).toBe("siblings-old.ts");
		expect(older[1]?.absence).toBe("confirmed");
	});
});

describe("graph identity census", () => {
	test("keeps declarations only, dropping file containers and sourceless nodes", () => {
		const identities = graphCandidateIdentities([
			node("a.ts", "kept()", 1),
			node("a.ts", "gone()", 2),
			node("a.ts", "a.ts", 1),
			node("package.json", "tree-sitter-wasms", 1),
			{ ...node("a.ts", "stub()", 3), source_location: "" },
			{ ...node("a.ts", "doc", 4), file_type: "document" as const },
		]);
		expect([...identities.keys()].sort()).toEqual(["a.ts\0gone", "a.ts\0kept"]);
	});

	test("reports a removed identity and an introduced identity, sorted deterministically", () => {
		const older = graphCandidateIdentities([node("a.ts", "kept()", 1), node("a.ts", "gone()", 2)]);
		const newer = graphCandidateIdentities([node("a.ts", "kept()", 1), node("a.ts", "fresh()", 2)]);
		expect(diffConstructIdentities(older, newer)).toEqual([
			{ kind: "introduced", file: "a.ts", symbol: "fresh" },
			{ kind: "removed", file: "a.ts", symbol: "gone" },
		]);
	});
});

describe("step site/target declaration resolution", () => {
	test("resolves the innermost construct containing a site line", async () => {
		await fs.writeFile(
			join(root, "site.ts"),
			[
				"export class Inner {", // 1
				"  run() {", // 2
				"    target();", // 3
				"  }", // 4
				"}", // 5
				"export function target() {}", // 6
			].join("\n"),
		);
		const site = await enclosingDeclaration({
			repoRoot: root,
			file: "site.ts",
			line: 3,
		});
		expect(site).toMatchObject({
			symbol: "Inner.run",
			construct: "method",
			startLine: 2,
			endLine: 4,
		});
	});

	test("resolves a target declaration by qualified symbol or a unique simple name", async () => {
		await fs.writeFile(
			join(root, "target.ts"),
			[
				"export class Store {", // 1
				"  add() {}", // 2
				"}", // 3
				"export function mergeProvenance() {}", // 4
			].join("\n"),
		);
		expect(
			await declarationForSymbol({
				repoRoot: root,
				file: "target.ts",
				symbol: "Store.add",
			}),
		).toMatchObject({ symbol: "Store.add", startLine: 2, endLine: 2 });
		expect(
			await declarationForSymbol({
				repoRoot: root,
				file: "target.ts",
				symbol: "mergeProvenance",
			}),
		).toMatchObject({ symbol: "mergeProvenance", startLine: 4, endLine: 4 });
	});

	test("does not guess when a simple target name is ambiguous", async () => {
		await fs.writeFile(
			join(root, "ambiguous.ts"),
			["class A { run() {} }", "class B { run() {} }"].join("\n"),
		);
		expect(
			await declarationForSymbol({
				repoRoot: root,
				file: "ambiguous.ts",
				symbol: "run",
			}),
		).toBeNull();
	});
});

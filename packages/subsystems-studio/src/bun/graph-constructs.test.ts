import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GraphifyNode } from "../../../subsystems-react/src/graphify/types";
import { hashContentRange } from "./declaration-ref";
import {
	declarationForSymbol,
	enclosingDeclaration,
	verifyGraphConstructs,
} from "./graph-constructs";

const purl = "pkg:github/test/graph-inventory";
let root: string;
beforeAll(async () => { root = await fs.mkdtemp(join(tmpdir(), "graph-constructs-test-")); });
afterAll(async () => { await fs.rm(root, { recursive: true, force: true }); });

function node(file: string, label: string, line: number, id = `${file}:${label}:${line}`): GraphifyNode {
	return { id, label, file_type: "code", source_file: file, source_location: `L${line}` };
}
function verify(nodes: GraphifyNode[]) {
	return verifyGraphConstructs({ purl, repoRoot: root, nodes });
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
	});

	test("reuses file parsing without reusing stale source fingerprints", async () => {
		const nodes = [node("changing.ts", "value()", 1)];
		await fs.writeFile(join(root, "changing.ts"), "export function value() { return 1; }\n");
		const first = await verify(nodes);
		await fs.writeFile(join(root, "changing.ts"), "export function value() { return 2; }\n");
		const second = await verify(nodes);
		expect(first.constructs[0]!.span?.contentHash).not.toBe(second.constructs[0]!.span?.contentHash);
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

import { describe, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import config from "../../electrobun.config";
import { grammarFile } from "./tree-sitter-assets";
import { parserFor } from "./tree-sitter-parser";

const SAMPLES: Record<string, string> = {
	"sample.ts": "export function greet(name: string): string { return name; }",
	"sample.tsx": "export function View() { return <div />; }",
	"sample.js": "export function greet(name) { return name; }",
	"sample.py": "def greet(name):\n    return name\n",
	"sample.go": "package main\nfunc greet() {}\n",
	"sample.rs": "fn greet() {}\n",
	"Sample.java": "class Sample { void greet() {} }\n",
	"sample.rb": "def greet(name)\n  name\nend\n",
	"sample.php": "<?php function greet($name) { return $name; }\n",
};

describe("Tree-sitter assets", () => {
	test("maps supported extensions without treating other files as code", () => {
		expect(grammarFile("VIEW.TSX")).toBe("tree-sitter-tsx.wasm");
		expect(grammarFile("sample.cjs")).toBe("tree-sitter-javascript.wasm");
		expect(grammarFile("sample.jsx")).toBe("tree-sitter-javascript.wasm");
		expect(grammarFile("README.md")).toBeNull();
		expect(grammarFile("Makefile")).toBeNull();
	});

	test("loads the runtime and grammars from installed dependencies in source mode", async () => {
		for (const [file, content] of Object.entries(SAMPLES)) {
			const parser = await parserFor(file);
			expect(parser).not.toBeNull();
			const tree = parser!.parse(content);
			expect(tree?.rootNode.hasError).toBe(false);
			tree?.delete();
			parser!.delete();
		}
		expect(await parserFor("README.md")).toBeNull();
	});

	test("bundled parsers work with only the configured app assets and no node_modules", async () => {
		const root = await mkdtemp(join(tmpdir(), "studio-tree-sitter-"));
		try {
			const entry = join(root, "entry.ts");
			await writeFile(entry, `
				import { parserFor } from ${JSON.stringify(join(import.meta.dir, "tree-sitter-parser.ts"))};
				for (const [file, content] of Object.entries(${JSON.stringify(SAMPLES)})) {
					const parser = await parserFor(file);
					const tree = parser?.parse(content);
					if (!tree || tree.rootNode.hasError) throw new Error("Failed to parse " + file);
					tree.delete();
					parser.delete();
				}
				console.log("All bundled grammars parsed successfully");
			`);
			const app = join(root, "app");
			const built = await Bun.build({
				entrypoints: [entry],
				outdir: join(app, "bun"),
				target: "bun",
			});
			expect(built.success).toBe(true);
			const copies = Object.entries(config.build.copy)
				.filter(([, dest]) => dest.startsWith("bun/tree-sitter/"));
			expect(copies).toHaveLength(Object.keys(SAMPLES).length + 1);
			const packageRoot = resolve(import.meta.dir, "../..");
			for (const [source, destination] of copies) {
				const dest = join(app, destination);
				await mkdir(dirname(dest), { recursive: true });
				await copyFile(join(packageRoot, source), dest);
			}
			const proc = Bun.spawn({
				cmd: [process.execPath, join(app, "bun", "entry.js")],
				cwd: root,
				stdout: "pipe",
				stderr: "pipe",
			});
			const [stdout, stderr, code] = await Promise.all([
				new Response(proc.stdout).text(),
				new Response(proc.stderr).text(),
				proc.exited,
			]);
			expect(stderr).toBe("");
			expect(code).toBe(0);
			expect(stdout).toContain("All bundled grammars parsed successfully");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});

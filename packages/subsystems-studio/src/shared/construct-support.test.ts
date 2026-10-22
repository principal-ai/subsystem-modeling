import { describe, expect, test } from "bun:test";
import { CONSTRUCT_GRAMMARS, constructFileSupport, grammarFile } from "./construct-support";
import { timelineFileStatus } from "./construct-timeline";
import { TREE_SITTER_ASSET_COPIES } from "../bun/tree-sitter-assets";

describe("construct file support", () => {
	test.each(["ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "go", "rs", "java", "rb", "php"])(
		"recognizes .%s and packages its verification grammar", (ext) => {
			const file = `src/module.${ext}`;
			expect(constructFileSupport(file)).toBe("supported");
			expect(grammarFile(file)).toBe(CONSTRUCT_GRAMMARS[`.${ext}`]!);
			expect(Object.values(TREE_SITTER_ASSET_COPIES)).toContain(`bun/tree-sitter/${grammarFile(file)}`);
			expect(timelineFileStatus(undefined, file)).toBe("uncovered");
		},
	);

	test.each(["main.zig", "main.c", "main.h", "main.cpp", "flake.nix", "shader.glsl", "script.sh", "Dockerfile", "unknown.xyz"])(
		"marks %s unsupported even without extracted candidates", (file) => {
			expect(constructFileSupport(file)).toBe("unsupported");
			expect(timelineFileStatus(undefined, file)).toBe("unsupported");
		},
	);

	test.each(["README.md", "LICENSE", ".gitignore", "logo.png", "font.ttf", "package.json", "flake.lock"])(
		"separates known non-code file %s", (file) => {
			expect(constructFileSupport(file)).toBe("non-code");
			expect(timelineFileStatus(undefined, file)).toBe("non-code");
		},
	);

	test("uses the filename, handles uppercase, and does not classify link targets", () => {
		expect(grammarFile("src.TS/no-extension")).toBeNull();
		expect(constructFileSupport("src/FILE.TSX")).toBe("supported");
		expect(constructFileSupport("docs/README.MD")).toBe("non-code");
		expect(timelineFileStatus(undefined, "alias.zig", "symlink")).toBe("uncovered");
		expect(timelineFileStatus(undefined, "vendor.zig/library", "submodule")).toBe("uncovered");
	});

	test("never replaces recorded verification results with current support labels", () => {
		const coverage = { file: "old.zig", verified: 1, unresolved: 0, unsupported: 0, error: 0 };
		expect(timelineFileStatus(coverage, coverage.file)).toBe("verified");
		expect(timelineFileStatus({ ...coverage, error: 1 }, coverage.file)).toBe("partial");
		expect(timelineFileStatus({ ...coverage, verified: 0, error: 1 }, coverage.file)).toBe("error");
	});
});

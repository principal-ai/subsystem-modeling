import { describe, expect, test } from "bun:test";
import { findSymbolLine, mergeRanges } from "./proposal-source-context";

describe("findSymbolLine", () => {
	const src = [
		"import { x } from 'y';",
		"",
		"export interface RebuiltSubsystemModel {",
		"  components: unknown[];",
		"}",
		"",
		"export function excalidrawSceneToSubsystemModel(",
		"  scene: ExcalidrawLikeScene,",
		"): RebuiltSubsystemModel {",
		"  return { components: [] };",
		"}",
	].join("\n");

	test("finds the function declaration line", () => {
		expect(findSymbolLine(src, "excalidrawSceneToSubsystemModel")).toBe(7);
	});

	test("finds a same-file interface declaration", () => {
		expect(findSymbolLine(src, "RebuiltSubsystemModel")).toBe(3);
	});

	test("falls back to a bare mention", () => {
		expect(findSymbolLine(src, "ExcalidrawLikeScene")).toBe(8);
	});

	test("null for empty symbol", () => {
		expect(findSymbolLine(src, undefined)).toBeNull();
		expect(findSymbolLine(src, "  ")).toBeNull();
	});

	test("null when absent", () => {
		expect(findSymbolLine(src, "Nope")).toBeNull();
	});
});

describe("mergeRanges", () => {
	test("merges overlapping and adjacent ranges", () => {
		expect(
			mergeRanges([
				{ start: 10, end: 30 },
				{ start: 25, end: 40 },
				{ start: 41, end: 50 },
				{ start: 80, end: 90 },
			]),
		).toEqual([
			{ start: 10, end: 50 },
			{ start: 80, end: 90 },
		]);
	});

	test("sorts unordered input", () => {
		expect(
			mergeRanges([
				{ start: 5, end: 6 },
				{ start: 1, end: 2 },
			]),
		).toEqual([
			{ start: 1, end: 2 },
			{ start: 5, end: 6 },
		]);
	});
});

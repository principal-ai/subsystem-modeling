import { describe, expect, test } from "bun:test";
import { hashDeclarationLine, hashDeclarationLineFromContent } from "./declaration-ref";

describe("hashDeclarationLine", () => {
	test("stable v1 digest", () => {
		const h = hashDeclarationLine("export function foo() {");
		expect(h).toHaveLength(32);
		expect(h).toBe(hashDeclarationLine("export function foo() {"));
	});

	test("normalizes trailing whitespace", () => {
		expect(hashDeclarationLine("x  \r")).toBe(hashDeclarationLine("x"));
	});
});

describe("hashDeclarationLineFromContent", () => {
	test("reads 1-based line", () => {
		const content = "a\nexport class Foo {\nc";
		const h = hashDeclarationLineFromContent(content, 2);
		expect(h).toBe(hashDeclarationLine("export class Foo {"));
	});
});

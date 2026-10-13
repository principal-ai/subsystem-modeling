import { describe, expect, test } from "bun:test";
import { buildSourceSpan, hashContentRange } from "./declaration-ref";

describe("hashContentRange", () => {
	test("stable v1 digest over a range", () => {
		const content = "a\nexport class Foo {\n  bar;\n}";
		const h = hashContentRange(content, 2, 4);
		expect(h).toHaveLength(32);
		expect(h).toBe(hashContentRange(content, 2, 4));
	});

	test("normalizes trailing whitespace per line", () => {
		expect(hashContentRange("x  \r\ny", 1, 2)).toBe(
			hashContentRange("x\ny", 1, 2),
		);
	});

	test("rejects an out-of-range or unordered range", () => {
		expect(hashContentRange("a\nb", 3, 4)).toBeNull();
		expect(hashContentRange("a\nb", 2, 1)).toBeNull();
		expect(hashContentRange("a\nb", 0, 1)).toBeNull();
	});
});

describe("buildSourceSpan", () => {
	test("assembles a span from its parts", () => {
		expect(
			buildSourceSpan({ startLine: 2, endLine: 4, contentHash: "h" }),
		).toEqual({ startLine: 2, endLine: 4, contentHash: "h" });
	});
});

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { toPortableDocument } from "./subsystem-model";

const schema = JSON.parse(
	readFileSync(
		resolve(import.meta.dir, "../../schemas/subsystem-model.schema.json"),
		"utf8",
	),
) as {
	properties: Record<string, unknown>;
	$defs: Record<string, { properties?: Record<string, unknown> }>;
};

describe("toPortableDocument", () => {
	test("keeps per-purl commit provenance (the coordinate for file:line)", () => {
		const portable = toPortableDocument({
			title: "t",
			components: [],
			relations: [],
			createdAtCommits: { "pkg:github/a/b": "abc" },
			verifiedAtCommits: { "pkg:github/a/b": "def" },
		} as unknown as Parameters<typeof toPortableDocument>[0]);
		expect(portable.createdAtCommits).toEqual({ "pkg:github/a/b": "abc" });
		expect(portable.verifiedAtCommits).toEqual({ "pkg:github/a/b": "def" });
	});

	test("still drops store metadata", () => {
		const portable = toPortableDocument({
			title: "t",
			components: [],
			relations: [],
			id: "sg-1",
			createdAt: "now",
			verification: {},
			lastOpenedAt: "now",
		} as unknown as Parameters<typeof toPortableDocument>[0]);
		expect("id" in portable).toBe(false);
		expect("verification" in portable).toBe(false);
		expect("lastOpenedAt" in portable).toBe(false);
	});
});

describe("subsystem-model schema", () => {
	test("declares the per-purl commit maps", () => {
		expect(schema.properties.createdAtCommits).toBeDefined();
		expect(schema.properties.verifiedAtCommits).toBeDefined();
	});

	test("no longer carries per-declaration revision (superseded by the model-level pin)", () => {
		expect(schema.$defs.declarationRef?.properties?.revision).toBeUndefined();
	});
});

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	augmentationKey,
	findAcceptedConstructAugmentation,
	findAcceptedModuleAugmentation,
	findAcceptedRelationAugmentation,
	findAcceptedSignatureAugmentation,
	upsertAcceptedConstructAugmentation,
	upsertAcceptedModuleAugmentation,
	upsertAcceptedRelationAugmentation,
	upsertAcceptedSignatureAugmentation,
} from "./augmentation-store";

describe("augmentationKey", () => {
	test("normalizes slashes and trim", () => {
		expect(augmentationKey("./src\\foo.ts", " HostInfo ")).toBe(
			"src/foo.ts::HostInfo",
		);
	});
});

describe("graphify augmentations", () => {
	test("upsert then find accepted construct", async () => {
		const root = mkdtempSync(join(tmpdir(), "ga-store-"));
		try {
			const written = await upsertAcceptedConstructAugmentation({
				purl: "pkg:github/acme/widget#src/x.ts",
				file: "src/types.ts",
				symbol: "HostInfo",
				construct: "interface",
				source: "gap-filler",
				rationale: "declared as interface",
				storeRoot: root,
			});
			expect(written.ok).toBe(true);
			if (!written.ok) return;

			const hit = await findAcceptedConstructAugmentation({
				purl: "pkg:github/acme/widget",
				file: "src/types.ts",
				symbol: "HostInfo",
				storeRoot: root,
			});
			expect(hit?.id).toBe(written.augmentation.id);
			expect(hit?.claims.construct).toBe("interface");
			expect(hit?.status).toBe("accepted");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("newer accept supersedes prior for same identity", async () => {
		const root = mkdtempSync(join(tmpdir(), "ga-store-"));
		try {
			await upsertAcceptedConstructAugmentation({
				purl: "pkg:github/acme/widget",
				file: "a.ts",
				symbol: "Foo",
				construct: "class",
				source: "a",
				storeRoot: root,
			});
			const second = await upsertAcceptedConstructAugmentation({
				purl: "pkg:github/acme/widget",
				file: "a.ts",
				symbol: "Foo",
				construct: "interface",
				source: "b",
				storeRoot: root,
			});
			expect(second.ok).toBe(true);
			const hit = await findAcceptedConstructAugmentation({
				purl: "pkg:github/acme/widget",
				file: "a.ts",
				symbol: "Foo",
				storeRoot: root,
			});
			expect(hit?.claims.construct).toBe("interface");
			expect(hit?.provenance.source).toBe("b");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("no hit when construct missing", async () => {
		const root = mkdtempSync(join(tmpdir(), "ga-store-"));
		try {
			const hit = await findAcceptedConstructAugmentation({
				purl: "pkg:github/acme/none",
				file: "a.ts",
				symbol: "Missing",
				storeRoot: root,
			});
			expect(hit).toBeNull();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("upsert then find accepted signature", async () => {
		const root = mkdtempSync(join(tmpdir(), "ga-store-"));
		try {
			const written = await upsertAcceptedSignatureAugmentation({
				purl: "pkg:github/acme/widget",
				file: "src/rpc.ts",
				symbol: "handle",
				signature: {
					parameterTypes: ["HostInfo"],
					returnTypes: ["Session"],
				},
				source: "gap-filler",
				storeRoot: root,
			});
			expect(written.ok).toBe(true);
			if (!written.ok) return;
			const hit = await findAcceptedSignatureAugmentation({
				purl: "pkg:github/acme/widget",
				file: "src/rpc.ts",
				symbol: "handle",
				storeRoot: root,
			});
			expect(hit?.claims.signature?.parameterTypes).toEqual(["HostInfo"]);
			expect(hit?.claims.signature?.returnTypes).toEqual(["Session"]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("upsert then find accepted relation", async () => {
		const root = mkdtempSync(join(tmpdir(), "ga-store-"));
		try {
			const written = await upsertAcceptedRelationAugmentation({
				purl: "pkg:github/acme/widget",
				fromFile: "src/child.ts",
				fromSymbol: "Child",
				relationType: "extends",
				toFile: "src/parent.ts",
				toSymbol: "Parent",
				source: "topology-gap-filler",
				rationale: "class Child extends Parent",
				storeRoot: root,
			});
			expect(written.ok).toBe(true);
			if (!written.ok) return;
			const hit = await findAcceptedRelationAugmentation({
				purl: "pkg:github/acme/widget",
				fromFile: "src/child.ts",
				fromSymbol: "Child",
				relationType: "extends",
				toFile: "src/parent.ts",
				toSymbol: "Parent",
				storeRoot: root,
			});
			expect(hit?.id).toBe(written.augmentation.id);
			expect(hit?.claims.relation?.relationType).toBe("extends");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("relation aug matches external by toId", async () => {
		const root = mkdtempSync(join(tmpdir(), "ga-store-"));
		try {
			await upsertAcceptedRelationAugmentation({
				purl: "pkg:github/acme/widget",
				fromFile: "src/a.ts",
				fromSymbol: "A",
				relationType: "imports",
				toId: "xyflow",
				toName: "@xyflow/react",
				source: "topology-gap-filler",
				storeRoot: root,
			});
			const hit = await findAcceptedRelationAugmentation({
				purl: "pkg:github/acme/widget",
				fromFile: "src/a.ts",
				fromSymbol: "A",
				relationType: "imports",
				toId: "xyflow",
				toName: "@xyflow/react",
				storeRoot: root,
			});
			expect(hit?.claims.relation?.toId).toBe("xyflow");
			const miss = await findAcceptedRelationAugmentation({
				purl: "pkg:github/acme/widget",
				fromFile: "src/a.ts",
				fromSymbol: "A",
				relationType: "imports",
				toId: "other",
				toName: "other",
				storeRoot: root,
			});
			expect(miss).toBeNull();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("upsert then find accepted module boundary", async () => {
		const root = mkdtempSync(join(tmpdir(), "ga-store-"));
		try {
			const written = await upsertAcceptedModuleAugmentation({
				purl: "pkg:github/acme/widget",
				file: "src/session/transcript.ts",
				symbol: "parseTranscript",
				module: "src/session/paths.ts",
				source: "boundary-gap-filler",
				storeRoot: root,
			});
			expect(written.ok).toBe(true);
			if (!written.ok) return;
			const hit = await findAcceptedModuleAugmentation({
				purl: "pkg:github/acme/widget",
				file: "src/session/transcript.ts",
				symbol: "parseTranscript",
				module: "src/session/paths.ts",
				storeRoot: root,
			});
			expect(hit?.id).toBe(written.augmentation.id);
			expect(hit?.claims.module?.module).toBe("src/session/paths.ts");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

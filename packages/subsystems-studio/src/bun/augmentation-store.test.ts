import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	augmentationKey,
	findAcceptedConstructAugmentation,
	findAcceptedSignatureAugmentation,
	upsertAcceptedConstructAugmentation,
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
});

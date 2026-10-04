import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	attachSignatureAugmentations,
	augmentationKey,
	callSiteAugmentationKey,
	findAcceptedConstructAugmentation,
	findAcceptedModuleAugmentation,
	findAcceptedSignatureAugmentation,
	findAcceptedCallSiteAugmentation,
	upsertAcceptedConstructAugmentation,
	upsertAcceptedModuleAugmentation,
	upsertAcceptedSignatureAugmentation,
	upsertAcceptedCallSiteAugmentation,
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
					parameters: [
						{ name: "req", type: "HostInfo" },
						{ name: "opts", type: "Options", optional: true },
					],
					returnType: "Promise<Session>",
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
			expect(hit?.claims.signature?.parameters).toEqual([
				{ name: "req", type: "HostInfo" },
				{ name: "opts", type: "Options", optional: true },
			]);
			expect(hit?.claims.signature?.returnType).toBe("Promise<Session>");
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

describe("attachSignatureAugmentations", () => {
	test("overlays accepted signatures by purl + file#symbol, leaves others untouched", async () => {
		const root = mkdtempSync(join(tmpdir(), "ga-store-"));
		try {
			await upsertAcceptedSignatureAugmentation({
				purl: "pkg:github/acme/widget",
				file: "src/rpc.ts",
				symbol: "handle",
				signature: {
					parameters: [{ name: "req", type: "HostInfo" }],
					returnType: "Promise<Session>",
				},
				source: "gap-filler",
				storeRoot: root,
			});

			const components = [
				{ purl: "pkg:github/acme/widget#src/rpc.ts", file: "src/rpc.ts", symbol: "handle" },
				{ purl: "pkg:github/acme/widget", file: "src/rpc.ts", symbol: "other" },
				{ purl: "pkg:github/acme/widget", file: "src/rpc.ts" },
				{ purl: "pkg:github/acme/other", file: "src/rpc.ts", symbol: "handle" },
			];
			const out = await attachSignatureAugmentations(components, { storeRoot: root });

			expect(out[0]?.signatureAugmentation).toEqual({
				parameters: [{ name: "req", type: "HostInfo" }],
				returnType: "Promise<Session>",
			});
			expect(out[1]?.signatureAugmentation).toBeUndefined();
			expect(out[2]?.signatureAugmentation).toBeUndefined();
			expect(out[3]?.signatureAugmentation).toBeUndefined();
			// Inputs are not mutated.
			expect("signatureAugmentation" in components[0]!).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("upsert then find accepted call site augmentation", async () => {
		const root = mkdtempSync(join(tmpdir(), "ga-store-callsite-"));
		try {
			const written = await upsertAcceptedCallSiteAugmentation({
				purl: "pkg:github/acme/widget",
				file: "src/api.ts",
				symbol: "handleRequest",
				callSite: {
					lines: { start: 42, end: 44 },
					contentHash: "abc123",
					target: { file: "src/db.ts", symbol: "query" },
					mechanism: "calls",
				},
				source: "test-agent",
				rationale: "verified call site",
				evidence: ["observed in code"],
				storeRoot: root,
			});
			expect(written.ok).toBe(true);

			const found = await findAcceptedCallSiteAugmentation({
				purl: "pkg:github/acme/widget",
				file: "src/api.ts",
				symbol: "handleRequest",
				targetFile: "src/db.ts",
				targetSymbol: "query",
				mechanism: "calls",
				storeRoot: root,
			});
			expect(found).not.toBeNull();
			expect(found?.claims.callSite?.lines).toEqual({ start: 42, end: 44 });
			expect(found?.claims.callSite?.contentHash).toBe("abc123");
			expect(found?.claims.callSite?.mechanism).toBe("calls");
			expect(found?.provenance.source).toBe("test-agent");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("callSiteAugmentationKey normalizes paths", () => {
		const key = callSiteAugmentationKey(
			"./src\\caller.ts",
			"myFunc",
			"./target\\callee.ts",
			"otherFunc",
			"calls",
		);
		expect(key).toBe("src/caller.ts::myFunc->target/callee.ts::otherFunc@calls");
	});
});

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promoteAcceptedDeclarationSpans } from "./verify-subsystem-component";
import { upsertAcceptedSpanAugmentation } from "./augmentation-store";
import { createSubsystemModel, getSubsystemModel } from "./subsystem-model-store";
import type { SubsystemComponent } from "@principal-ai/subsystems-react";

/**
 * The non-dry-run promotion pass: an accepted span augmentation is copied onto
 * the component's `declarationSpan`. Acceptance is the clearance — the pass
 * makes no new judgment — so this only checks the sync, not verification.
 */

const KEY = "pkg:github/a/repo-a";

let tmp: string;
let augRoot: string;

beforeAll(() => {
	tmp = mkdtempSync(join(tmpdir(), "promote-spans-"));
	augRoot = mkdtempSync(join(tmpdir(), "promote-spans-aug-"));
	process.env["PRINCIPAL_SUBSYSTEM_MODELS_HOME"] = tmp;
});

afterAll(() => {
	rmSync(tmp, { recursive: true, force: true });
	rmSync(augRoot, { recursive: true, force: true });
	delete process.env["PRINCIPAL_SUBSYSTEM_MODELS_HOME"];
});

const component = (over: Partial<SubsystemComponent>): SubsystemComponent =>
	({
		alias: "c",
		name: "c",
		construct: "function",
		file: "src/a.ts",
		symbol: "a",
		purl: `${KEY}#src/a.ts`,
		...over,
	}) as SubsystemComponent;

async function createModel(components: SubsystemComponent[]): Promise<string> {
	const created = await createSubsystemModel({
		title: `promote-${Math.random().toString(36).slice(2)}`,
		components,
	});
	return created.id;
}

async function acceptSpan(
	over: { symbol: string; span: { startLine: number; endLine: number; contentHash: string } },
): Promise<void> {
	const written = await upsertAcceptedSpanAugmentation({
		purl: `${KEY}#src/a.ts`,
		file: "src/a.ts",
		symbol: over.symbol,
		span: over.span,
		source: "test-agent",
		storeRoot: augRoot,
	});
	expect(written.ok).toBe(true);
}

describe("promoteAcceptedDeclarationSpans", () => {
	test("pins an accepted augmentation onto the component", async () => {
		const id = await createModel([component({ alias: "a", symbol: "a" })]);
		await acceptSpan({
			symbol: "a",
			span: { startLine: 10, endLine: 20, contentHash: "hash-a" },
		});

		const count = await promoteAcceptedDeclarationSpans(id, { storeRoot: augRoot });
		expect(count).toBe(1);

		const graph = await getSubsystemModel(id);
		expect(graph?.components[0]?.declarationSpan).toEqual({
			startLine: 10,
			endLine: 20,
			contentHash: "hash-a",
		});
	});

	test("is idempotent — a second pass writes nothing", async () => {
		const id = await createModel([component({ alias: "b", symbol: "b" })]);
		await acceptSpan({
			symbol: "b",
			span: { startLine: 1, endLine: 4, contentHash: "hash-b" },
		});

		expect(await promoteAcceptedDeclarationSpans(id, { storeRoot: augRoot })).toBe(1);
		expect(await promoteAcceptedDeclarationSpans(id, { storeRoot: augRoot })).toBe(0);
	});

	test("rewrites a stored span that no longer matches the accepted one", async () => {
		const id = await createModel([
			component({
				alias: "c",
				symbol: "c",
				declarationSpan: { startLine: 1, endLine: 2, contentHash: "old" },
			}),
		]);
		await acceptSpan({
			symbol: "c",
			span: { startLine: 5, endLine: 9, contentHash: "new" },
		});

		expect(await promoteAcceptedDeclarationSpans(id, { storeRoot: augRoot })).toBe(1);
		const graph = await getSubsystemModel(id);
		expect(graph?.components[0]?.declarationSpan?.contentHash).toBe("new");
	});

	test("skips identity-less components", async () => {
		const id = await createModel([
			component({ alias: "no-symbol", symbol: undefined }),
		]);

		expect(await promoteAcceptedDeclarationSpans(id, { storeRoot: augRoot })).toBe(0);
	});

	test("writes nothing when no augmentation was accepted", async () => {
		const id = await createModel([component({ alias: "empty", symbol: "empty" })]);
		expect(await promoteAcceptedDeclarationSpans(id, { storeRoot: augRoot })).toBe(0);
	});
});

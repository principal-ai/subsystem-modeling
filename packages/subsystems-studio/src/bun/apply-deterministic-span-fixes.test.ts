import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyDeterministicSpanFixes } from "./verify-subsystem-component";
import { createSubsystemModel, getSubsystemModel } from "./subsystem-model-store";
import type { SubsystemComponent, SubsystemModelAuditReport } from "../shared/contract";

/**
 * The deterministic span lane: the two fix kinds the audit derives exactly —
 * a `trivial` tree-sitter capture and a content-preserving re-pin. The applier
 * is a pure write over the report's findings, so these tests build synthetic
 * reports rather than driving a real audit.
 */

let tmp: string;

beforeAll(() => {
	tmp = mkdtempSync(join(tmpdir(), "det-span-fixes-"));
	process.env["PRINCIPAL_SUBSYSTEM_MODELS_HOME"] = tmp;
});

afterAll(() => {
	rmSync(tmp, { recursive: true, force: true });
	delete process.env["PRINCIPAL_SUBSYSTEM_MODELS_HOME"];
});

const component = (alias: string): SubsystemComponent =>
	({
		alias,
		name: alias,
		construct: "function",
		file: "src/a.ts",
		symbol: alias,
		purl: `pkg:github/a/repo-a#src/a.ts`,
	}) as SubsystemComponent;

const span = (startLine: number, endLine: number, contentHash: string) => ({
	startLine,
	endLine,
	contentHash,
});

function reportWith(
	findings: Array<{
		alias: string;
		fix:
			| { id: "adopt_tree_sitter_span"; label: string; declarationSpan: ReturnType<typeof span> }
			| {
					id: "adopt_graphify_declaration_ref";
					label: string;
					declarationSpan: ReturnType<typeof span>;
			  };
	}>,
): SubsystemModelAuditReport {
	return {
		findings: findings.map((f) => ({
			kind: "construct_span_capturable",
			severity: "info",
			componentAlias: f.alias,
			message: "x",
			fix: f.fix,
		})),
	} as unknown as SubsystemModelAuditReport;
}

async function modelWith(aliases: string[]): Promise<string> {
	const created = await createSubsystemModel({
		title: `det-${Math.random().toString(36).slice(2)}`,
		components: aliases.map(component),
	});
	return created.id;
}

describe("applyDeterministicSpanFixes", () => {
	test("writes a trivial tree-sitter capture", async () => {
		const id = await modelWith(["a"]);
		const report = reportWith([
			{
				alias: "a",
				fix: {
					id: "adopt_tree_sitter_span",
					label: "Capture L10–20",
					declarationSpan: span(10, 20, "h-a"),
				},
			},
		]);

		expect(await applyDeterministicSpanFixes(id, report)).toBe(1);
		const graph = await getSubsystemModel(id);
		expect(graph?.components[0]?.declarationSpan).toEqual(span(10, 20, "h-a"));
	});

	test("writes a content-preserving re-pin", async () => {
		const id = await modelWith(["b"]);
		const report = reportWith([
			{
				alias: "b",
				fix: {
					id: "adopt_graphify_declaration_ref",
					label: "Re-pin to L5",
					declarationSpan: span(5, 9, "h-b"),
				},
			},
		]);

		expect(await applyDeterministicSpanFixes(id, report)).toBe(1);
		const graph = await getSubsystemModel(id);
		expect(graph?.components[0]?.declarationSpan?.startLine).toBe(5);
	});

	test("skips findings without a deterministic span fix", async () => {
		const id = await modelWith(["c"]);
		const report = {
			findings: [
				{ kind: "construct_unconfirmed", severity: "info", componentAlias: "c", message: "no fix" },
				{
					kind: "missing_file",
					severity: "error",
					componentAlias: "c",
					message: "relocate",
					fix: { id: "adopt_graphify_file", label: "move", file: "src/b.ts" },
				},
			],
		} as unknown as SubsystemModelAuditReport;

		expect(await applyDeterministicSpanFixes(id, report)).toBe(0);
		const graph = await getSubsystemModel(id);
		expect(graph?.components[0]?.declarationSpan).toBeUndefined();
	});

	test("is idempotent when the stored span already matches", async () => {
		const id = await modelWith(["d"]);
		const report = reportWith([
			{
				alias: "d",
				fix: {
					id: "adopt_tree_sitter_span",
					label: "Capture",
					declarationSpan: span(1, 4, "h-d"),
				},
			},
		]);

		expect(await applyDeterministicSpanFixes(id, report)).toBe(1);
		expect(await applyDeterministicSpanFixes(id, report)).toBe(0);
	});
});

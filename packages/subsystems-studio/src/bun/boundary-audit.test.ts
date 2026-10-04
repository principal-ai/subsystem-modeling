import { describe, expect, test } from "bun:test";
import type { SubsystemComponent } from "@principal-ai/subsystems-core";
import {
	auditBoundaryFields,
	auditProcessVerification,
	moduleAgreesWithFile,
	normalizeBoundaryPath,
} from "./boundary-audit";
import type { C4Element } from "@principal-ai/subsystems-react";

describe("moduleAgreesWithFile", () => {
	test("exact match and prefix", () => {
		expect(moduleAgreesWithFile("src/a.ts", "src/a.ts")).toBe(true);
		expect(moduleAgreesWithFile("./src/a.ts", "src/a.ts")).toBe(true);
		expect(moduleAgreesWithFile("src/session", "src/session/transcript.ts")).toBe(
			true,
		);
		expect(moduleAgreesWithFile("src/session/paths.ts", "src/session/transcript.ts")).toBe(
			false,
		);
	});

	test("normalizeBoundaryPath", () => {
		expect(normalizeBoundaryPath("./src\\foo.ts")).toBe("src/foo.ts");
	});
});

function comp(
	partial: Partial<SubsystemComponent> & Pick<SubsystemComponent, "alias" | "name" | "construct">,
): SubsystemComponent {
	return {
		purl: "pkg:github/acme/app",
		...partial,
	} as SubsystemComponent;
}

describe("auditBoundaryFields", () => {
	test("module matches file passes", () => {
		const r = auditBoundaryFields([
			comp({
				alias: "a",
				name: "A",
				construct: "function",
				file: "src/a.ts",
				module: "src/a.ts",
				process: "host",
			}),
		]);
		expect(r.summary.moduleFileOk).toBe(1);
		expect(r.findings).toEqual([]);
	});

	test("grounded module without file is ignored (rejected at input)", () => {
		const r = auditBoundaryFields([
			comp({
				alias: "boot",
				name: "boot",
				construct: "function",
				file: "",
				module: "src/host/main.ts",
				process: "host",
			}),
		]);
		expect(r.findings).toEqual([]);
		// No module/file check — the only row is the (claimed) process.
		expect(r.checks.filter((c) => c.kind === "module_file")).toEqual([]);
	});

	test("module without file skipped for external", () => {
		const r = auditBoundaryFields([
			comp({
				alias: "xy",
				name: "xyflow",
				construct: "external",
				module: "pkg:npm/@xyflow/react",
			}),
		]);
		expect(r.checks[0]?.verdict).toBe("skipped");
		expect(r.findings).toEqual([]);
	});

	test("module ≠ file is a soft gap", () => {
		const r = auditBoundaryFields([
			comp({
				alias: "parse",
				name: "parse",
				construct: "function",
				file: "src/session/transcript.ts",
				module: "src/session/paths.ts",
				process: "host",
			}),
		]);
		expect(r.summary.moduleFileMismatch).toBe(1);
		expect(r.checks.find((c) => c.kind === "module_file")?.verdict).toBe("gap");
		expect(r.findings[0]?.kind).toBe("boundary_module_file_mismatch");
		expect(r.findings[0]?.severity).toBe("info");
	});

	test("accepted module augmentation confirms mismatch", () => {
		const r = auditBoundaryFields(
			[
				comp({
					alias: "parse",
					name: "parse",
					construct: "function",
					file: "src/session/transcript.ts",
					module: "src/session/paths.ts",
					process: "host",
				}),
			],
			{ augmentedModuleAliases: new Set(["parse"]) },
		);
		expect(r.summary.moduleFileOk).toBe(1);
		expect(r.summary.moduleFileMismatch).toBe(0);
		expect(r.checks.find((c) => c.kind === "module_file")?.note).toContain(
			"augmented",
		);
		expect(r.findings).toEqual([]);
	});

	test("process nest agrees", () => {
		const r = auditBoundaryFields([
			comp({
				alias: "boot",
				name: "boot",
				construct: "function",
				file: "src/host/main.ts",
				module: "src/host/main.ts",
				process: "host",
			}),
			comp({
				alias: "create",
				name: "create",
				construct: "function",
				file: "src/host/main.ts",
				module: "src/host/main.ts",
				process: "host",
			}),
		]);
		expect(r.summary.processNestsChecked).toBe(1);
		expect(r.summary.processNestOk).toBe(1);
		expect(r.findings.filter((f) => f.kind === "boundary_process_nest_disagree")).toEqual(
			[],
		);
	});

	test("process nest disagrees is a soft gap", () => {
		const r = auditBoundaryFields([
			comp({
				alias: "boot",
				name: "boot",
				construct: "function",
				file: "src/host/main.ts",
				module: "src/host/main.ts",
				process: "host",
			}),
			comp({
				alias: "create",
				name: "create",
				construct: "function",
				file: "src/host/main.ts",
				module: "src/host/main.ts",
				process: "renderer",
			}),
		]);
		expect(r.summary.processNestDisagree).toBe(1);
		expect(
			r.findings.filter((f) => f.kind === "boundary_process_nest_disagree").length,
		).toBe(2);
		expect(r.findings[0]?.severity).toBe("info");
	});

	/*
	 * process_claim — dynamic topology without a module. These are the cases
	 * that separate "process stated, nothing wrong" (green) from "no process
	 * information at all" (grey).
	 */
	describe("process_claim", () => {
		test("a process with no module verifies the dynamic-topology lane", () => {
			const r = auditBoundaryFields([
				comp({
					alias: "boot",
					name: "boot",
					construct: "function",
					file: "src/host/main.ts",
					process: "subsystems-studio/host",
				}),
			]);
			expect(r.summary.processRequired).toBe(1);
			expect(r.summary.processClaimed).toBe(1);
			expect(r.summary.processMissing).toBe(0);
			const claim = r.checks.find((c) => c.kind === "process_claim");
			expect(claim?.verdict).toBe("ok");
			expect(claim?.process).toBe("subsystems-studio/host");
			expect(r.findings).toEqual([]);
			// No module means no process_nest group — the claim stands alone.
			expect(r.checks.filter((c) => c.kind === "process_nest")).toEqual([]);
		});

		test("no process on a runtime component is a soft gap", () => {
			const r = auditBoundaryFields([
				comp({
					alias: "boot",
					name: "boot",
					construct: "function",
					file: "src/host/main.ts",
				}),
			]);
			expect(r.summary.processRequired).toBe(1);
			expect(r.summary.processMissing).toBe(1);
			expect(r.checks.find((c) => c.kind === "process_claim")?.verdict).toBe(
				"gap",
			);
			expect(r.findings[0]?.kind).toBe("boundary_process_missing");
			// Soft: a missing claim is unconfirmed, never a hard failure.
			expect(r.findings[0]?.severity).toBe("info");
		});

		test("types may claim a process but are never required to", () => {
			const r = auditBoundaryFields([
				comp({
					alias: "Shape",
					name: "Shape",
					construct: "interface",
					file: "src/types.ts",
				}),
				comp({
					alias: "Id",
					name: "Id",
					construct: "type_alias",
					file: "src/types.ts",
				}),
			]);
			expect(r.summary.processRequired).toBe(0);
			expect(r.checks).toEqual([]);
			expect(r.findings).toEqual([]);
		});

		test("external and store are not enforced", () => {
			const r = auditBoundaryFields([
				comp({
					alias: "ReactFlow",
					name: "ReactFlow",
					construct: "external",
					module: "pkg:npm/@xyflow/react",
				}),
				comp({
					alias: "tabs",
					name: "tabs",
					construct: "store",
					file: "src/bun/index.ts",
				}),
			]);
			expect(r.summary.processRequired).toBe(0);
			expect(r.checks.filter((c) => c.kind === "process_claim")).toEqual([]);
			expect(
				r.findings.filter((f) => f.kind === "boundary_process_missing"),
			).toEqual([]);
		});

		test("an unknown construct under-enforces rather than over-enforces", () => {
			const r = auditBoundaryFields([
				comp({
					alias: "mystery",
					name: "mystery",
					// A construct added after this policy was written. The union
					// type does not know it, so the cast stands in for that.
					construct: "some_future_construct" as SubsystemComponent["construct"],
					file: "src/x.ts",
				}),
			]);
			expect(r.summary.processRequired).toBe(0);
			expect(r.findings).toEqual([]);
		});

		test("proposed components are exempt", () => {
			const r = auditBoundaryFields([
				comp({
					alias: "later",
					name: "later",
					construct: "function",
					file: "src/x.ts",
					proposed: true,
				}),
			]);
			expect(r.summary.processRequired).toBe(0);
			expect(r.findings).toEqual([]);
		});
	});
});

describe("auditProcessVerification", () => {
	const components = [
		{
			alias: "a",
			name: "a",
			construct: "function",
			file: "src/a.ts",
			purl: "pkg:github/a/repo",
			process: "app/host",
		},
		{
			alias: "b",
			name: "b",
			construct: "function",
			file: "src/b.ts",
			purl: "pkg:github/a/repo",
			process: "app/renderer",
		},
	] as unknown as SubsystemComponent[];

	const container = (
		id: string,
		process: string,
		state: "accepted" | "proposed" | "rejected",
	): C4Element =>
		({
			kind: "container",
			id,
			label: id,
			state,
			containerKind: "application",
			technology: "node",
			process,
		}) as C4Element;

	test("empty store reads as unassigned for every claimed boundary", () => {
		const { checks, findings } = auditProcessVerification(components, []);
		expect(findings.map((x) => [x.kind, x.processKey])).toEqual([
			["boundary_process_unassigned", "app/host"],
			["boundary_process_unassigned", "app/renderer"],
		]);
		expect(findings.every((x) => x.severity === "info")).toBe(true);
		// Every finding carries backing checks so the lane tally (the
		// dynamic-topology icon) sees the same state the issues list shows.
		expect(checks).toHaveLength(2);
		expect(
			checks.every((c) => c.kind === "process_container" && c.verdict === "gap"),
		).toBe(true);
	});

	test("accepted container verifies — silence; proposed and rejected report", () => {
		const { checks, findings } = auditProcessVerification(components, [
			container("c1", "app/host", "accepted"),
			container("c2", "app/renderer", "proposed"),
		]);
		expect(findings).toHaveLength(1);
		expect(findings[0]!.kind).toBe("boundary_process_proposed");
		expect(findings[0]!.processKey).toBe("app/renderer");
		// The verified boundary's check is ok; only the proposed one gaps.
		expect(checks.filter((c) => c.verdict === "ok")).toHaveLength(1);
		expect(checks.filter((c) => c.verdict === "gap")).toHaveLength(1);
	});

	test("accepted beats rejected beats proposed (precedence map)", () => {
		const { findings } = auditProcessVerification(components, [
			container("r", "app/host", "rejected"),
			container("a", "app/host", "accepted"),
			container("p", "app/host", "proposed"),
			container("ok", "app/renderer", "accepted"),
		]);
		expect(findings).toEqual([]);
	});

	test("rejected-only boundary reports without a fix", () => {
		const { findings } = auditProcessVerification(components, [
			container("r", "app/host", "rejected"),
			container("ok", "app/renderer", "accepted"),
		]);
		expect(findings).toHaveLength(1);
		expect(findings[0]!.kind).toBe("boundary_process_rejected");
	});
});

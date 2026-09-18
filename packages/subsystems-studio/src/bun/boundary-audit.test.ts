import { describe, expect, test } from "bun:test";
import type { SubsystemComponent } from "@principal-ai/subsystems-core";
import {
	auditBoundaryFields,
	moduleAgreesWithFile,
	normalizeBoundaryPath,
} from "./boundary-audit";

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
	partial: Partial<SubsystemComponent> & Pick<SubsystemComponent, "id" | "name" | "construct">,
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
				id: "a",
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
				id: "boot",
				name: "boot",
				construct: "function",
				file: "",
				module: "src/host/main.ts",
			}),
		]);
		expect(r.findings).toEqual([]);
		expect(r.checks).toEqual([]);
	});

	test("module without file skipped for external", () => {
		const r = auditBoundaryFields([
			comp({
				id: "xy",
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
				id: "parse",
				name: "parse",
				construct: "function",
				file: "src/session/transcript.ts",
				module: "src/session/paths.ts",
			}),
		]);
		expect(r.summary.moduleFileMismatch).toBe(1);
		expect(r.checks[0]?.verdict).toBe("gap");
		expect(r.findings[0]?.kind).toBe("boundary_module_file_mismatch");
		expect(r.findings[0]?.severity).toBe("info");
	});

	test("accepted module augmentation confirms mismatch", () => {
		const r = auditBoundaryFields(
			[
				comp({
					id: "parse",
					name: "parse",
					construct: "function",
					file: "src/session/transcript.ts",
					module: "src/session/paths.ts",
				}),
			],
			{ augmentedModuleIds: new Set(["parse"]) },
		);
		expect(r.summary.moduleFileOk).toBe(1);
		expect(r.summary.moduleFileMismatch).toBe(0);
		expect(r.checks[0]?.note).toContain("augmented");
		expect(r.findings).toEqual([]);
	});

	test("process nest agrees", () => {
		const r = auditBoundaryFields([
			comp({
				id: "boot",
				name: "boot",
				construct: "function",
				file: "src/host/main.ts",
				module: "src/host/main.ts",
				process: "host",
			}),
			comp({
				id: "create",
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
				id: "boot",
				name: "boot",
				construct: "function",
				file: "src/host/main.ts",
				module: "src/host/main.ts",
				process: "host",
			}),
			comp({
				id: "create",
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
});

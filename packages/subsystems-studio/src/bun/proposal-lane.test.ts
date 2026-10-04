import { describe, expect, test } from "bun:test";
import {
	deriveProposalLane,
	laneForChange,
	laneForFindingKind,
} from "./proposal-lane";
import type { SubsystemModelProposalChange } from "../shared/contract";

const component = (field: string): SubsystemModelProposalChange =>
	({ target: "component", componentAlias: "a", field, value: "x" }) as never;
const augmentation = (field: string): SubsystemModelProposalChange =>
	({ target: "augmentation", componentAlias: "a", field, value: "x" }) as never;
const step = (): SubsystemModelProposalChange =>
	({
		target: "trail-step",
		trailId: "w",
		stepIndex: 0,
		field: "line",
		value: 1,
	}) as never;
const declaration = (field: string): SubsystemModelProposalChange =>
	({
		target: "declaration",
		componentAlias: "a",
		field,
		value: "x",
		lines: { start: 1, end: 1 },
	}) as never;

describe("laneForChange", () => {
	test("component construct/identity -> construct", () => {
		expect(laneForChange(component("file"))).toBe("construct");
		expect(laneForChange(component("symbol"))).toBe("construct");
		expect(laneForChange(component("construct"))).toBe("construct");
		expect(laneForChange(component("declarationRef"))).toBe("construct");
	});
	test("construct/signature augmentation -> construct", () => {
		expect(laneForChange(augmentation("construct"))).toBe("construct");
		expect(laneForChange(augmentation("signature"))).toBe("construct");
	});
	test("authoring a declaration field -> construct", () => {
		// A store's `valueType` fills the declaration the construct panel
		// renders — construct lane, not topology.
		expect(laneForChange(declaration("valueType"))).toBe("construct");
		expect(laneForChange(declaration("storage"))).toBe("construct");
	});
	test("module is static topology", () => {
		expect(laneForChange(component("module"))).toBe("static-topology");
		expect(laneForChange(augmentation("module"))).toBe("static-topology");
	});
	test("process is dynamic topology", () => {
		expect(laneForChange(component("process"))).toBe("dynamic-topology");
	});
	test("trail step", () => {
		expect(laneForChange(step())).toBe("trail");
	});
});

describe("laneForFindingKind", () => {
	test("maps construct findings", () => {
		expect(laneForFindingKind("signature_unconfirmed")).toBe("construct");
		expect(laneForFindingKind("construct_mismatch")).toBe("construct");
		expect(laneForFindingKind("missing_file")).toBe("construct");
		expect(laneForFindingKind("store_type_undeclared")).toBe("construct");
	});
	test("maps boundary findings onto their lanes", () => {
		expect(laneForFindingKind("boundary_module_file_mismatch")).toBe(
			"static-topology",
		);
		expect(laneForFindingKind("boundary_process_nest_disagree")).toBe(
			"dynamic-topology",
		);
		// Process-verification kinds (element-store read) are dynamic-topology.
		expect(laneForFindingKind("boundary_process_unassigned")).toBe(
			"dynamic-topology",
		);
		expect(laneForFindingKind("boundary_process_proposed")).toBe(
			"dynamic-topology",
		);
		expect(laneForFindingKind("boundary_process_rejected")).toBe(
			"dynamic-topology",
		);
		expect(laneForFindingKind("trail")).toBe("trail");
	});
	test("unknown -> null", () => {
		expect(laneForFindingKind(undefined)).toBeNull();
		expect(laneForFindingKind("nope")).toBeNull();
	});
});

describe("deriveProposalLane", () => {
	test("single-lane changes win", () => {
		expect(
			deriveProposalLane({ changes: [component("file"), component("symbol")] }),
		).toBe("construct");
	});
	test("mixed lanes fall back to finding kind", () => {
		expect(
			deriveProposalLane({
				changes: [component("file"), step()],
				finding: { kind: "trail" },
			}),
		).toBe("trail");
	});
	test("mixed lanes with no finding use first change", () => {
		expect(
			deriveProposalLane({ changes: [step(), component("file")] }),
		).toBe("trail");
	});
});

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
const relation = (): SubsystemModelProposalChange =>
	({ target: "relation", relationId: "r", field: "to", value: "b" }) as never;
const step = (): SubsystemModelProposalChange =>
	({
		target: "walkthrough-step",
		walkthroughId: "w",
		stepIndex: 0,
		field: "line",
		value: 1,
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
	test("module is static topology", () => {
		expect(laneForChange(component("module"))).toBe("static-topology");
		expect(laneForChange(augmentation("module"))).toBe("static-topology");
	});
	test("relations are static topology", () => {
		expect(laneForChange(augmentation("relation"))).toBe("static-topology");
		expect(laneForChange(relation())).toBe("static-topology");
	});
	test("process is runtime topology", () => {
		expect(laneForChange(component("process"))).toBe("runtime-topology");
	});
	test("walkthrough step", () => {
		expect(laneForChange(step())).toBe("walkthrough");
	});
});

describe("laneForFindingKind", () => {
	test("maps construct findings", () => {
		expect(laneForFindingKind("signature_unconfirmed")).toBe("construct");
		expect(laneForFindingKind("construct_mismatch")).toBe("construct");
		expect(laneForFindingKind("missing_file")).toBe("construct");
	});
	test("maps topology findings", () => {
		expect(laneForFindingKind("topology_broken_endpoint")).toBe(
			"static-topology",
		);
		expect(laneForFindingKind("boundary_module_file_mismatch")).toBe(
			"static-topology",
		);
		expect(laneForFindingKind("boundary_process_nest_disagree")).toBe(
			"runtime-topology",
		);
		expect(laneForFindingKind("walkthrough")).toBe("walkthrough");
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
				finding: { kind: "walkthrough" },
			}),
		).toBe("walkthrough");
	});
	test("mixed lanes with no finding use first change", () => {
		expect(
			deriveProposalLane({ changes: [step(), component("file")] }),
		).toBe("walkthrough");
	});
});

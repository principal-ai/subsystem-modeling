/**
 * Derive a proposal's verification lane from what it changes.
 *
 * Lanes are the four layers of the model: construct (L1), static topology (L2,
 * relations), dynamic topology (L3, process + package/module containment),
 * walkthrough (L4). A proposal's changes determine the lane; the linked finding
 * kind is a tie-breaker when changes span lanes.
 */

import type {
	SubsystemModelProposalChange,
	SubsystemVerificationLane,
} from "../shared/contract";

export function laneForChange(
	ch: SubsystemModelProposalChange,
): SubsystemVerificationLane {
	if (ch.target === "walkthrough-step") return "walkthrough";
	if (ch.target === "relation") return "static-topology";
	if (ch.target === "augmentation") {
		if (ch.field === "construct" || ch.field === "signature") return "construct";
		if (ch.field === "relation") return "static-topology";
		return "dynamic-topology"; // module (containment)
	}
	// component
	if (ch.field === "process" || ch.field === "module") return "dynamic-topology";
	return "construct";
}

/** Lane implied by an audit finding kind, or null when it isn't lane-specific. */
export function laneForFindingKind(
	kind: string | undefined,
): SubsystemVerificationLane | null {
	switch (kind) {
		case "construct_unconfirmed":
		case "construct_mismatch":
		case "signature_unconfirmed":
		case "signature_mismatch":
		case "missing_file":
		case "symbol_ambiguous":
		case "symbol_unmatched":
		case "stale_declaration":
		case "repo_unresolved":
		case "graphify_unavailable":
			return "construct";
		case "topology_broken_endpoint":
		case "topology_import_unconfirmed":
		case "topology_relation_unconfirmed":
			return "static-topology";
		case "boundary_module_file_mismatch":
		case "boundary_process_nest_disagree":
			return "dynamic-topology";
		case "walkthrough":
			return "walkthrough";
		default:
			return null;
	}
}

export function deriveProposalLane(input: {
	changes: SubsystemModelProposalChange[];
	finding?: { kind?: string };
}): SubsystemVerificationLane {
	const lanes = new Set(input.changes.map(laneForChange));
	if (lanes.size === 1) return [...lanes][0]!;
	const fromFinding = laneForFindingKind(input.finding?.kind);
	if (fromFinding) return fromFinding;
	const first = input.changes[0];
	return first ? laneForChange(first) : "construct";
}

/**
 * Derive a proposal's verification lane from what it changes.
 *
 * Lanes are the four layers of the model: construct (L1), static topology
 * (L2, package/module containment), dynamic topology (L3, process runtime),
 * trail (L4). A proposal's changes determine the lane; the linked finding
 * kind is a tie-breaker when changes span lanes.
 */

import type {
	SubsystemModelProposalChange,
	SubsystemVerificationLane,
} from "../shared/contract";

export function laneForChange(
	ch: SubsystemModelProposalChange,
): SubsystemVerificationLane {
	if (ch.target === "trail-step") return "trail";
	// Authoring a declaration field (e.g. a store's `valueType`) is construct
	// work: it fills the declaration the construct panel renders.
	if (ch.target === "declaration") return "construct";
	if (ch.target === "augmentation") {
		if (ch.field === "construct" || ch.field === "signature") return "construct";
		return "static-topology"; // module (containment)
	}
	// component
	if (ch.field === "module") return "static-topology";
	if (ch.field === "process") return "dynamic-topology";
	return "construct";
}

/** Lane implied by an audit finding kind, or null when it isn't lane-specific. */
export function laneForFindingKind(
	kind: string | undefined,
): SubsystemVerificationLane | null {
	switch (kind) {
		case "construct_unconfirmed":
		case "construct_mismatch":
		case "store_type_undeclared":
		case "store_type_stale":
		case "signature_unconfirmed":
		case "signature_mismatch":
		case "missing_file":
		case "symbol_ambiguous":
		case "symbol_unmatched":
		case "stale_declaration":
		case "repo_unresolved":
		case "graphify_unavailable":
		case "third_party_path":
			return "construct";
		case "boundary_module_file_mismatch":
			return "static-topology";
		case "boundary_process_nest_disagree":
			return "dynamic-topology";
		case "trail":
			return "trail";
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

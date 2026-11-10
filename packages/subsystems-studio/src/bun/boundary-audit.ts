/**
 * Boundary (process / module) audit helpers.
 *
 * The rules live in the shared core audit engine so Studio and the CLI read
 * the same policy. This module re-exports them for existing host callers.
 */

export {
	auditBoundaryFields,
	auditProcessBacking,
	auditProcessVerification,
	dropUnbackedMissing,
	moduleAgreesWithFile,
	normalizeBoundaryPath,
	requiresProcess,
	type BoundaryAuditFinding,
	type BoundaryAuditResult,
	type BoundaryCheckKind,
	type BoundaryCheckVerdict,
	type BoundaryComponentCheck,
} from "../../../subsystems-core/src/audit/boundary";

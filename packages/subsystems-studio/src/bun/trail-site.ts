/**
 * The `calls` / `uses` containment rule.
 *
 * The predicate lives in the shared core audit engine so the audit and tests
 * read the same rule. This module re-exports it for existing host callers.
 */

export { callsSiteOutsideFrom } from "../../../subsystems-core/src/audit/trail";

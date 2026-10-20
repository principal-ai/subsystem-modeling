/**
 * The `calls` / `uses` containment rule.
 *
 * A `calls` step claims the call site lives in the `from` construct. That is
 * what makes the edge a call edge (and the site symbol the caller frame).
 * When the code actually lives in a helper or child component, the honest
 * mechanism is `uses` — a logical dependency whose evidence is elsewhere — or
 * the caller must be modeled and `from` changed.
 *
 * This is deliberately a pure predicate so the audit and tests read the same
 * rule.
 */

import type {
	SubsystemComponent,
	SubsystemTrailStep,
} from "../shared/contract";

type StepSite = Pick<SubsystemTrailStep, "mechanism" | "file" | "span" | "site">;
type FromComponent = Pick<SubsystemComponent, "file" | "declarationSpan">;

/**
 * True when a `calls` step's site is not housed by its `from` component.
 *
 * - Different file → outside (the component cannot contain the site).
 * - Same file but the stored site span falls outside the component's
 *   declaration span → outside (a sibling construct, not a nested one).
 * - Unknown component span / site span → not enough evidence to call it
 *   outside; stay permissive so missing spans stay a separate finding.
 *
 * Always false for non-`calls` mechanisms: `uses`, `feeds`, `writes`, … are
 * allowed to point at evidence in another construct.
 */
export function callsSiteOutsideFrom(
	step: StepSite,
	from: FromComponent | undefined,
): boolean {
	if (step.mechanism !== "calls" || !from) return false;

	const fromFile = from.file?.trim();
	if (fromFile && fromFile !== step.file) return true;

	const fromSpan = from.declarationSpan;
	// Prefer the resolved site construct: it is the precise frame, while the
	// step span is only the call expression inside it. Fall back to the step
	// span for older models that have not captured a site yet.
	const siteSpan = step.site?.span ?? step.span;
	if (fromSpan && siteSpan) {
		return !(
			fromSpan.startLine <= siteSpan.startLine &&
			siteSpan.endLine <= fromSpan.endLine
		);
	}

	return false;
}

/**
 * Cross-field validation for a subsystem model document.
 *
 * These are the rules the JSON Schema (`schemas/subsystem-model.schema.json`)
 * cannot express — anything that spans fields or arrays: alias uniqueness,
 * referential integrity between relations/walkthroughs and components, and the
 * `module` implies `file` invariant. Structural checks (types, `required`,
 * enums, ranges, closed objects) belong to the schema and are enforced per
 * surface; this module owns only what the schema can't.
 *
 * Pure and dependency-free (browser-safe) — no JSON Schema validator here.
 */

import type {
  SubsystemModelDocument,
  SubsystemComponent,
  SubsystemWalkthrough,
} from './types/subsystem-model';

export interface SubsystemValidationProblem {
  /** JSON-pointer-ish location, e.g. `/components/2` or `/relations/0/from`. */
  path: string;
  message: string;
}

function isUngrounded(c: SubsystemComponent): boolean {
  return c.construct === 'external' || c.proposed === true;
}

/**
 * Validate the cross-field rules of a subsystem model document. Returns an
 * empty array when the document is consistent.
 */
export function validateSubsystemModelCrossField(
  doc: SubsystemModelDocument,
): SubsystemValidationProblem[] {
  const problems: SubsystemValidationProblem[] = [];
  const components = doc.components ?? [];
  const relations = doc.relations ?? [];
  const walkthroughs = doc.walkthroughs ?? [];

  // Component aliases must be unique, and the set is the referential target
  // for relations and walkthrough steps.
  const ids = new Set<string>();
  components.forEach((c, i) => {
    if (ids.has(c.alias)) {
      problems.push({
        path: `/components/${i}/alias`,
        message: `component ${JSON.stringify(c.alias)}: duplicate alias`,
      });
    } else {
      ids.add(c.alias);
    }
    // A grounded component that claims a `module` needs a `file` to ground the
    // frame. Externals / proposed carry no file by design.
    const module = typeof c.module === 'string' ? c.module.trim() : '';
    const file = typeof c.file === 'string' ? c.file.trim() : '';
    if (module && !file && !isUngrounded(c)) {
      problems.push({
        path: `/components/${i}/module`,
        message: `component ${JSON.stringify(c.alias)}: module ${JSON.stringify(module)} is set but file is empty — a module frame needs a file to ground it (mark the component proposed if it is not placed yet).`,
      });
    }
  });

  relations.forEach((r, i) => {
    if (!ids.has(r.from)) {
      problems.push({
        path: `/relations/${i}/from`,
        message: `relation ${JSON.stringify(r.id)}: from ${JSON.stringify(r.from)} does not match any component alias`,
      });
    }
    if (!ids.has(r.to)) {
      problems.push({
        path: `/relations/${i}/to`,
        message: `relation ${JSON.stringify(r.id)}: to ${JSON.stringify(r.to)} does not match any component alias`,
      });
    }
  });

  walkthroughs.forEach((w: SubsystemWalkthrough, wi) => {
    (w.steps ?? []).forEach((step, si) => {
      if (!ids.has(step.from)) {
        problems.push({
          path: `/walkthroughs/${wi}/steps/${si}/from`,
          message: `walkthrough ${JSON.stringify(w.id)}: step ${si} from ${JSON.stringify(step.from)} does not match any component alias`,
        });
      }
      if (!ids.has(step.to)) {
        problems.push({
          path: `/walkthroughs/${wi}/steps/${si}/to`,
          message: `walkthrough ${JSON.stringify(w.id)}: step ${si} to ${JSON.stringify(step.to)} does not match any component alias`,
        });
      }
    });
  });

  return problems;
}

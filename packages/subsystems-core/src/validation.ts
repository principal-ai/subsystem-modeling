/**
 * Cross-field validation for a subsystem model document.
 *
 * These are the rules the JSON Schema (`schemas/subsystem-model.schema.json`)
 * cannot express — anything that spans fields or arrays: alias uniqueness,
 * referential integrity between trails and components, and the
 * `module` implies `file` invariant. Structural checks (types, `required`,
 * enums, ranges, closed objects) belong to the schema and are enforced per
 * surface; this module owns only what the schema can't.
 *
 * Pure and dependency-free (browser-safe) — no JSON Schema validator here.
 */

import type {
  SubsystemModelDocument,
  SubsystemComponent,
  SubsystemTrail,
} from './types/subsystem-model';

export interface SubsystemValidationProblem {
  /** JSON-pointer-ish location, e.g. `/components/2` or `/trails/0/steps/0/from`. */
  path: string;
  message: string;
}

function isUngrounded(c: SubsystemComponent): boolean {
  return c.construct === 'external' || c.proposed === true;
}

/**
 * `file` is a path *inside the repo named by `purl`* — it resolves against that
 * checkout, never against an installed artifact. `node_modules/` is installed,
 * gitignored, and its layout depends on hoisting, so a claim anchored there can
 * never resolve and is unverifiable by construction.
 *
 * Such a component is a third-party dependency: model it as `construct:
 * 'external'` with `purl: 'pkg:npm/<package>'` and no file. Applies to externals
 * too — they carry no file by design, so an install path there is dead weight
 * that draws a link nothing can open. `proposed` is exempt like every other
 * grounding rule: its file is a placeholder for something not placed yet.
 *
 * The same rule covers trail step files — a seam into an external belongs
 * at the call site in the caller, which *is* in the repo.
 */
function mentionsNodeModules(path: string): boolean {
  return /(^|\/)node_modules(\/|$)/.test(path);
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
  const trails = doc.trails ?? [];

  // Component aliases must be unique, and the set is the referential target
  // for trail steps.
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
    if (file && c.proposed !== true && mentionsNodeModules(file)) {
      problems.push({
        path: `/components/${i}/file`,
        message: `component ${JSON.stringify(c.alias)}: file ${JSON.stringify(file)} points into node_modules — installed artifacts are not part of the repo and cannot be verified. Model the dependency as construct "external" with purl "pkg:npm/<package>" and no file, or anchor the claim to the package's real source.`,
      });
    }
  });

  trails.forEach((w: SubsystemTrail, ti) => {
    (w.steps ?? []).forEach((step, si) => {
      if (!ids.has(step.from)) {
        problems.push({
          path: `/trails/${ti}/steps/${si}/from`,
          message: `trail ${JSON.stringify(w.id)}: step ${si} from ${JSON.stringify(step.from)} does not match any component alias`,
        });
      }
      if (!ids.has(step.to)) {
        problems.push({
          path: `/trails/${ti}/steps/${si}/to`,
          message: `trail ${JSON.stringify(w.id)}: step ${si} to ${JSON.stringify(step.to)} does not match any component alias`,
        });
      }
      // A file-anchored step purl names its own site: the fragment must be
      // the step file. Repo-only purls still resolve, so only the anchored
      // form is checked.
      if (typeof step.purl === 'string' && step.purl.includes('#')) {
        const fragment = step.purl.split('#').slice(1).join('#');
        if (fragment !== step.file) {
          problems.push({
            path: `/trails/${ti}/steps/${si}/purl`,
            message: `trail ${JSON.stringify(w.id)}: step ${si} purl fragment ${JSON.stringify(fragment)} does not match step file ${JSON.stringify(step.file)}`,
          });
        }
      }
      if (mentionsNodeModules(step.file)) {
        problems.push({
          path: `/trails/${ti}/steps/${si}/file`,
          message: `trail ${JSON.stringify(w.id)}: step ${si} file ${JSON.stringify(step.file)} points into node_modules — anchor the seam at the call site inside the repo instead.`,
        });
      }
    });
  });

  return problems;
}

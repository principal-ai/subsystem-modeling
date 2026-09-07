/**
 * Auxiliary module
 *
 * Validation for `auxiliary.manifest.json` — the catalog of project regions
 * that sit outside the OTEL telemetry surface (docs, .github, etc.).
 */

export {
  AuxiliaryManifestValidator,
  type AuxiliaryManifestValidationContext,
  type AuxiliaryManifestValidationResult,
  type AuxiliaryManifestViolation,
} from './AuxiliaryManifestValidator';

export {
  validateAreaScopeDisjoint,
  type ValidateAreaScopeDisjointInput,
} from './validateAreaScopeDisjoint';

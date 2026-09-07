/**
 * Scopes module
 *
 * Provides utilities and validation for instrumentation scopes:
 * - Scope utilities for working with top-level scopes and owned-scopes references
 * - Validation for .scopes.canvas files that document scope boundaries
 */

export {
  ScopesCanvasValidator,
  type ScopesCanvasValidationContext,
  type ScopesCanvasValidationResult,
  type ScopesCanvasViolation,
} from './ScopesCanvasValidator';

export {
  ScopePathIndex,
  type ScopePathEntry,
  type ScopePathMatch,
} from './ScopePathIndex';

export {
  validateScopeNamespaceNesting,
  type ScopeEventsCanvasPair,
  type ValidateScopeNamespaceNestingInput,
} from './validateScopeNamespaceNesting';

export {
  DEFAULT_SCOPE_COLOR,
  DRAFT_NODE_COLOR,
  getScopeNames,
  getScopeDefinition,
  getScopeColor,
  getScopeIcon,
  normalizeScopes,
  buildScopeColorMap,
  buildScopeColorMapFromCanvas,
  getScopeNamesFromCanvas,
  getScopeNodeFromCanvas,
  getAllScopeNames,
  type NormalizedScope,
} from './utils';

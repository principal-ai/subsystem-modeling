/**
 * Node verification layer (tree-sitter + declarations + component verify).
 *
 * Imported through `@principal-ai/subsystems-core/audit`; never from the
 * browser-safe package entry.
 */

export {
  CONSTRUCT_GRAMMARS,
  constructFileSupport,
  grammarFile,
} from './grammar'
export { parserFor, sharedParserFor, parseWith } from './parser'
export {
  declarationForSymbol,
  enclosingDeclaration,
  parseDeclarations,
  safeSource,
  type ParsedDeclaration,
  type ParsedDeclarations,
  type ResolvedConstructDeclaration,
} from './declarations'
export {
  GATE_LABELS,
  deriveSpan,
  disposeSpanTreeCache,
  languageKey,
  type DeriveInput,
  type SpanClass,
  type SpanDerivation,
  type SpanTreeCache,
} from './span'
export {
  verifySubsystemComponent,
  verifyVerdict,
  type VerifyComponentAugmentation,
  type VerifyComponentDeps,
  type VerifyComponentOptions,
  type VerifyComponentSignatureClaim,
  type VerifyComponentSpanClaim,
} from './component'

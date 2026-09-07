/**
 * Workflow Template System
 *
 * Transform OpenTelemetry event streams into human-readable execution workflows.
 *
 * @module workflow
 */

// Types
export type {
  WorkflowTemplate,
  WorkflowScenario,
  ScenarioOutcomeType,
  ScenarioTemplate,
  EventTemplate,
  LogTemplates,
  FormattingOptions,
  OtelEvent,
  OtelSignal,
  WorkflowContext,
  WorkflowResult,
  ScenarioMatchResult,
  ScenarioMatchDetail,
  EnhancedScenarioMatchResult,
  WorkflowMatch,
  SpanTreeNode,
} from './types';

// Type helpers
export {
  isEventTemplate,
  getEventTemplateString,
  getEventSpan,
  getWorkflowRootSpan,
} from './types';

// Scenario Matching
export { selectScenario, getRequiredEvents, hasEventMatching, computeAggregates, getNestedValue, setNestedValue } from './scenario-matcher';

// Template Parsing
export { parseTemplate, ParsedTemplate } from './template-parser';
export type { TemplateSegment, TemplateContext, TemplateValue, TemplateData } from './template-parser';

// Template Rendering
export { renderWorkflow, renderEventTemplate } from './template-renderer';

// Validation
export type {
  WorkflowValidationContext,
  WorkflowViolation,
  WorkflowValidationResult,
} from './validator';
export { WorkflowValidator, createWorkflowValidator } from './validator';

// Edge Derivation
export type {
  DerivedEdge,
  WorkflowEdgeDerivationResult,
  EdgeDerivationResult,
} from './edge-derivation';
export {
  extractEventSpans,
  deriveEdgesFromSequence,
  deriveWorkflowEdges,
  deriveEdgesFromWorkflows,
  groupEdgesBySources,
} from './edge-derivation';

// Edge Validation
export type {
  SpanNodeInfo,
  CanvasEdgeInfo,
  EdgeValidationResult,
  ValidatedEdge,
  MissingEdge,
  UnusedEdge,
  UnmatchedSpan,
} from './edge-validation';
export {
  extractSpanNodes,
  extractCanvasEdges,
  matchSpanToPattern,
  findMatchingNode,
  validateEdges,
  formatValidationResult,
} from './edge-validation';

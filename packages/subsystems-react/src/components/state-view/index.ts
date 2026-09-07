/**
 * State View Components
 *
 * A pattern for state-driven visualizations where:
 * - Telemetry events are processed into state changes
 * - State has a defined shape
 * - State changes trigger animations/transitions
 */

export * from './types';
export { useStateView } from './useStateView';
export type { UseStateViewOptions, UseStateViewResult } from './useStateView';
export { PipelineView } from './PipelineView';
export type { PipelineViewProps } from './PipelineView';

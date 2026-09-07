/**
 * Storyboard Context Module
 *
 * Types and utilities for building storyboard context data that panels consume.
 */

// Types
export type {
  StoryboardReference,
  WorkflowReference,
  ScenarioReference,
  StoryboardContextSliceData,
} from './types';

// Builder utilities
export {
  buildStoryboardContext,
  buildEventNodeMap,
  getNodeEventName,
  resolveScenarioNodeIds,
  resolveWorkflowNodeIds,
  findNodesMatchingEventPattern,
  getAllNodeIds,
} from './builder';

export type { EventNodeMap, BuildStoryboardContextOptions } from './builder';

/**
 * Built-in rule implementations
 */

// Schema rules
export { requiredMetadata } from './required-metadata';
export { validNodeTypes } from './valid-node-types';
export { validEdgeTypes } from './valid-edge-types';
export { validColorFormat } from './valid-color-format';
export { noUnknownFields } from './no-unknown-fields';

// Reference rules
export { connectionTypeReferences } from './connection-type-references';
export { stateTransitionReferences } from './state-transition-references';

// Structure rules
export { minimumNodeSources, type MinimumNodeSourcesOptions } from './minimum-node-sources';
export { orphanedNodeTypes } from './orphaned-node-types';
export { orphanedEdgeTypes } from './orphaned-edge-types';
export { unreachableStates } from './unreachable-states';
export { deadEndStates, type DeadEndStatesOptions } from './dead-end-states';

// Pattern rules
export { validActionPatterns, type ValidActionPatternsOptions } from './valid-action-patterns';

import type { GraphRule } from '../types';
import { requiredMetadata } from './required-metadata';
import { validNodeTypes } from './valid-node-types';
import { validEdgeTypes } from './valid-edge-types';
import { validColorFormat } from './valid-color-format';
import { noUnknownFields } from './no-unknown-fields';
import { connectionTypeReferences } from './connection-type-references';
import { stateTransitionReferences } from './state-transition-references';
import { minimumNodeSources } from './minimum-node-sources';
import { orphanedNodeTypes } from './orphaned-node-types';
import { orphanedEdgeTypes } from './orphaned-edge-types';
import { unreachableStates } from './unreachable-states';
import { deadEndStates } from './dead-end-states';
import { validActionPatterns } from './valid-action-patterns';

/**
 * All built-in rules
 * Cast to GraphRule[] since rules with specific options extend the base interface
 */
export const builtinRules: GraphRule[] = [
  // Schema rules (5)
  noUnknownFields,
  requiredMetadata,
  validNodeTypes,
  validEdgeTypes,
  validColorFormat,

  // Reference rules (2)
  connectionTypeReferences,
  stateTransitionReferences,

  // Structure rules (5)
  minimumNodeSources as unknown as GraphRule,
  orphanedNodeTypes,
  orphanedEdgeTypes,
  unreachableStates,
  deadEndStates as unknown as GraphRule,

  // Pattern rules (1)
  validActionPatterns as unknown as GraphRule,
];

/**
 * @principal-ai/subsystems-core
 * Browser-safe exports (no Node.js dependencies)
 *
 * Subsystem model types and schema helpers.
 *
 * For Node.js agent-session / OpenCode tooling:
 *   import { ... } from '@principal-ai/subsystems-core/node'
 *
 * For Bun-safe session pipeline (no better-sqlite3):
 *   import { ... } from '@principal-ai/subsystems-core/pipeline'
 */

export * from './types';

export type {
  DraftTopic,
  TopicAsset,
  TopicCreator,
  TopicSubsystemModelRef,
  TopicReference,
} from './storage/topic-types';
export { formatTopicReferenceLink, parseTopicReferenceLink } from './storage/topic-reference-links';

// Cross-field validation (the rules the JSON Schema can't express). Structural
// (schema) validation is enforced per surface against
// `schemas/subsystem-model.schema.json`.
export { validateSubsystemModelCrossField } from './validation';
export type { SubsystemValidationProblem } from './validation';

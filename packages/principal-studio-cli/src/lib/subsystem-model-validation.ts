/**
 * Subsystem-model input validation (CLI surface).
 *
 * Two passes, by design:
 *  1. **Schema** — the published document schema (owned by subsystems-core),
 *     enforced here with Ajv. Enforced per surface.
 *  2. **Cross-field** — the rules the schema can't express (id uniqueness,
 *     endpoint references, `module` implies `file`), from subsystems-core.
 *
 * Mirrors the Studio gate — separate but similar, per surface.
 */

import Ajv2020 from 'ajv/dist/2020';
import type { ErrorObject } from 'ajv';
import { validateSubsystemModelCrossField } from '@principal-ai/subsystems-core';
import type { SubsystemModelDocument } from '@principal-ai/subsystems-core';
import schema from '@principal-ai/subsystems-core/schemas/subsystem-model.schema.json';

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateDocument = ajv.compile(schema as object);

const DOCUMENT_KEYS = [
  '$schema',
  'title',
  'description',
  'components',
  'trails',
] as const;

/** Project the portable document fields off a create/update payload. */
export function portableDocumentFrom(
  input: Record<string, unknown>,
): SubsystemModelDocument {
  const doc: Record<string, unknown> = {};
  for (const key of DOCUMENT_KEYS) {
    if (input[key] !== undefined) doc[key] = input[key];
  }
  return doc as unknown as SubsystemModelDocument;
}

function formatSchemaError(e: ErrorObject): string {
  const where = e.instancePath || '/';
  const params = e.params as { allowedValues?: unknown[] } | undefined;
  const allowed = params?.allowedValues
    ? ` — allowed: ${params.allowedValues.join(', ')}`
    : '';
  return `${where} ${e.message}${allowed}`;
}

/**
 * Structural + cross-field problems for a create/update payload (empty = valid).
 * Only the portable document fields are validated; host fields are ignored.
 */
export function findSubsystemModelProblems(
  input: Record<string, unknown>,
): string[] {
  const doc = portableDocumentFrom(input);
  if (!validateDocument(doc)) {
    return (validateDocument.errors ?? []).map(formatSchemaError);
  }
  return validateSubsystemModelCrossField(doc).map(
    (p) => `${p.path} ${p.message}`,
  );
}

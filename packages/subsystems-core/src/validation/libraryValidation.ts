/**
 * Library Validation
 *
 * Standalone validation functions for ComponentLibrary schema.
 * Used by both LibraryLoader (core), LibraryDiscovery, and CLI validation.
 */

import type { ComponentLibrary } from '../types/library';

/**
 * Types of library validation errors
 */
export type LibraryValidationErrorType =
  | 'parse-error'
  | 'validation-error'
  | 'schema-error'
  | 'scopes-canvas-required';

/**
 * A library validation error
 *
 * Unified type used across LibraryLoader, LibraryDiscovery, and CLI validation.
 */
export interface LibraryValidationError {
  /** Error message */
  message: string;
  /** Path to the invalid field or file */
  path: string;
  /** Error category */
  type?: LibraryValidationErrorType;
  /** Optional suggestion for fixing the error */
  suggestion?: string;
}

/**
 * Result of library structure validation
 */
export interface LibraryValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** List of validation errors (empty if valid) */
  errors: LibraryValidationError[];
}

/** Helper to create a schema error */
function schemaError(message: string, path: string, suggestion?: string): LibraryValidationError {
  return { message, path, type: 'schema-error', suggestion };
}

/**
 * Validate a ComponentLibrary structure
 *
 * This validates the core schema requirements:
 * - Required fields (version, name, nodeComponents, edgeComponents)
 * - Event schemas structure
 * - Top-level scopes (color required unless external)
 * - Resources structure and owned-scopes references
 * - Connection rules references
 *
 * Note: This does NOT validate unknown fields or icon names.
 * The CLI adds those supplementary validations.
 *
 * @param library - The library object to validate
 * @returns Validation result with any errors
 */
export function validateLibraryStructure(library: ComponentLibrary): LibraryValidationResult {
  const errors: LibraryValidationError[] = [];

  // Required fields
  if (!library.version) {
    errors.push(schemaError(
      'Missing required field "version"',
      'version',
      'Add: version: "1.0.0"'
    ));
  }

  if (!library.name) {
    errors.push(schemaError(
      'Missing required field "name"',
      'name',
      'Add: name: "my-library"'
    ));
  }

  // Validate event schemas if present
  if (library.eventSchemas !== undefined) {
    if (typeof library.eventSchemas !== 'object' || library.eventSchemas === null) {
      errors.push(schemaError(
        'Field "eventSchemas" must be an object',
        'eventSchemas',
        'Use: eventSchemas: { "my-event": { description: "...", attributes: {} } }'
      ));
    } else {
      for (const [eventName, schema] of Object.entries(library.eventSchemas)) {
        if (!schema.description) {
          errors.push(schemaError(
            `Event schema "${eventName}" is missing required field "description"`,
            `eventSchemas.${eventName}.description`,
            'Add a description for this event schema'
          ));
        }

        if (!schema.attributes || typeof schema.attributes !== 'object') {
          errors.push(schemaError(
            `Event schema "${eventName}" is missing or has invalid "attributes" field`,
            `eventSchemas.${eventName}.attributes`,
            'Add: attributes: {} (can be empty but must be present)'
          ));
        } else {
          // Validate each attribute
          const validTypes = ['string', 'number', 'boolean', 'object', 'array'];
          for (const [attrName, attrSchema] of Object.entries(schema.attributes)) {
            if (!attrSchema.type) {
              errors.push(schemaError(
                `Event schema "${eventName}" attribute "${attrName}" is missing required field "type"`,
                `eventSchemas.${eventName}.attributes.${attrName}.type`,
                `Add type: one of ${validTypes.join(', ')}`
              ));
            } else if (!validTypes.includes(attrSchema.type)) {
              errors.push(schemaError(
                `Event schema "${eventName}" attribute "${attrName}" has invalid type "${attrSchema.type}"`,
                `eventSchemas.${eventName}.attributes.${attrName}.type`,
                `Valid types: ${validTypes.join(', ')}`
              ));
            }
          }
        }
      }
    }
  }

  // Note: scopes validation removed - scopes field is deprecated
  // The CLI validate.ts will show an error if library.scopes is present

  // Validate resources if present
  if (library.resources !== undefined) {
    if (typeof library.resources !== 'object' || library.resources === null || Array.isArray(library.resources)) {
      errors.push(schemaError(
        'Field "resources" must be an object',
        'resources',
        'Use: resources: { my-service: { "service.name": "my-service", ... } }'
      ));
    } else {
      for (const [serviceId, resourceAttrs] of Object.entries(library.resources)) {
        if (typeof resourceAttrs !== 'object' || Array.isArray(resourceAttrs) || resourceAttrs === null) {
          errors.push(schemaError(
            `Resource "${serviceId}" must be an object`,
            `resources.${serviceId}`,
            'Use: { "service.name": "...", "owned-scopes": [...] }'
          ));
          continue;
        }

        // Check that service.name is present (required)
        if (!resourceAttrs['service.name']) {
          errors.push(schemaError(
            `Resource "${serviceId}" is missing required attribute "service.name"`,
            `resources.${serviceId}`,
            'Add: "service.name": "my-service-name"'
          ));
        }

        // Validate owned-scopes
        const ownedScopes = resourceAttrs['owned-scopes'];
        if (ownedScopes !== undefined) {
          if (!Array.isArray(ownedScopes)) {
            errors.push(schemaError(
              `Resource "${serviceId}" owned-scopes must be an array`,
              `resources.${serviceId}.owned-scopes`,
              'Use: owned-scopes: ["scope-name-1", "scope-name-2"]'
            ));
          } else {
            for (const scope of ownedScopes) {
              if (typeof scope !== 'string') {
                errors.push(schemaError(
                  `Resource "${serviceId}" owned-scopes contains non-string value`,
                  `resources.${serviceId}.owned-scopes`,
                  'All owned-scopes entries must be strings'
                ));
              }
              // Note: Scope existence validation removed - scopes are now defined in .scopes.canvas
              // The CLI will validate that owned-scopes exist in .scopes.canvas
            }
          }
        }

        // Validate other attributes are strings (except owned-scopes)
        for (const [attrName, attrValue] of Object.entries(resourceAttrs)) {
          if (attrName !== 'owned-scopes' && typeof attrValue !== 'string') {
            errors.push(schemaError(
              `Resource "${serviceId}" attribute "${attrName}" must have a string value`,
              `resources.${serviceId}.${attrName}`,
              'Resource attributes (except owned-scopes) must be strings'
            ));
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Auxiliary Manifest Types
 *
 * The auxiliary manifest catalogs project regions that are *not* OTEL scopes —
 * folders like `docs/` or `.github/` that support the project but don't emit
 * telemetry. Scope paths and area paths together form a partition of the
 * accounted-for filesystem.
 *
 * The manifest is open-ended: `areas` is the first section, but the top-level
 * shape leaves room for future sibling sections (e.g. external integrations)
 * without breaking the format.
 */

/**
 * One project area — a folder (or file) that supports the project outside the
 * OTEL telemetry surface.
 */
export interface ProjectArea {
  /**
   * Display name. Must be unique across all areas in the manifest — used as
   * the area's identifier in diagnostics.
   */
  name: string;

  /**
   * One or more repo-relative paths owned by this area. Each entry may be a
   * folder (covers all descendants) or a specific file. Paths must not
   * overlap other areas, and must not overlap any scope path declared in a
   * `.scopes.canvas`.
   */
  paths: string[];

  /**
   * Free-text purpose. The "light documentation" — a sentence about why this
   * folder exists.
   */
  description: string;
}

/**
 * The full manifest document. Persisted at
 * `.principal-views/auxiliary.manifest.json`.
 */
export interface AuxiliaryManifest {
  /**
   * Optional pointer to the JSON Schema that describes this file. Lets editors
   * give autocomplete and validation when the field is set.
   */
  $schema?: string;

  /** Project areas declared in this manifest. */
  areas: ProjectArea[];
}

/**
 * Type guard: true when the value plausibly conforms to `AuxiliaryManifest`.
 * Shallow check — full validation lives in `AuxiliaryManifestValidator`.
 */
export function isAuxiliaryManifest(value: unknown): value is AuxiliaryManifest {
  if (!value || typeof value !== 'object') return false;
  const v = value as { areas?: unknown };
  return Array.isArray(v.areas);
}

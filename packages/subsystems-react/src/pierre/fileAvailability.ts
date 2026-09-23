/**
 * Host file reads fail with a small, stable set of messages when a path can't
 * be served from any local checkout — most often a *proposed* seam whose file
 * isn't implemented yet. These helpers detect that class of failure so the
 * Pierre views can show a proposed / not-yet-available notice instead of a raw
 * host error.
 */

/** Substrings the host uses when a read can't resolve to a local file. */
const UNAVAILABLE_FRAGMENTS = [
  'not found in graph repos',
  'graph has no local root',
  'no local checkout',
] as const;

/** True when a read failed because the file has no local checkout, not because
 *  of an I/O or permission error. */
export function isFileUnavailableError(
  message: string | null | undefined,
): boolean {
  if (!message) return false;
  return UNAVAILABLE_FRAGMENTS.some((fragment) => message.includes(fragment));
}

/**
 * One-line notice shown in place of a snippet whose file can't be read. When
 * the step touches a proposed component the wording names that, so a proposed
 * seam reads as "planned" rather than "missing".
 */
export function fileUnavailableNotice(
  path: string,
  proposed?: boolean,
): string {
  return proposed
    ? `Proposed — ${path} isn't in the local checkout yet.`
    : `Not in the local checkout: ${path}`;
}

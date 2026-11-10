/**
 * Purl helpers shared by the audit engine.
 *
 * A component's `file` is relative to its own repo, identified by the purl
 * repo key (fragment stripped). These are pure string helpers so the engine
 * can group claims by repository without depending on a viewer package.
 */

/** Normalize a purl to its repo key: fragment and surrounding whitespace stripped. */
export function purlRepoKey(purl: string | undefined): string | undefined {
  if (!purl) return undefined
  const base = purl.split('#')[0]?.trim()
  return base || undefined
}

/**
 * True when a purl identifies a code repo checkout a host can resolve
 * locally. `external:` and other pseudo-purls are stable identities, not
 * checkouts.
 */
export function isRepoPurl(purl: string | undefined): boolean {
  const key = purlRepoKey(purl)
  if (!key) return false
  return /^pkg:github\//i.test(key)
}

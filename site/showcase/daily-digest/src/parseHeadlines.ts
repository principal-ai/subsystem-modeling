/**
 * Turn page HTML into a short list of headline strings.
 *
 * Kept deliberately small — beginners often start with a regex or a tiny
 * DOM walk before reaching for a full scraper framework.
 */
export function parseHeadlines(html: string, limit = 10): string[] {
  const matches = [...html.matchAll(/<span class="titleline"><a [^>]*>([^<]+)<\/a>/g)];
  return matches.slice(0, limit).map((m) => m[1].trim());
}

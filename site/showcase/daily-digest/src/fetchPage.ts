/**
 * Pull the raw HTML for a URL — the script's only network hop.
 */
export async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'user-agent': 'daily-digest/1.0 (personal cron)' },
  });
  if (!res.ok) {
    throw new Error(`fetch ${url} failed: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

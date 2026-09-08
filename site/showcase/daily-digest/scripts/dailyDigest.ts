/**
 * Daily page digest — what cron invokes.
 *
 * Typical crontab entry:
 *   0 8 * * *  node scripts/dailyDigest.ts
 *
 * Fetches a public page once a day, extracts headlines, and appends them
 * to a local digest file so you can skim what changed without opening a browser.
 */
import { fetchPage } from '../src/fetchPage';
import { parseHeadlines } from '../src/parseHeadlines';
import { writeDigest } from '../src/writeDigest';

const SOURCE_URL = process.env.DIGEST_URL ?? 'https://news.ycombinator.com';

async function main() {
  const html = await fetchPage(SOURCE_URL);
  const headlines = parseHeadlines(html);
  await writeDigest('digest.txt', headlines);
  console.log(`Wrote ${headlines.length} headlines to digest.txt`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

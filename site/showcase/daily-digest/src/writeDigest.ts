import { appendFile } from 'node:fs/promises';

/**
 * Append today's headlines to a local digest file (the cron run's side effect).
 */
export async function writeDigest(path: string, headlines: string[]): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 10);
  const block = [
    `## ${stamp}`,
    ...headlines.map((h) => `- ${h}`),
    '',
  ].join('\n');
  await appendFile(path, block, 'utf8');
}

/**
 * Topic command — open a topic in the running desktop app.
 *
 * Topics are created and browsed from the desktop app (backed by the local
 * Principal MCP bridge). The CLI only routes an id to that running app.
 */

import { Command } from 'commander';
import { handoffTopicToBridge } from '../lib/bridge-ipc.js';

/** Extract a topic id from a bare id or a `…/topic/<id>` URL. */
function parseTopicId(input: string): string {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/topic\/([^/]+)\/?$/);
    if (match && match[1]) return match[1];
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length) return segments[segments.length - 1]!;
  } catch {
    // not a URL — fall through and treat input as a bare id
  }
  return trimmed;
}

async function openTopic(input: string): Promise<void> {
  const id = parseTopicId(input);
  if (!id) {
    process.stderr.write('Invalid topic id\n');
    process.exit(2);
  }

  if (await handoffTopicToBridge(id)) {
    process.stderr.write(`Topic opened in running desktop app: ${id}\n`);
    process.exit(0);
  }

  process.stderr.write(
    `Could not open topic ${id}: no running desktop app is serving it. ` +
      `Start the Principal desktop app and retry.\n`,
  );
  process.exit(1);
}

export function createTopicCommand(): Command {
  const command = new Command('topic');

  command.description('Open a topic in the running desktop app');

  command
    .command('open')
    .description('Open a topic in the running desktop app')
    .argument('<id-or-url>', 'Topic id or URL')
    .action(async (input: string) => {
      await openTopic(input);
    });

  return command;
}

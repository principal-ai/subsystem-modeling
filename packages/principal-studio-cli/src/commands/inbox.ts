/**
 * Inbox command — fetch your trail inbox state from the Principal ADE backend.
 *
 * Resolves a GitHub token locally (gh CLI → git credential helper) and calls
 * `GET /api/trails/inbox` with `Authorization: Bearer <token>`. The token is
 * never echoed to argv, env, stdout, or stderr. The response carries a
 * server-derived `notification` per row ({ dot, unread, noteCount,
 * newNoteCount }) plus a top-level `unreadCount`, so an agent can see which
 * shared trails need attention and how many notes are new since last open.
 */

import { Command } from 'commander';
import { spawnSync } from 'node:child_process';
import chalk from 'chalk';

const BASE_URL = 'https://app.principal-ade.com';

/** Server-derived notification state for one inbox row. */
interface InboxNotification {
  /** Whether to show the attention dot (unopened OR has unseen notes). */
  dot: boolean;
  /** Trail itself never opened. */
  unread: boolean;
  /** Total notes on the trail. */
  noteCount: number;
  /** Notes added since the recipient last opened the trail. */
  newNoteCount: number;
}

interface InboxEntry {
  trailId: string;
  sender: { githubId: number; githubLogin: string };
  comment?: string;
  sentAt: string;
  readAt: string | null;
  notesSeenCount?: number;
  owner: string;
  repo: string;
  snapshot?: { title?: string; noteCount?: number; updatedAt?: string };
  notification?: InboxNotification;
}

interface InboxResponse {
  entries: InboxEntry[];
  unreadCount: number;
  cursor?: string;
}

function resolveTokenViaGh(): string | null {
  const result = spawnSync('gh', ['auth', 'token'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status === 0 && result.stdout) {
    const token = result.stdout.trim();
    if (token) return token;
  }
  return null;
}

function resolveTokenViaGitCredential(): string | null {
  const result = spawnSync('git', ['credential', 'fill'], {
    encoding: 'utf8',
    input: 'protocol=https\nhost=github.com\n\n',
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  if (result.status !== 0 || !result.stdout) return null;
  for (const line of result.stdout.split('\n')) {
    if (line.startsWith('password=')) {
      const token = line.slice('password='.length).trim();
      if (token) return token;
    }
  }
  return null;
}

function resolveToken(): string | null {
  return resolveTokenViaGh() ?? resolveTokenViaGitCredential();
}

function exitWithTokenError(): never {
  process.stderr.write(
    'Could not resolve a GitHub token. Run `gh auth login`, or configure a git credential helper for github.com.\n',
  );
  process.exit(2);
}

/** Compact "3d ago" / "5m ago" relative time; falls back to the raw value. */
function timeAgo(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  const units: [number, string][] = [
    [60, 's'],
    [60, 'm'],
    [24, 'h'],
    [7, 'd'],
    [4.345, 'w'],
    [12, 'mo'],
    [Number.POSITIVE_INFINITY, 'y'],
  ];
  let value = seconds;
  let unit = 's';
  for (const [size, label] of units) {
    if (value < size) {
      unit = label;
      break;
    }
    value = Math.floor(value / size);
    unit = label;
  }
  return `${value}${unit} ago`;
}

/** One-line note status, e.g. "2 notes (1 new)" or "no notes". */
function formatNotes(notif: InboxNotification | undefined, fallbackCount: number): string {
  const total = notif?.noteCount ?? fallbackCount;
  const fresh = notif?.newNoteCount ?? 0;
  if (total === 0) return chalk.dim('no notes');
  const base = `${total} ${total === 1 ? 'note' : 'notes'}`;
  if (fresh > 0) return `${base} ${chalk.cyan(`(${fresh} new)`)}`;
  return chalk.dim(base);
}

function renderHuman(data: InboxResponse, unreadOnly: boolean): void {
  const { entries, unreadCount } = data;
  const heading = unreadOnly
    ? `Inbox — ${entries.length} needing attention`
    : `Inbox — ${entries.length} ${entries.length === 1 ? 'trail' : 'trails'}, ${unreadCount} unread`;
  console.log(chalk.bold(`\n${heading}\n`));

  if (entries.length === 0) {
    console.log(chalk.dim('  Nothing here.\n'));
    return;
  }

  for (const entry of entries) {
    const notif = entry.notification;
    const dot = notif?.dot ?? entry.readAt === null;
    const title = entry.snapshot?.title || `${entry.owner}/${entry.repo}`;
    const marker = dot ? chalk.hex('#f59e0b')('●') : chalk.dim('·');
    const titleText = dot ? chalk.bold(title) : title;
    console.log(`  ${marker} ${titleText}`);

    const opened = entry.readAt === null ? chalk.yellow('unopened') : chalk.dim('opened');
    const meta = [
      chalk.dim(`trail ${entry.trailId}`),
      `from @${entry.sender.githubLogin}`,
      formatNotes(notif, entry.snapshot?.noteCount ?? 0),
      chalk.dim(`sent ${timeAgo(entry.sentAt)}`),
      opened,
    ].join(chalk.dim('  ·  '));
    console.log(`    ${meta}`);
    console.log(chalk.dim(`    ${entry.owner}/${entry.repo}`));
    if (entry.comment) console.log(chalk.dim(`    “${entry.comment}”`));
    console.log('');
  }
}

interface InboxOptions {
  json?: boolean;
  unread?: boolean;
  limit?: string;
}

async function fetchInbox(options: InboxOptions): Promise<void> {
  const token = resolveToken();
  if (!token) exitWithTokenError();

  const params = new URLSearchParams();
  if (options.unread) params.set('unreadOnly', 'true');
  if (options.limit) params.set('limit', options.limit);
  const query = params.toString();
  const url = `${BASE_URL}/api/trails/inbox${query ? `?${query}` : ''}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
  } catch (error) {
    process.stderr.write(`Failed to reach ${BASE_URL}: ${(error as Error).message}\n`);
    process.exit(1);
  }

  if (response.status === 401) {
    process.stderr.write(
      'Unauthorized (401). Your GitHub token may be expired — run `gh auth login` and retry.\n',
    );
    process.exit(1);
  }
  if (!response.ok) {
    process.stderr.write(`Request failed: HTTP ${response.status} ${response.statusText}\n`);
    process.exit(1);
  }

  const body = await response.text();
  let data: InboxResponse;
  try {
    data = JSON.parse(body) as InboxResponse;
  } catch {
    process.stderr.write('Unexpected non-JSON response from the inbox endpoint.\n');
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  renderHuman(data, Boolean(options.unread));
}

export function createInboxCommand(): Command {
  const command = new Command('inbox');
  command
    .description('Show your trail inbox: which shared trails need attention and how many notes are new')
    .option('--json', 'Output the raw inbox response as JSON (for agents)')
    .option('--unread', 'Only show rows needing attention (unopened or with new notes)')
    .option('--limit <n>', 'Maximum number of rows to fetch')
    .action(async (options: InboxOptions) => {
      await fetchInbox(options);
    });
  return command;
}

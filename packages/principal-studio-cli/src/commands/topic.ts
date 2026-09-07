/**
 * Topic command — create / list / view / add-trail on web-ade topics.
 *
 * A **topic** is a curated collection of trails on a shared subject. The
 * topic record itself is `{ title, description, trailIds, owner }` — trails
 * are referenced by id and continue to enforce their own repo-access checks
 * on read. See docs/topics.md in web-ade for the full design.
 *
 * Resolves a GitHub token locally (gh CLI → git credential helper) and calls
 * the web-ade topic API with `Authorization: Bearer <token>`. The token is
 * never echoed to argv, env, stdout, or stderr.
 */

import { Command } from 'commander';
import { spawnSync } from 'node:child_process';
import { handoffTopicToBridge } from '../lib/bridge-ipc.js';
import { fetchGitHubMe, fetchGitHubUserByLogin } from '../lib/github-user.js';
import { openInBrowser } from '../lib/open-url.js';

const BASE_URL = 'https://app.principal-ade.com';

// Matches the v1 uuid shape web-ade mints for both trails and topics.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================================
// Auth — same posture as `trail.ts`: gh CLI first, then git credential helper.
// Kept local so this command file is self-contained.
// ============================================================================

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

// ============================================================================
// HTTP helpers
// ============================================================================

async function describeHttpError(response: Response): Promise<string> {
  let serverMessage = '';
  let code = '';
  try {
    const body = (await response.clone().json()) as {
      error?: string;
      code?: string;
    };
    serverMessage = body.error ?? '';
    code = body.code ?? '';
  } catch {
    // body wasn't JSON — fall through to status-only message
  }
  const fallback =
    response.status === 404
      ? 'Topic not found'
      : response.status === 403
        ? 'Not the topic owner (or no permission)'
        : response.status === 401
          ? 'GitHub token rejected'
          : `HTTP ${response.status}`;
  const human = serverMessage || fallback;
  return `${human}${code ? ` [${code}]` : ''}`;
}

/**
 * Comment-route error mapper — the comment endpoints surface a different
 * vocabulary than the topic endpoints (COMMENT_FORBIDDEN vs NOT_OWNER,
 * COMMENT_TOO_LONG with a dedicated 413, etc.). Map by `code` first so we
 * stay accurate when the same status carries different meanings (e.g. 404
 * for an unknown topic vs an unknown comment).
 */
async function describeCommentHttpError(response: Response): Promise<string> {
  let serverMessage = '';
  let code = '';
  try {
    const body = (await response.clone().json()) as {
      error?: string;
      code?: string;
    };
    serverMessage = body.error ?? '';
    code = body.code ?? '';
  } catch {
    // body wasn't JSON — fall through to status-only message
  }
  const byCode: Record<string, string> = {
    NOT_AUTHENTICATED: 'GitHub token required — run `gh auth login`',
    NOT_FOUND: 'Topic not found',
    COMMENT_NOT_FOUND: 'Comment not found',
    COMMENT_FORBIDDEN: 'Not allowed to modify this comment',
    COMMENT_TOO_LONG: 'Comment exceeds the 8000-character limit',
    COMMENT_LIMIT_REACHED: 'This topic has reached its comment limit',
  };
  const fallback =
    byCode[code] ??
    (response.status === 404
      ? 'Topic or comment not found'
      : response.status === 403
        ? 'Not allowed to modify this comment'
        : response.status === 401
          ? 'GitHub token rejected'
          : response.status === 413
            ? 'Comment exceeds the 8000-character limit'
            : `HTTP ${response.status}`);
  const human = serverMessage || fallback;
  return `${human}${code ? ` [${code}]` : ''}`;
}

/**
 * Suggestion-route error mapper — the suggest endpoint has its own vocabulary
 * (SUGGESTION_DUPLICATE, SUGGESTION_LIMIT_REACHED) plus a 404 that can mean
 * either an unknown topic or an unknown trail. Map by `code` first so the
 * user sees the precise reason rather than a generic "Topic not found".
 */
async function describeSuggestionHttpError(response: Response): Promise<string> {
  let serverMessage = '';
  let code = '';
  try {
    const body = (await response.clone().json()) as {
      error?: string;
      code?: string;
    };
    serverMessage = body.error ?? '';
    code = body.code ?? '';
  } catch {
    // body wasn't JSON — fall through to status-only message
  }
  const byCode: Record<string, string> = {
    NOT_AUTHENTICATED: 'GitHub token required — run `gh auth login`',
    NOT_FOUND: 'Topic not found',
    TRAIL_NOT_FOUND: 'Trail not found',
    TRAIL_ALREADY_ADDED: 'That trail is already in this topic',
    SUGGESTION_DUPLICATE:
      'You already have a pending suggestion of that trail for this topic',
    SUGGESTION_LIMIT_REACHED:
      'This topic has reached its pending-suggestion limit',
  };
  const fallback =
    byCode[code] ??
    (response.status === 404
      ? 'Topic or trail not found'
      : response.status === 401
        ? 'GitHub token rejected'
        : `HTTP ${response.status}`);
  const human = serverMessage || fallback;
  return `${human}${code ? ` [${code}]` : ''}`;
}

// ============================================================================
// Id / URL parsers
// ============================================================================

/** Extract a topic id from a bare uuid or a `…/topic/<id>` URL. */
function parseTopicId(input: string): string {
  const trimmed = input.trim();
  if (UUID_PATTERN.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/topic\/([^/]+)\/?$/);
    if (match && UUID_PATTERN.test(match[1]!)) return match[1]!;
  } catch {
    // not a URL — fall through; the server will reject if not a uuid
  }
  // Last-ditch: a "/topic/<uuid>" fragment anywhere in the string.
  const m = trimmed.match(/topic\/([0-9a-f-]+)/i);
  if (m && UUID_PATTERN.test(m[1]!)) return m[1]!;
  return trimmed;
}

/** Extract a trail id from a bare uuid or a `…/trail/<id>` URL. */
function parseTrailId(input: string): string {
  const trimmed = input.trim();
  if (UUID_PATTERN.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/trail\/([^/]+)\/?$/);
    if (match && UUID_PATTERN.test(match[1]!)) return match[1]!;
  } catch {
    // not a URL
  }
  const m = trimmed.match(/trail\/([0-9a-f-]+)/i);
  if (m && UUID_PATTERN.test(m[1]!)) return m[1]!;
  return trimmed;
}

// ============================================================================
// Subcommands
// ============================================================================

interface CreateOptions {
  title?: string;
  description?: string;
  trail?: string[]; // repeatable
}

async function createTopic(options: CreateOptions): Promise<void> {
  if (!options.title || !options.title.trim()) {
    process.stderr.write('--title is required\n');
    process.exit(2);
  }

  const trailIds = (options.trail ?? []).map(parseTrailId);
  for (const tid of trailIds) {
    if (!UUID_PATTERN.test(tid)) {
      process.stderr.write(`--trail value is not a valid trail id or URL: ${tid}\n`);
      process.exit(2);
    }
  }

  const token = resolveToken();
  if (!token) exitWithTokenError();

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/api/topics`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        title: options.title.trim(),
        description: options.description ?? '',
        trailIds,
      }),
    });
  } catch (err) {
    process.stderr.write(`Network error creating topic: ${(err as Error).message}\n`);
    process.exit(1);
  }

  if (!response.ok) {
    process.stderr.write(`${await describeHttpError(response)}\n`);
    process.exit(1);
  }

  const body = (await response.json()) as { id?: string; url?: string };
  if (!body.url) {
    process.stderr.write('Server response missing topic URL\n');
    process.exit(1);
  }
  const fullUrl = body.url.startsWith('http') ? body.url : `${BASE_URL}${body.url}`;
  process.stdout.write(`${fullUrl}\n`);
}

async function addTrailToTopic(topicArg: string, trailArg: string): Promise<void> {
  const topicId = parseTopicId(topicArg);
  const trailId = parseTrailId(trailArg);
  if (!UUID_PATTERN.test(topicId)) {
    process.stderr.write(`Not a valid topic id or URL: ${topicArg}\n`);
    process.exit(2);
  }
  if (!UUID_PATTERN.test(trailId)) {
    process.stderr.write(`Not a valid trail id or URL: ${trailArg}\n`);
    process.exit(2);
  }

  const token = resolveToken();
  if (!token) exitWithTokenError();

  let response: Response;
  try {
    response = await fetch(
      `${BASE_URL}/api/topics/by-id/${encodeURIComponent(topicId)}/trails`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ trailId }),
      },
    );
  } catch (err) {
    process.stderr.write(`Network error adding trail: ${(err as Error).message}\n`);
    process.exit(1);
  }

  if (!response.ok) {
    process.stderr.write(`${await describeHttpError(response)}\n`);
    process.exit(1);
  }

  process.stdout.write(`${BASE_URL}/topic/${topicId}\n`);
}

interface SuggestOptions {
  reason?: string;
}

/**
 * Suggest a trail for a topic. Any GitHub-authenticated user can suggest any
 * resolvable trail (their own or someone else's) — the topic owner reviews
 * and accepts or rejects via the web UI. Prints the suggestion uuid so the
 * suggester can refer to it later (e.g. to withdraw).
 */
async function suggestTrail(
  topicArg: string,
  trailArg: string,
  options: SuggestOptions,
): Promise<void> {
  const topicId = parseTopicId(topicArg);
  const trailId = parseTrailId(trailArg);
  if (!UUID_PATTERN.test(topicId)) {
    process.stderr.write(`Not a valid topic id or URL: ${topicArg}\n`);
    process.exit(2);
  }
  if (!UUID_PATTERN.test(trailId)) {
    process.stderr.write(`Not a valid trail id or URL: ${trailArg}\n`);
    process.exit(2);
  }

  const reason = options.reason?.trim();
  if (reason !== undefined && reason.length > 500) {
    process.stderr.write('--reason exceeds the 500-character limit\n');
    process.exit(2);
  }

  const token = resolveToken();
  if (!token) exitWithTokenError();

  const payload: { trailId: string; reason?: string } = { trailId };
  if (reason) payload.reason = reason;

  let response: Response;
  try {
    response = await fetch(
      `${BASE_URL}/api/topics/by-id/${encodeURIComponent(topicId)}/suggestions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );
  } catch (err) {
    process.stderr.write(
      `Network error suggesting trail: ${(err as Error).message}\n`,
    );
    process.exit(1);
  }

  if (!response.ok) {
    process.stderr.write(`${await describeSuggestionHttpError(response)}\n`);
    process.exit(1);
  }

  const body = (await response.json()) as {
    suggestion?: { id?: string };
  };
  const suggestionId = body.suggestion?.id;
  if (suggestionId) {
    process.stdout.write(`${suggestionId}\n`);
  }
  process.stdout.write(`${BASE_URL}/topic/${topicId}\n`);
}

interface UpdateOptions {
  title?: string;
  description?: string;
}

async function updateTopic(topicArg: string, options: UpdateOptions): Promise<void> {
  const topicId = parseTopicId(topicArg);
  if (!UUID_PATTERN.test(topicId)) {
    process.stderr.write(`Not a valid topic id or URL: ${topicArg}\n`);
    process.exit(2);
  }

  const hasTitle = typeof options.title === 'string';
  const hasDescription = typeof options.description === 'string';
  if (!hasTitle && !hasDescription) {
    process.stderr.write('Pass at least one of --title or --description\n');
    process.exit(2);
  }

  const patch: { title?: string; description?: string } = {};
  if (hasTitle) {
    const trimmed = options.title!.trim();
    if (!trimmed) {
      process.stderr.write('--title must not be empty (omit the flag to leave it unchanged)\n');
      process.exit(2);
    }
    patch.title = trimmed;
  }
  if (hasDescription) {
    patch.description = options.description!;
  }

  const token = resolveToken();
  if (!token) exitWithTokenError();

  let response: Response;
  try {
    response = await fetch(
      `${BASE_URL}/api/topics/by-id/${encodeURIComponent(topicId)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(patch),
      },
    );
  } catch (err) {
    process.stderr.write(`Network error updating topic: ${(err as Error).message}\n`);
    process.exit(1);
  }

  if (!response.ok) {
    process.stderr.write(`${await describeHttpError(response)}\n`);
    process.exit(1);
  }

  process.stdout.write(`${BASE_URL}/topic/${topicId}\n`);
}

async function viewTopic(input: string): Promise<void> {
  const id = parseTopicId(input);
  if (!UUID_PATTERN.test(id)) {
    process.stderr.write(`Not a valid topic id or URL: ${input}\n`);
    process.exit(2);
  }

  // GET /api/topics/by-id/{id} is public — token isn't required, but we
  // attach one if available so the request is consistent with the other
  // commands and so rate limits favor authenticated callers.
  const token = resolveToken();

  let response: Response;
  try {
    response = await fetch(
      `${BASE_URL}/api/topics/by-id/${encodeURIComponent(id)}`,
      {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          Accept: 'application/json',
        },
      },
    );
  } catch (err) {
    process.stderr.write(`Network error fetching topic: ${(err as Error).message}\n`);
    process.exit(1);
  }

  if (!response.ok) {
    process.stderr.write(`${await describeHttpError(response)}\n`);
    process.exit(1);
  }

  const body = await response.text();
  process.stdout.write(body);
  if (!body.endsWith('\n')) process.stdout.write('\n');
}

interface ListOptions {
  user?: string;
  id?: string;
}

async function listTopics(options: ListOptions): Promise<void> {
  let githubId: number;

  if (options.id) {
    const parsed = Number(options.id);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      process.stderr.write(`--id must be a positive number, got: ${options.id}\n`);
      process.exit(2);
    }
    githubId = parsed;
  } else {
    // `--user` resolves a login → numeric id via GitHub; the bare form resolves
    // the authenticated user via /user. Both paths need a token.
    const token = resolveToken();
    if (!token) exitWithTokenError();
    const user = options.user
      ? await fetchGitHubUserByLogin(options.user, token)
      : await fetchGitHubMe(token);
    githubId = user.id;
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/api/topics/by-user/${githubId}`, {
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    process.stderr.write(`Network error listing topics: ${(err as Error).message}\n`);
    process.exit(1);
  }

  if (!response.ok) {
    process.stderr.write(`${await describeHttpError(response)}\n`);
    process.exit(1);
  }

  const body = await response.text();
  process.stdout.write(body);
  if (!body.endsWith('\n')) process.stdout.write('\n');
}

// ============================================================================
// open — launch the topic page in the default browser
// ============================================================================

async function openTopic(input: string): Promise<void> {
  const id = parseTopicId(input);
  const isLocalId = id.startsWith('topic-');

  // Local topic-* ids bypass the UUID check (they're minted by the desktop app).
  if (!isLocalId && !UUID_PATTERN.test(id)) {
    process.stderr.write(`Not a valid topic id or URL: ${input}\n`);
    process.exit(2);
  }

  // Prefer the running desktop app when available (local topic-* ids only).
  if (isLocalId && (await handoffTopicToBridge(id))) {
    process.stderr.write(`Topic opened in running desktop app: ${id}\n`);
    process.exit(0);
  }

  // Fall back to web-ade in the browser.
  const url = `${BASE_URL}/topic/${id}`;
  // Print first so the URL is captured in scrollback / pipes even if the
  // platform opener fails (headless / no DISPLAY / missing xdg-open).
  process.stdout.write(`${url}\n`);
  openInBrowser(url);
}

// ============================================================================
// Comment subcommands
// ============================================================================

interface CommentAddOptions {
  body?: string;
}

async function addComment(
  topicArg: string,
  options: CommentAddOptions,
): Promise<void> {
  const topicId = parseTopicId(topicArg);
  if (!UUID_PATTERN.test(topicId)) {
    process.stderr.write(`Not a valid topic id or URL: ${topicArg}\n`);
    process.exit(2);
  }
  const body = (options.body ?? '').trim();
  if (!body) {
    process.stderr.write('--body is required and must not be empty\n');
    process.exit(2);
  }

  const token = resolveToken();
  if (!token) exitWithTokenError();

  let response: Response;
  try {
    response = await fetch(
      `${BASE_URL}/api/topics/by-id/${encodeURIComponent(topicId)}/comments`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ body }),
      },
    );
  } catch (err) {
    process.stderr.write(
      `Network error posting comment: ${(err as Error).message}\n`,
    );
    process.exit(1);
  }

  if (!response.ok) {
    process.stderr.write(`${await describeCommentHttpError(response)}\n`);
    process.exit(1);
  }

  const data = (await response.json()) as { comment?: { id?: string } };
  if (!data.comment?.id) {
    process.stderr.write('Server response missing comment id\n');
    process.exit(1);
  }
  // Stdout is just the new id so it can be piped into `comment delete`.
  process.stdout.write(`${data.comment.id}\n`);
}

async function listComments(topicArg: string): Promise<void> {
  const topicId = parseTopicId(topicArg);
  if (!UUID_PATTERN.test(topicId)) {
    process.stderr.write(`Not a valid topic id or URL: ${topicArg}\n`);
    process.exit(2);
  }

  // GET /comments is public — attach a token if present so rate limits favor
  // authenticated callers, but don't error out if there isn't one.
  const token = resolveToken();

  let response: Response;
  try {
    response = await fetch(
      `${BASE_URL}/api/topics/by-id/${encodeURIComponent(topicId)}/comments`,
      {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          Accept: 'application/json',
        },
      },
    );
  } catch (err) {
    process.stderr.write(
      `Network error fetching comments: ${(err as Error).message}\n`,
    );
    process.exit(1);
  }

  if (!response.ok) {
    process.stderr.write(`${await describeCommentHttpError(response)}\n`);
    process.exit(1);
  }

  const body = await response.text();
  process.stdout.write(body);
  if (!body.endsWith('\n')) process.stdout.write('\n');
}

async function deleteComment(
  topicArg: string,
  commentIdArg: string,
): Promise<void> {
  const topicId = parseTopicId(topicArg);
  if (!UUID_PATTERN.test(topicId)) {
    process.stderr.write(`Not a valid topic id or URL: ${topicArg}\n`);
    process.exit(2);
  }
  const commentId = commentIdArg.trim();
  if (!UUID_PATTERN.test(commentId)) {
    process.stderr.write(`Not a valid comment id: ${commentIdArg}\n`);
    process.exit(2);
  }

  const token = resolveToken();
  if (!token) exitWithTokenError();

  let response: Response;
  try {
    response = await fetch(
      `${BASE_URL}/api/topics/by-id/${encodeURIComponent(
        topicId,
      )}/comments/${encodeURIComponent(commentId)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      },
    );
  } catch (err) {
    process.stderr.write(
      `Network error deleting comment: ${(err as Error).message}\n`,
    );
    process.exit(1);
  }

  if (!response.ok && response.status !== 204) {
    process.stderr.write(`${await describeCommentHttpError(response)}\n`);
    process.exit(1);
  }

  // 204 No Content is the happy path — keep stdout clean (scriptable) and
  // mirror the topic URL on success so users see *what* they just mutated.
  process.stdout.write(`${BASE_URL}/topic/${topicId}\n`);
}

// ============================================================================
// Command wiring
// ============================================================================

export function createTopicCommand(): Command {
  const command = new Command('topic');

  command.description('Create or browse topics — curated collections of trails on web-ade');

  command
    .command('create')
    .description('Create a new topic')
    .requiredOption('--title <title>', 'Topic title (≤200 chars)')
    .option('--description <text>', 'Topic description, markdown (≤8000 chars)')
    .option(
      '--trail <id-or-url>',
      'Initial trail id or URL; pass repeatedly to seed multiple trails',
      (value: string, prev: string[] = []) => [...prev, value],
      [] as string[],
    )
    .action(async (options: CreateOptions) => {
      await createTopic(options);
    });

  command
    .command('add-trail')
    .description('Append a trail to a topic')
    .argument('<topic-id-or-url>', 'Topic id or URL')
    .argument('<trail-id-or-url>', 'Trail id or URL to add')
    .action(async (topicArg: string, trailArg: string) => {
      await addTrailToTopic(topicArg, trailArg);
    });

  command
    .command('suggest')
    .description(
      'Suggest a trail for a topic — owner reviews and accepts/rejects. Any authenticated user can suggest any resolvable trail.',
    )
    .argument('<topic-id-or-url>', 'Topic id or URL')
    .argument('<trail-id-or-url>', 'Trail id or URL to suggest')
    .option('--reason <text>', 'Why this trail fits (≤500 chars)')
    .action(
      async (topicArg: string, trailArg: string, options: SuggestOptions) => {
        await suggestTrail(topicArg, trailArg, options);
      },
    );

  command
    .command('update')
    .description("Update a topic's title and/or description (owner only)")
    .argument('<id-or-url>', 'Topic id or URL')
    .option('--title <title>', 'New title (≤200 chars); omit to leave unchanged')
    .option(
      '--description <text>',
      'New description, markdown (≤8000 chars); omit to leave unchanged. Pass an empty string to clear.',
    )
    .action(async (input: string, options: UpdateOptions) => {
      await updateTopic(input, options);
    });

  command
    .command('view')
    .description('Print a topic JSON to stdout')
    .argument('<id-or-url>', 'Topic id or URL')
    .action(async (input: string) => {
      await viewTopic(input);
    });

  command
    .command('open')
    .description('Open the topic page in the default browser')
    .argument('<id-or-url>', 'Topic id or URL')
    .action(async (input: string) => {
      await openTopic(input);
    });

  command
    .command('list')
    .description('List topics owned by a user (defaults to the authenticated user)')
    .option('--user <login>', 'GitHub login to list topics for (resolves to numeric id)')
    .option('--id <githubId>', 'GitHub numeric user id (skips the lookup)')
    .action(async (options: ListOptions) => {
      await listTopics(options);
    });

  // ---- comment subcommands -------------------------------------------------
  // Flat thread attached to a topic. `add` and `delete` need a token; `list`
  // is public and attaches one only when available.
  const commentCommand = new Command('comment').description(
    'Post or browse comments on a topic',
  );

  commentCommand
    .command('add')
    .description('Post a new comment on a topic')
    .argument('<topic-id-or-url>', 'Topic id or URL')
    .requiredOption('--body <text>', 'Comment body, markdown (≤8000 chars)')
    .action(async (topicArg: string, options: CommentAddOptions) => {
      await addComment(topicArg, options);
    });

  commentCommand
    .command('list')
    .description('List the comments on a topic (public; token attached if present)')
    .argument('<topic-id-or-url>', 'Topic id or URL')
    .action(async (topicArg: string) => {
      await listComments(topicArg);
    });

  commentCommand
    .command('delete')
    .description(
      'Delete a comment (author or topic owner). Comment id is the uuid printed by `comment add`.',
    )
    .argument('<topic-id-or-url>', 'Topic id or URL')
    .argument('<comment-id>', 'Comment uuid')
    .action(async (topicArg: string, commentIdArg: string) => {
      await deleteComment(topicArg, commentIdArg);
    });

  command.addCommand(commentCommand);

  return command;
}

/**
 * Dump raw V1 events (and their repo-normalized forms) from the local opencode
 * sqlite database.
 *
 * Usage:
 *   bun run scripts/dump-opencode-session.ts list
 *   bun run scripts/dump-opencode-session.ts dump <sessionId> [outputPath]
 *
 * `list` prints recent sessions (id, title, created-at).
 * `dump` writes the session's raw `event` rows as JSON, plus the repo-normalized
 * versions. The raw shape matches the rows the principal-studio reads from sqlite
 * (id, aggregateId, seq, type, data), with `data` JSON-parsed from its TEXT
 * column. The `normalized` array is aligned 1:1 by index with `events` — each
 * raw event pushed through V1EventBridgeProcessor → PathNormalizationService
 * (the same pipeline the principal-studio runs in its bun host).
 *
 * Default db path mirrors principal-studio's openCodeDBPath():
 *   $OPENCODE_DATA_DIR/opencode/opencode.db  (if OPENCODE_DATA_DIR is set)
 *   $XDG_DATA_HOME/opencode/opencode.db      (default ~/.local/share/opencode)
 */
import { Database } from "bun:sqlite";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import os from "node:os";
import {
  PathNormalizationService,
  V1EventBridgeProcessor,
  createAccumulatedState,
  eventOp,
  type AgentSessionEvent,
  type PathNormalizationAdapter,
  type RepositoryInfo,
  type RepoNormalizedUniversalAgentSessionEvent,
  type SystemInfo,
  type UniversalAgentSessionEvent,
} from "@principal-ai/agent-monitoring";

function dbPath(): string {
  const env = process.env as Record<string, string | undefined>;
  if (env["OPENCODE_DATA_DIR"]) return `${env["OPENCODE_DATA_DIR"]}/opencode/opencode.db`;
  const home = env["HOME"] || env["USERPROFILE"] || "/root";
  const xdgData = env["XDG_DATA_HOME"] || `${home}/.local/share`;
  return `${xdgData}/opencode/opencode.db`;
}

function gitCommand(gitRoot: string, subcommand: string): string | undefined {
  const result = spawnSync("git", ["-C", gitRoot, ...subcommand.split(" ")], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 5000,
  });
  if (result.status !== 0) return undefined;
  return result.stdout?.trim() || undefined;
}

function githubIdentityFromRemoteUrl(remoteUrl: string): {
  owner: string;
  name: string;
} | null {
  const cleaned = remoteUrl
    .replace(/^git@github\.com:/, "")
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "");
  const parts = cleaned.split("/").filter(Boolean);
  if (parts.length >= 2) return { owner: parts[0], name: parts[1] };
  return null;
}

/**
 * Tool outputs (and some inputs/text) reach megabytes per event in real
 * sessions. The story only shows a bounded preview, so truncate long strings in
 * the fixture to keep it a sane size while preserving the full shape.
 */
function truncateDeep(value: unknown, maxLen = 3000): unknown {
  if (typeof value === "string") {
    if (value.length <= maxLen) return value;
    return `${value.slice(0, maxLen)}\n…[+${value.length - maxLen} chars]`;
  }
  if (Array.isArray(value)) return value.map((v) => truncateDeep(v, maxLen));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = truncateDeep(v, maxLen);
    return out;
  }
  return value;
}

/**
 * Node/fs adapter for the dump script. Mirrors the principal-studio's
 * BunNormalizationAdapter (walk up for .git, enrich with git metadata) so the
 * fixture carries real repo-normalized paths.
 */
class FixtureNodeAdapter implements PathNormalizationAdapter {
  private homeDir: string;
  private gitRootCache = new Map<string, string | null>();
  private knownRoots: Map<string, RepositoryInfo>;

  constructor(knownRoots?: Map<string, RepositoryInfo>) {
    this.homeDir = os.homedir();
    this.knownRoots = knownRoots ?? new Map();
  }

  async getRawRepositoryInfo(absolutePath: string): Promise<RepositoryInfo | null> {
    const target = resolve(absolutePath);

    for (const [root, info] of this.knownRoots) {
      const rootCanon = resolve(root);
      if (target === rootCanon || target.startsWith(`${rootCanon}/`)) {
        return info;
      }
    }

    const gitRoot = await this.findGitRoot(target);
    if (!gitRoot) return null;

    const remoteUrl = gitCommand(gitRoot, "remote get-url origin");
    const branch = gitCommand(gitRoot, "rev-parse --abbrev-ref HEAD");
    const headCommit = gitCommand(gitRoot, "rev-parse HEAD");

    let owner: string | undefined;
    let repo: string | undefined;
    if (remoteUrl) {
      const identity = githubIdentityFromRemoteUrl(remoteUrl);
      if (identity) {
        owner = identity.owner;
        repo = identity.name;
      }
    }
    if (!repo) {
      const parts = gitRoot.replace(/\/+$/, "").split("/");
      repo = parts[parts.length - 1] ?? undefined;
    }

    const info: RepositoryInfo = {
      root: gitRoot,
      remoteUrl,
      owner,
      repo,
      branch,
      headCommit,
    };
    this.knownRoots.set(gitRoot, info);
    return info;
  }

  private async findGitRoot(dir: string): Promise<string | null> {
    const cached = this.gitRootCache.get(dir);
    if (cached !== undefined) return cached;
    try {
      const s = await fs.stat(join(dir, ".git"));
      if (s.isDirectory() || s.isFile()) {
        this.gitRootCache.set(dir, dir);
        return dir;
      }
    } catch {
      // not a git root; walk up
    }
    const parent = dirname(dir);
    if (parent === dir || parent.length >= dir.length) {
      this.gitRootCache.set(dir, null);
      return null;
    }
    const result = await this.findGitRoot(parent);
    this.gitRootCache.set(dir, result);
    return result;
  }

  getSystemInfo(): SystemInfo {
    return {
      homeDir: this.homeDir,
      pathSeparator: "/",
      platform: process.platform,
      machineId: "",
    };
  }

  resolvePath(relativePath: string, workingDirectory: string): string {
    return resolve(workingDirectory, relativePath);
  }

  isAbsolutePath(path: string): boolean {
    return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path);
  }

  getRelativePath(fromPath: string, toPath: string): string {
    return relative(fromPath, toPath);
  }

  isAvailable(): boolean {
    return true;
  }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const path = dbPath();
  const db = new Database(path, { readonly: true });

  try {
    if (cmd === "list") {
      const rows = db
        .query(
          `SELECT id, title, time_created FROM session ORDER BY time_created DESC LIMIT 25`,
        )
        .all() as Array<{ id: string; title: string; time_created: number }>;
      for (const row of rows) {
        const ts = new Date(row.time_created).toISOString();
        console.log(`${row.id}\t${ts}\t${row.title.slice(0, 80)}`);
      }
      return;
    }

    if (cmd === "dump") {
      const sessionId = rest[0];
      if (!sessionId) throw new Error("dump requires a sessionId argument");
      const outputPath = rest[1] ?? `src/stories/data/${sessionId}-raw-events.json`;
      const maxArg = rest.find((a) => a.startsWith("--max="));
      const max = maxArg ? Number(maxArg.slice(6)) : undefined;

      const session = db
        .query(`SELECT id, title, slug, time_created FROM session WHERE id = ?`)
        .get(sessionId) as { id: string; title: string; slug: string; time_created: number } | null;
      if (!session) throw new Error(`no session with id ${sessionId}`);

      const rows = db
        .query(
          `SELECT id, aggregate_id, seq, type, data FROM event WHERE aggregate_id = ? ORDER BY seq ASC`,
        )
        .all(sessionId) as Array<{
        id: string;
        aggregate_id: string;
        seq: number;
        type: string;
        data: string;
      }>;

      const scoped = max !== undefined ? rows.slice(0, max) : rows;

      const events = scoped.map((row) => ({
        id: row.id,
        aggregateId: row.aggregate_id,
        seq: row.seq,
        type: row.type,
        data: truncateDeep(JSON.parse(row.data)) as Record<string, unknown>,
      }));

      // raw → universal → repo-normalized (same pipeline as the principal-studio)
      const processor = new V1EventBridgeProcessor();
      const universal: UniversalAgentSessionEvent[] = events.map((e) =>
        processor.normalize(e as Parameters<typeof processor.normalize>[0]),
      );
      const service = new PathNormalizationService(new FixtureNodeAdapter());
      const normalized: RepoNormalizedUniversalAgentSessionEvent[] =
        await service.normalizePathsBatch(universal, "");

      // repo-normalized → accumulated (the type the File City UI actually
      // renders). eventOp returns null for events the accumulator drops
      // (message-display, notifications, reasoning, step-finish, deduped tool
      // snapshots), so this stays aligned 1:1 with `normalized` but is nullable.
      const accState = createAccumulatedState(session.title);
      const accumulated: Array<AgentSessionEvent | null> = normalized.map((n) =>
        eventOp(accState, n),
      );

      const payload = {
        session: {
          id: session.id,
          title: session.title,
          slug: session.slug,
          timeCreated: session.time_created,
        },
        events,
        // Strip `raw` from each normalized event — it's already present verbatim
        // in `events[i]`, so keeping it doubles the fixture for no new info.
        normalized: truncateDeep(
          normalized.map((n) => {
            const { raw, ...rest } = n;
            return rest;
          }),
        ),
        accumulated,
      };

      await Bun.write(outputPath, JSON.stringify(payload, null, 2));
      console.log(
        `Wrote ${events.length} raw events + ${normalized.length} normalized to ${outputPath}`,
      );
      return;
    }

    console.error(`unknown command "${cmd}" (expected "list" or "dump")`);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

main();

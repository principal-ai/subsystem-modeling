/**
 * File-per-topic store under `~/.principal/topics/`.
 *
 * Layout (mirrors the trail store at `~/.principal/trails/`, so topics become
 * locally greppable and an agent can read one directly):
 *
 *   ~/.principal/topics/
 *     _index.json          private, rebuildable manifest (entries[])
 *     <id>.json            one pretty-printed DraftTopic per file
 *
 * Topics are the *least* repo-bound artifact (a bundle of trails spanning
 * repos), so — unlike trails, which bucket by repo Purl — they are stored flat
 * by id. No purl, no buckets, no `node:os`/Purl dependency beyond `homedir()`.
 *
 * The `_index.json` manifest is store-private and rebuildable: it is rebuilt by
 * scanning the directory whenever it is missing or unparseable. It exists only
 * to make `getTopics()` / `list()` cheap (no per-file read for listing).
 *
 * There is intentionally NO eviction cap. The trail store caps trails per repo
 * (`PER_REPO_CAP`); topics are few, user-curated, and must never be silently
 * dropped, so the cap is deliberately not carried over.
 *
 * Migration from the legacy single-blob `~/.alexandria/topics.json` is explicit
 * (`migrateFromLegacyBlob`) — it is never run automatically on load; the desktop
 * triggers it from a Settings action.
 */

import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  mkdir,
  readFile,
  writeFile,
  unlink,
  readdir,
  rename,
  access,
} from 'node:fs/promises';
import type { DraftTopic, TopicStatus } from './topic-types';

/** Root of the global, cross-repo principal narration store. */
export const PRINCIPAL_DIR = join(homedir(), '.principal');
/** File-per-topic directory. */
export const TOPICS_DIR = join(PRINCIPAL_DIR, 'topics');
/** Legacy single-blob path the migration reads from. */
export const LEGACY_TOPICS_BLOB = join(homedir(), '.alexandria', 'topics.json');

const INDEX_FILENAME = '_index.json';
const DESCRIPTION_PREVIEW_MAX = 200;

/**
 * Cheap-to-list projection of a topic, held in the private manifest so listing
 * never reads every file. Everything here is derivable from the topic file, so
 * the manifest can always be rebuilt by scanning.
 */
export interface TopicIndexEntry {
  id: string;
  title: string;
  descriptionPreview: string;
  trailCount: number;
  /** `status.state` lifted out for filtering/sorting without a file read. */
  state?: TopicStatus['state'];
  createdAt: string;
  updatedAt: string;
  createdBy?: { githubId: number; githubLogin: string };
  hasAssets: boolean;
  sizeBytes: number;
  /** File name relative to `TOPICS_DIR` (e.g. `topic-123.json`). */
  fileName: string;
}

interface IndexFileV1 {
  version: 1;
  entries: TopicIndexEntry[];
}

const emptyIndex = (): IndexFileV1 => ({ version: 1, entries: [] });

const sanitizeSegment = (value: string): string =>
  value.replace(/[^A-Za-z0-9._-]/g, '_');

const nowIso = (): string => new Date().toISOString();

/** Locally-unique topic id, matching the legacy `topic-<ts>-<rand>` shape. */
const generateTopicId = (): string =>
  `topic-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

const descriptionPreview = (description?: string): string => {
  if (!description) return '';
  const trimmed = description.trim();
  if (trimmed.length <= DESCRIPTION_PREVIEW_MAX) return trimmed;
  return `${trimmed.slice(0, DESCRIPTION_PREVIEW_MAX - 1)}…`;
};

const buildEntry = (topic: DraftTopic, sizeBytes: number): TopicIndexEntry => ({
  id: topic.id,
  title: topic.title || 'Untitled topic',
  descriptionPreview: descriptionPreview(topic.description),
  trailCount: topic.trailIds.length,
  state: topic.status?.state,
  createdAt: topic.createdAt,
  updatedAt: topic.updatedAt,
  createdBy: topic.createdBy,
  hasAssets: (topic.assets?.length ?? 0) > 0,
  sizeBytes,
  fileName: `${sanitizeSegment(topic.id)}.json`,
});

/** Shape the legacy `~/.alexandria/topics.json` blob is parsed as. */
interface LegacyTopicsBlob {
  version?: string;
  topics?: DraftTopic[];
}

export interface MigrationResult {
  /** Number of topics written to the file-per-topic store. */
  migrated: number;
  /** Number of legacy topics skipped (missing id, write failure). */
  skipped: number;
  /** Absolute path of the `.bak` the legacy blob was renamed to, if any. */
  backupPath?: string;
  /** True when there was no legacy blob to migrate. */
  noLegacyBlob: boolean;
}

/**
 * Fields a caller may set when updating a topic. `id`, `createdAt`, and
 * `trailIds` are not updatable here — use the trail-membership methods for
 * `trailIds`, and `id`/`createdAt` are immutable.
 */
export type TopicUpdate = Partial<
  Pick<DraftTopic, 'title' | 'description' | 'status' | 'createdBy' | 'assets' | 'repos'>
>;

/**
 * Fields a caller may set when creating a topic. `id`, `createdAt`,
 * `updatedAt` are filled in when omitted; passing `id` lets a caller control
 * it (e.g. round-tripping a server id).
 *
 * `id`/`createdAt`/`updatedAt` are Omit-ted from `DraftTopic` (where they are
 * required) before being re-added as optional. Intersecting `& { id?: string }`
 * onto a still-required `id: string` would NOT widen it — an intersection keeps
 * the stricter member — which would leave `id` wrongly required for callers.
 */
export type TopicCreate = Omit<
  DraftTopic,
  'id' | 'createdAt' | 'updatedAt'
> & {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
};

export class TopicStore {
  private readonly baseDir: string;
  private readonly indexPath: string;
  private readonly legacyBlobPath: string;
  private index: IndexFileV1 | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  /**
   * @param baseDir       file-per-topic directory (defaults to `TOPICS_DIR`)
   * @param legacyBlobPath legacy blob the migration reads (defaults to
   *                       `LEGACY_TOPICS_BLOB`); injectable for tests.
   */
  constructor(baseDir: string = TOPICS_DIR, legacyBlobPath: string = LEGACY_TOPICS_BLOB) {
    this.baseDir = baseDir;
    this.indexPath = join(baseDir, INDEX_FILENAME);
    this.legacyBlobPath = legacyBlobPath;
  }

  // ===== Topic CRUD =====

  async getTopics(): Promise<DraftTopic[]> {
    const idx = await this.getIndex();
    const topics: DraftTopic[] = [];
    for (const entry of idx.entries) {
      const topic = await this.readTopic(entry.fileName);
      if (topic) topics.push(topic);
    }
    return topics;
  }

  async getTopic(id: string): Promise<DraftTopic | null> {
    const idx = await this.getIndex();
    const entry = idx.entries.find((e) => e.id === id);
    if (!entry) return null;
    return this.readTopic(entry.fileName);
  }

  /** Cheap listing straight off the manifest — no per-topic file read. */
  async list(): Promise<TopicIndexEntry[]> {
    const idx = await this.getIndex();
    return idx.entries
      .slice()
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  async createTopic(input: TopicCreate): Promise<DraftTopic> {
    const idx = await this.getIndex();
    const now = nowIso();
    const id = input.id?.trim() || generateTopicId();
    if (idx.entries.some((e) => e.id === id)) {
      throw new Error(`Topic with id '${id}' already exists`);
    }
    const topic: DraftTopic = {
      ...input,
      id,
      title: input.title || 'Untitled topic',
      trailIds: input.trailIds ?? [],
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now,
    };
    await this.writeTopic(topic, idx);
    return topic;
  }

  async updateTopic(id: string, updates: TopicUpdate): Promise<DraftTopic> {
    const idx = await this.getIndex();
    const existing = await this.requireTopic(idx, id);
    const next: DraftTopic = {
      ...existing,
      ...updates,
      id: existing.id,
      trailIds: existing.trailIds,
      createdAt: existing.createdAt,
      updatedAt: nowIso(),
    };
    await this.writeTopic(next, idx);
    return next;
  }

  async deleteTopic(id: string): Promise<boolean> {
    const idx = await this.getIndex();
    const entryIdx = idx.entries.findIndex((e) => e.id === id);
    if (entryIdx < 0) return false;
    const { fileName } = idx.entries[entryIdx];
    idx.entries.splice(entryIdx, 1);
    await this.unlinkRelative(fileName);
    await this.persistIndex();
    return true;
  }

  // ===== Trail membership =====

  async addTrailToTopic(topicId: string, trailId: string): Promise<DraftTopic> {
    const idx = await this.getIndex();
    const topic = await this.requireTopic(idx, topicId);
    if (topic.trailIds.includes(trailId)) return topic;
    const next: DraftTopic = {
      ...topic,
      trailIds: [...topic.trailIds, trailId],
      updatedAt: nowIso(),
    };
    await this.writeTopic(next, idx);
    return next;
  }

  async removeTrailFromTopic(topicId: string, trailId: string): Promise<DraftTopic> {
    const idx = await this.getIndex();
    const topic = await this.requireTopic(idx, topicId);
    if (!topic.trailIds.includes(trailId)) return topic;
    const next: DraftTopic = {
      ...topic,
      trailIds: topic.trailIds.filter((t) => t !== trailId),
      updatedAt: nowIso(),
    };
    await this.writeTopic(next, idx);
    return next;
  }

  async reorderTopicTrails(topicId: string, trailIds: string[]): Promise<DraftTopic> {
    const idx = await this.getIndex();
    const topic = await this.requireTopic(idx, topicId);
    const current = new Set(topic.trailIds);
    const next = new Set(trailIds);
    if (current.size !== next.size || [...current].some((t) => !next.has(t))) {
      throw new Error(
        'reorderTopicTrails expects a permutation of the existing trail list',
      );
    }
    const updated: DraftTopic = {
      ...topic,
      trailIds: [...trailIds],
      updatedAt: nowIso(),
    };
    await this.writeTopic(updated, idx);
    return updated;
  }

  async getTopicsForTrail(trailId: string): Promise<DraftTopic[]> {
    const topics = await this.getTopics();
    return topics.filter((t) => t.trailIds.includes(trailId));
  }

  // ===== Migration =====

  /**
   * One-shot migration from the legacy single-blob `~/.alexandria/topics.json`
   * to file-per-topic. Reads the blob's `topics[]`, writes each as
   * `<id>.json`, rebuilds the index, then renames the blob to `<blob>.bak` so
   * a re-run is a no-op (mirrors the trail store's `migrateLegacyIfPresent`).
   *
   * Explicit by design — the desktop calls this from a Settings action, never
   * on load. Idempotent: once the blob is `.bak`'d, subsequent calls report
   * `noLegacyBlob`. An existing topic id is overwritten (the blob wins on a
   * first migration), so re-importing after edits is the caller's decision.
   */
  async migrateFromLegacyBlob(): Promise<MigrationResult> {
    let raw: string;
    try {
      raw = await readFile(this.legacyBlobPath, 'utf8');
    } catch {
      return { migrated: 0, skipped: 0, noLegacyBlob: true };
    }

    let blob: LegacyTopicsBlob;
    try {
      blob = JSON.parse(raw) as LegacyTopicsBlob;
    } catch {
      throw new Error(
        `Legacy topics blob at ${this.legacyBlobPath} is not valid JSON; not migrating.`,
      );
    }

    const idx = await this.getIndex();
    let migrated = 0;
    let skipped = 0;
    for (const legacy of blob.topics ?? []) {
      if (!legacy?.id) {
        skipped++;
        continue;
      }
      const now = nowIso();
      const topic: DraftTopic = {
        ...legacy,
        title: legacy.title || 'Untitled topic',
        trailIds: legacy.trailIds ?? [],
        createdAt: legacy.createdAt ?? now,
        updatedAt: legacy.updatedAt ?? now,
      };
      try {
        await this.writeTopic(topic, idx);
        migrated++;
      } catch {
        skipped++;
      }
    }

    const backupPath = `${this.legacyBlobPath}.bak`;
    let backedUp: string | undefined;
    if (!(await this.pathExists(backupPath))) {
      try {
        await rename(this.legacyBlobPath, backupPath);
        backedUp = backupPath;
      } catch {
        // Non-fatal: topics are migrated; the blob just wasn't renamed.
      }
    }

    return {
      migrated,
      skipped,
      noLegacyBlob: false,
      ...(backedUp ? { backupPath: backedUp } : {}),
    };
  }

  // ===== Internals =====

  private async getIndex(): Promise<IndexFileV1> {
    if (!this.index) {
      await mkdir(this.baseDir, { recursive: true });
      this.index = await this.loadIndex();
    }
    return this.index;
  }

  private async requireTopic(idx: IndexFileV1, id: string): Promise<DraftTopic> {
    const entry = idx.entries.find((e) => e.id === id);
    if (!entry) throw new Error(`Topic with id '${id}' not found`);
    const topic = await this.readTopic(entry.fileName);
    if (!topic) throw new Error(`Topic with id '${id}' not found`);
    return topic;
  }

  /** Write a topic file and upsert its index entry. Does not generate ids. */
  private async writeTopic(topic: DraftTopic, idx: IndexFileV1): Promise<void> {
    const fileName = `${sanitizeSegment(topic.id)}.json`;
    const file = join(this.baseDir, fileName);
    await mkdir(dirname(file), { recursive: true });
    const serialized = JSON.stringify(topic, null, 2);
    await writeFile(file, serialized, 'utf8');
    const entry = buildEntry(topic, Buffer.byteLength(serialized, 'utf8'));
    const at = idx.entries.findIndex((e) => e.id === topic.id);
    if (at >= 0) idx.entries[at] = entry;
    else idx.entries.push(entry);
    await this.persistIndex();
  }

  private async readTopic(fileName: string): Promise<DraftTopic | null> {
    try {
      const raw = await readFile(join(this.baseDir, fileName), 'utf8');
      return JSON.parse(raw) as DraftTopic;
    } catch (err) {
      console.error('[TopicStore] Failed to read topic', fileName, err);
      return null;
    }
  }

  private async unlinkRelative(fileName: string): Promise<void> {
    try {
      await unlink(join(this.baseDir, fileName));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        console.error('[TopicStore] Failed to unlink', fileName, err);
      }
    }
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  private async loadIndex(): Promise<IndexFileV1> {
    try {
      const raw = await readFile(this.indexPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<IndexFileV1>;
      if (parsed?.version === 1 && Array.isArray(parsed.entries)) {
        return { version: 1, entries: parsed.entries as TopicIndexEntry[] };
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        console.warn('[TopicStore] _index.json unreadable, rebuilding', err);
      }
    }
    // No auto-migration here: the legacy blob is imported only via the
    // explicit migrateFromLegacyBlob() Settings action.
    return this.rebuildIndex();
  }

  /** Rebuild the manifest by scanning every `<id>.json` in the directory. */
  private async rebuildIndex(): Promise<IndexFileV1> {
    const idx = emptyIndex();
    let names: string[];
    try {
      names = await readdir(this.baseDir);
    } catch {
      return idx;
    }
    for (const name of names) {
      if (name === INDEX_FILENAME || !name.endsWith('.json')) continue;
      const topic = await this.readTopic(name);
      if (!topic?.id) continue;
      const createdAt = topic.createdAt ?? nowIso();
      const stamped: DraftTopic = {
        ...topic,
        createdAt,
        updatedAt: topic.updatedAt ?? createdAt,
        title: topic.title || 'Untitled topic',
        trailIds: topic.trailIds ?? [],
      };
      const raw = JSON.stringify(stamped, null, 2);
      idx.entries.push(buildEntry(stamped, Buffer.byteLength(raw, 'utf8')));
    }
    this.index = idx;
    await this.persistIndex();
    return idx;
  }

  private persistIndex(): Promise<void> {
    if (!this.index) return Promise.resolve();
    const snapshot = this.index;
    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        await mkdir(this.baseDir, { recursive: true });
        await writeFile(this.indexPath, JSON.stringify(snapshot, null, 2), 'utf8');
      });
    return this.writeQueue;
  }
}

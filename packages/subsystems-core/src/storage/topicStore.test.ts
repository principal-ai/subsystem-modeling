/**
 * TopicStore — file-per-topic CRUD, index rebuild, and legacy-blob migration.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { TopicStore } from './topicStore';
import { publishedFromDraft, type DraftTopic } from './topic-types';

let dir: string;
let topicsDir: string;
let legacyBlob: string;

const makeStore = () => new TopicStore(topicsDir, legacyBlob);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'topicstore-'));
  topicsDir = join(dir, 'topics');
  legacyBlob = join(dir, 'topics.json');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('CRUD', () => {
  test('create generates an id, persists a file, and reads back', async () => {
    const store = makeStore();
    const created = await store.createTopic({ title: 'Auth flow', trailIds: [] });
    expect(created.id).toMatch(/^topic-/);
    expect(existsSync(join(topicsDir, `${created.id}.json`))).toBe(true);

    const got = await store.getTopic(created.id);
    expect(got?.title).toBe('Auth flow');
  });

  test('create honors an explicit id and rejects duplicates', async () => {
    const store = makeStore();
    await store.createTopic({ id: 'topic-x', title: 'A', trailIds: [] });
    await expect(
      store.createTopic({ id: 'topic-x', title: 'B', trailIds: [] }),
    ).rejects.toThrow(/already exists/);
  });

  test('update changes fields but never id/createdAt/trailIds', async () => {
    const store = makeStore();
    const t = await store.createTopic({ id: 'topic-u', title: 'A', trailIds: ['t1'] });
    const updated = await store.updateTopic('topic-u', { title: 'B', description: 'hi' });
    expect(updated.title).toBe('B');
    expect(updated.description).toBe('hi');
    expect(updated.createdAt).toBe(t.createdAt);
    expect(updated.trailIds).toEqual(['t1']);
  });

  test('repos (PURL strings) persist on create and are updatable', async () => {
    const store = makeStore();
    const created = await store.createTopic({
      id: 'topic-repos',
      title: 'Repo-scoped',
      trailIds: [],
      repos: ['pkg:github/acme/web'],
    });
    expect(created.repos).toEqual(['pkg:github/acme/web']);

    const reread = await store.getTopic('topic-repos');
    expect(reread?.repos).toEqual(['pkg:github/acme/web']);

    const updated = await store.updateTopic('topic-repos', {
      repos: ['pkg:github/acme/web', 'pkg:github/acme/api'],
    });
    expect(updated.repos).toEqual(['pkg:github/acme/web', 'pkg:github/acme/api']);
  });

  test('publishedFromDraft carries repos through the projection', () => {
    const draft: DraftTopic = {
      id: 'topic-pub',
      title: 'Pub',
      description: 'has a description',
      trailIds: ['local-1'],
      repos: ['pkg:github/acme/web'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    const published = publishedFromDraft(draft, {
      trailIds: ['remote-1'],
      createdBy: { githubId: 1, githubLogin: 'u1' },
      visibility: 'private',
    });
    expect(published.repos).toEqual(['pkg:github/acme/web']);
  });

  test('trail membership add/remove/reorder', async () => {
    const store = makeStore();
    await store.createTopic({ id: 'topic-m', title: 'M', trailIds: [] });
    await store.addTrailToTopic('topic-m', 'a');
    await store.addTrailToTopic('topic-m', 'b');
    await store.addTrailToTopic('topic-m', 'a'); // dup no-op
    expect((await store.getTopic('topic-m'))?.trailIds).toEqual(['a', 'b']);

    await store.reorderTopicTrails('topic-m', ['b', 'a']);
    expect((await store.getTopic('topic-m'))?.trailIds).toEqual(['b', 'a']);

    await expect(
      store.reorderTopicTrails('topic-m', ['b', 'c']),
    ).rejects.toThrow(/permutation/);

    await store.removeTrailFromTopic('topic-m', 'b');
    expect((await store.getTopic('topic-m'))?.trailIds).toEqual(['a']);
  });

  test('delete removes the file and the index entry', async () => {
    const store = makeStore();
    await store.createTopic({ id: 'topic-d', title: 'D', trailIds: [] });
    expect(await store.deleteTopic('topic-d')).toBe(true);
    expect(existsSync(join(topicsDir, 'topic-d.json'))).toBe(false);
    expect(await store.getTopic('topic-d')).toBeNull();
    expect(await store.deleteTopic('topic-d')).toBe(false);
  });

  test('no eviction cap — many topics all survive', async () => {
    const store = makeStore();
    for (let i = 0; i < 120; i++) {
      await store.createTopic({ id: `topic-${i}`, title: `T${i}`, trailIds: [] });
    }
    expect((await store.getTopics()).length).toBe(120);
  });
});

describe('index rebuild', () => {
  test('a corrupt _index.json is rebuilt by scanning topic files', async () => {
    const store = makeStore();
    await store.createTopic({ id: 'topic-r', title: 'R', trailIds: ['z'] });

    // Corrupt the manifest and force a fresh store to rebuild from disk.
    writeFileSync(join(topicsDir, '_index.json'), 'not json', 'utf8');
    const fresh = makeStore();
    const list = await fresh.list();
    expect(list.map((e) => e.id)).toContain('topic-r');
    expect(list.find((e) => e.id === 'topic-r')?.trailCount).toBe(1);
  });
});

describe('migration', () => {
  const seedLegacy = (topics: Partial<DraftTopic>[]) => {
    writeFileSync(
      legacyBlob,
      JSON.stringify({ version: '1.0.0', topics }, null, 2),
      'utf8',
    );
  };

  test('fans the blob out to file-per-topic and backs up the blob', async () => {
    seedLegacy([
      { id: 'topic-1', title: 'One', trailIds: ['a'], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' },
      { id: 'topic-2', title: 'Two', trailIds: [] },
    ]);
    const store = makeStore();
    const result = await store.migrateFromLegacyBlob();

    expect(result.migrated).toBe(2);
    expect(result.noLegacyBlob).toBe(false);
    expect(result.backupPath).toBe(`${legacyBlob}.bak`);
    expect(existsSync(legacyBlob)).toBe(false);
    expect(existsSync(`${legacyBlob}.bak`)).toBe(true);

    const one = await store.getTopic('topic-1');
    expect(one?.title).toBe('One');
    expect(one?.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(existsSync(join(topicsDir, 'topic-1.json'))).toBe(true);
  });

  test('skips legacy entries with no id', async () => {
    seedLegacy([{ title: 'no id' }, { id: 'topic-ok', title: 'ok', trailIds: [] }]);
    const result = await makeStore().migrateFromLegacyBlob();
    expect(result.migrated).toBe(1);
    expect(result.skipped).toBe(1);
  });

  test('reports noLegacyBlob when there is nothing to migrate', async () => {
    const result = await makeStore().migrateFromLegacyBlob();
    expect(result.noLegacyBlob).toBe(true);
    expect(result.migrated).toBe(0);
  });

  test('migrated files are greppable pretty-printed JSON', async () => {
    seedLegacy([{ id: 'topic-g', title: 'Grep me', trailIds: [] }]);
    await makeStore().migrateFromLegacyBlob();
    const raw = readFileSync(join(topicsDir, 'topic-g.json'), 'utf8');
    expect(raw).toContain('\n  "title": "Grep me"');
  });
});

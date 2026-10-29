/**
 * TopicStore — file-per-topic CRUD, index rebuild, and legacy-blob migration.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { TopicStore } from './topicStore';
import type { TopicReference } from './topic-types';

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
    const created = await store.createTopic({ title: 'Auth flow' });
    expect(created.id).toMatch(/^topic-/);
    expect(existsSync(join(topicsDir, `${created.id}.json`))).toBe(true);

    const got = await store.getTopic(created.id);
    expect(got?.title).toBe('Auth flow');
  });

  test('create honors an explicit id and rejects duplicates', async () => {
    const store = makeStore();
    await store.createTopic({ id: 'topic-x', title: 'A' });
    await expect(store.createTopic({ id: 'topic-x', title: 'B' })).rejects.toThrow(
      /already exists/
    );
  });

  test('update changes fields but never id/createdAt', async () => {
    const store = makeStore();
    const t = await store.createTopic({ id: 'topic-u', title: 'A' });
    const updated = await store.updateTopic('topic-u', {
      title: 'B',
      description: 'hi',
    });
    expect(updated.title).toBe('B');
    expect(updated.description).toBe('hi');
    expect(updated.createdAt).toBe(t.createdAt);
  });

  test('repos (PURL strings) persist on create and are updatable', async () => {
    const store = makeStore();
    const created = await store.createTopic({
      id: 'topic-repos',
      title: 'Repo-scoped',
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

  test('subsystemModels persist on create and are updatable', async () => {
    const store = makeStore();
    const created = await store.createTopic({
      id: 'topic-models',
      title: 'Model-scoped',
      subsystemModels: [{ modelId: 'sg-1-abc', trailIds: ['trail-a'] }],
    });
    expect(created.subsystemModels).toEqual([{ modelId: 'sg-1-abc', trailIds: ['trail-a'] }]);

    const reread = await store.getTopic('topic-models');
    expect(reread?.subsystemModels).toEqual([{ modelId: 'sg-1-abc', trailIds: ['trail-a'] }]);

    const updated = await store.updateTopic('topic-models', {
      subsystemModels: [{ modelId: 'sg-2-def' }],
    });
    expect(updated.subsystemModels).toEqual([{ modelId: 'sg-2-def' }]);
  });

  test('references survive fresh reads and unrelated updates, and can be replaced or cleared', async () => {
    const store = makeStore();
    const references: TopicReference[] = [
      { kind: 'c4-sketch', sketchId: 'c4s-1-abc' },
      { kind: 'topic', topicId: 'topic-related' },
    ];
    const created = await store.createTopic({
      id: 'topic-refs',
      title: 'Architecture',
      description: '[Related](principal://topic/topic-related)',
      subsystemModels: [{ modelId: 'sg-1-abc' }],
      references,
    });
    expect(created.references).toEqual(references);
    expect((await makeStore().getTopic(created.id))?.references).toEqual(references);

    await store.updateTopic(created.id, { title: 'Renamed' });
    expect((await makeStore().getTopic(created.id))?.references).toEqual(references);

    const replacement: TopicReference[] = [{ kind: 'topic', topicId: 'topic-other' }];
    await store.updateTopic(created.id, { references: replacement });
    expect((await makeStore().getTopic(created.id))?.references).toEqual(replacement);

    await store.updateTopic(created.id, { references: [] });
    expect(await makeStore().getTopic(created.id)).toMatchObject({
      references: [],
      description: created.description,
      subsystemModels: created.subsystemModels,
    });
  });

  test('existing topics need no references migration', async () => {
    const store = makeStore();
    const topic = await store.createTopic({ title: 'Without attachments' });
    expect(topic).not.toHaveProperty('references');
    await store.updateTopic(topic.id, { description: 'Still without attachments' });
    expect(await makeStore().getTopic(topic.id)).not.toHaveProperty('references');
  });

  test('deleting a referenced topic preserves the attachment for missing-target display', async () => {
    const store = makeStore();
    const target = await store.createTopic({ title: 'Target' });
    const owner = await store.createTopic({
      title: 'Owner',
      references: [{ kind: 'topic', topicId: target.id }],
    });
    await store.deleteTopic(target.id);
    expect((await makeStore().getTopic(owner.id))?.references).toEqual(owner.references);
  });

  test('delete removes the file and the index entry', async () => {
    const store = makeStore();
    await store.createTopic({ id: 'topic-d', title: 'D' });
    expect(await store.deleteTopic('topic-d')).toBe(true);
    expect(existsSync(join(topicsDir, 'topic-d.json'))).toBe(false);
    expect(await store.getTopic('topic-d')).toBeNull();
    expect(await store.deleteTopic('topic-d')).toBe(false);
  });

  test('no eviction cap — many topics all survive', async () => {
    const store = makeStore();
    for (let i = 0; i < 120; i++) {
      await store.createTopic({ id: `topic-${i}`, title: `T${i}` });
    }
    expect((await store.getTopics()).length).toBe(120);
  });
});

describe('index rebuild', () => {
  test('a corrupt _index.json is rebuilt by scanning topic files', async () => {
    const store = makeStore();
    await store.createTopic({ id: 'topic-r', title: 'R' });

    // Corrupt the manifest and force a fresh store to rebuild from disk.
    writeFileSync(join(topicsDir, '_index.json'), 'not json', 'utf8');
    const fresh = makeStore();
    const list = await fresh.list();
    expect(list.map((e) => e.id)).toContain('topic-r');
    expect(list.find((e) => e.id === 'topic-r')).not.toHaveProperty('trailCount');
    expect(readFileSync(join(topicsDir, '_index.json'), 'utf8')).not.toContain('trailCount');
  });

  test('getTopics({ refresh: true }) rescans and picks up external file changes', async () => {
    const store = makeStore();
    await store.createTopic({ id: 'topic-known', title: 'Known' });

    // A topic file written directly, bypassing the store, so the cached
    // manifest never learns about it.
    const external = {
      id: 'topic-external',
      title: 'External',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    writeFileSync(
      join(topicsDir, 'topic-external.json'),
      JSON.stringify(external, null, 2),
      'utf8',
    );

    // The cached read trusts the manifest and misses the external file...
    expect((await store.getTopics()).map((t) => t.id)).not.toContain('topic-external');

    // ...a refreshing read rebuilds from disk and sees it.
    expect((await store.getTopics({ refresh: true })).map((t) => t.id)).toContain(
      'topic-external',
    );

    // A file removed out-of-band drops out of the refreshed manifest too.
    rmSync(join(topicsDir, 'topic-external.json'));
    expect((await store.getTopics({ refresh: true })).map((t) => t.id)).not.toContain(
      'topic-external',
    );
  });
});

describe('migration', () => {
  const seedLegacy = (topics: Record<string, unknown>[]) => {
    writeFileSync(legacyBlob, JSON.stringify({ version: '1.0.0', topics }, null, 2), 'utf8');
  };

  test('fans the blob out to file-per-topic and backs up the blob', async () => {
    seedLegacy([
      {
        id: 'topic-1',
        title: 'One',
        trailIds: ['a'],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
      { id: 'topic-2', title: 'Two', trailIds: [], repos: ['pkg:github/a/b'] },
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
    expect(one).toHaveProperty('trailIds', ['a']);
    expect(await store.getTopic('topic-2')).toMatchObject({
      title: 'Two',
      repos: ['pkg:github/a/b'],
    });
    expect(await store.getTopic('topic-2')).toHaveProperty('trailIds', []);
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

/**
 * Regression coverage for the shared local Graphify cache reader.
 *
 * Studio and the CLI must agree on the HEAD(+dirty) slot identity, so this
 * pins the on-disk layout, readiness states, and fingerprint inputs.
 */

import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  cacheSlotKey,
  createLocalGraphifyAuditProvider,
  sanitizePurlDirName,
} from './local-graphify'

const PURL = 'pkg:github/acme/widget'

function git(root: string, args: string[]): string {
  const res = spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  if (res.status !== 0) throw new Error(`git ${args.join(' ')} failed`)
  return res.stdout ?? ''
}

function makeRepo(): { root: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), 'lf-repo-'))
  git(root, ['init', '-q'])
  git(root, ['config', 'user.email', 'test@example.com'])
  git(root, ['config', 'user.name', 'Test'])
  writeFileSync(join(root, 'a.ts'), 'export const a = 1\n')
  git(root, ['add', '.'])
  git(root, ['commit', '-q', '-m', 'init'])
  return { root, head: git(root, ['rev-parse', 'HEAD']).trim() }
}

function makeStore(): string {
  return mkdtempSync(join(tmpdir(), 'lf-store-'))
}

function writeSlot(
  storeRoot: string,
  slotKey: string,
  graph: { nodes: unknown[]; links: unknown[] },
  builtAt: string,
): void {
  const dir = join(
    storeRoot,
    sanitizePurlDirName(PURL),
    slotKey,
  )
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'graph.json'), JSON.stringify(graph))
  writeFileSync(join(dir, 'meta.json'), JSON.stringify({ builtAt }))
}

describe('local graphify cache', () => {
  test('ready slot loads the graph and yields a stable fingerprint', async () => {
    const { root, head } = makeRepo()
    const store = makeStore()
    try {
      writeSlot(
        store,
        cacheSlotKey(head, null),
        { nodes: [{ id: 'n1' }], links: [] },
        '2026-01-01T00:00:00.000Z',
      )
      const provider = createLocalGraphifyAuditProvider({
        resolveRepoRoot: () => root,
        storeRoot: store,
      })
      const model = { components: [{ purl: PURL, construct: 'function' }] }

      const readiness = await provider.readiness(model)
      expect(readiness.status).toBe('possible')
      expect(readiness.purls).toEqual([
        { purl: PURL, status: 'ready', repoRoot: root },
      ])

      const snapshot = await provider.loadGraph(PURL)
      expect(snapshot?.nodes).toEqual([{ id: 'n1' }])
      expect(snapshot?.edges).toEqual([])

      const slot = await provider.resolveGraphifySlot(PURL)
      expect(slot).toEqual({
        slotKey: cacheSlotKey(head, null),
        builtAt: '2026-01-01T00:00:00.000Z',
      })

      const ensure = await provider.ensureCurrent(model)
      expect(ensure).toEqual({ ensured: [PURL], failed: [] })
    } finally {
      rmSync(root, { recursive: true, force: true })
      rmSync(store, { recursive: true, force: true })
    }
  })

  test('missing current slot is reported explicitly, not fabricated', async () => {
    const { root } = makeRepo()
    const store = makeStore()
    try {
      const provider = createLocalGraphifyAuditProvider({
        resolveRepoRoot: () => root,
        storeRoot: store,
      })
      const model = { components: [{ purl: PURL }] }

      const readiness = await provider.readiness(model)
      expect(readiness.status).toBe('not_ready')
      expect(readiness.purls[0]?.status).toBe('missing')
      expect(await provider.loadGraph(PURL)).toBeNull()

      const ensure = await provider.ensureCurrent(model)
      expect(ensure.ensured).toEqual([])
      expect(ensure.failed[0]?.purl).toBe(PURL)
      expect(ensure.failed[0]?.error).toContain('no graphify cache')
    } finally {
      rmSync(root, { recursive: true, force: true })
      rmSync(store, { recursive: true, force: true })
    }
  })

  test('unresolved checkout yields unavailable, not ready', async () => {
    const store = makeStore()
    try {
      const provider = createLocalGraphifyAuditProvider({
        resolveRepoRoot: () => null,
        storeRoot: store,
      })
      const readiness = await provider.readiness({
        components: [{ purl: PURL }],
      })
      expect(readiness.purls[0]?.status).toBe('unavailable')
      const ensure = await provider.ensureCurrent({
        components: [{ purl: PURL }],
      })
      expect(ensure.failed[0]?.error).toContain('no local checkout')
    } finally {
      rmSync(store, { recursive: true, force: true })
    }
  })

  test('non-repo purls are ignored', async () => {
    const store = makeStore()
    try {
      const provider = createLocalGraphifyAuditProvider({
        resolveRepoRoot: () => null,
        storeRoot: store,
      })
      const readiness = await provider.readiness({
        components: [{ purl: 'external:internal' }, { purl: undefined }],
      })
      expect(readiness.purls).toEqual([])
      expect(readiness.status).toBe('unavailable')
    } finally {
      rmSync(store, { recursive: true, force: true })
    }
  })
})

import { describe, expect, test } from 'bun:test'
import {
  cacheGraphifyAuditProvider,
  type GraphifyAuditProvider,
  type GraphifyAuditSnapshot,
} from './graphify-provider'

function provider(loadGraph: GraphifyAuditProvider["loadGraph"]): GraphifyAuditProvider {
  return {
    ensureCurrent: async () => ({ ensured: [], failed: [] }),
    readiness: async () => ({ status: 'possible', purls: [] }),
    resolveRepoRoot: () => null,
    loadGraph,
  }
}

describe('cacheGraphifyAuditProvider', () => {
  test('deduplicates concurrent graph loads by PURL', async () => {
    let loads = 0
    let resolve!: (graph: GraphifyAuditSnapshot) => void
    const source = provider(
      () => {
        loads++
        return new Promise((done) => {
          resolve = done
        })
      },
    )
    const cached = cacheGraphifyAuditProvider(source)
    const first = cached.loadGraph('pkg:github/acme/app')
    const second = cached.loadGraph('pkg:github/acme/app')

    expect(loads).toBe(1)
    const graph = { nodes: [], edges: [] }
    resolve(graph)
    expect(await first).toBe(graph)
    expect(await second).toBe(graph)
  })

  test('evicts a rejected load so a later attempt can retry', async () => {
    let loads = 0
    const source = provider(async () => {
      loads++
      if (loads === 1) throw new Error('temporary read failure')
      return { nodes: [], edges: [] }
    })
    const cached = cacheGraphifyAuditProvider(source)

    await expect(cached.loadGraph('pkg:github/acme/app')).rejects.toThrow(
      'temporary read failure',
    )
    expect(await cached.loadGraph('pkg:github/acme/app')).toEqual({
      nodes: [],
      edges: [],
    })
    expect(loads).toBe(2)
  })
})

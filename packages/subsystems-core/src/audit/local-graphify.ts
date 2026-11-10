/**
 * Local Graphify cache reader shared by audit hosts.
 *
 * A subsystem audit must use the graph for the *current* HEAD(+dirty) slot,
 * not a stale fallback. This module owns the on-disk layout and git probe so a
 * CLI host and Studio compute identical slot keys and fingerprints from the
 * same `~/.principal/graphify-graphs` store.
 *
 * The transport stays swappable: this is a read-only local-cache provider. A
 * host may supply `ensureCurrent` (Studio builds caches, an MCP daemon would
 * build remotely); when omitted, missing slots are reported explicitly rather
 * than fabricated.
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AuditGraphifySlot } from './engine'
import type {
  GraphifyAuditEnsureResult,
  GraphifyAuditModel,
  GraphifyAuditProvider,
  GraphifyAuditReadiness,
  GraphifyAuditSnapshot,
} from './graphify-provider'
import { cacheGraphifyAuditProvider } from './graphify-provider'
import { isRepoPurl, purlRepoKey } from './paths'

const GIT_STDOUT_MAX_BYTES = 32 * 1024 * 1024
const UNTRACKED_HASH_MAX_BYTES = 1_048_576
const GIT_PROBE_TTL_MS = 2000

/** Absolute root of the graphify cache. `PRINCIPAL_GRAPHIFY_GRAPHS_HOME` overrides it. */
export function localGraphifyStoreRoot(): string {
  const override = process.env['PRINCIPAL_GRAPHIFY_GRAPHS_HOME']?.trim()
  return override ? override : join(homedir(), '.principal', 'graphify-graphs')
}

/** Filesystem-safe directory name for a purl repo key. */
export function sanitizePurlDirName(purlKey: string): string {
  const stripped = purlKey.replace(/^pkg:/i, '')
  const cleaned = stripped
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
  return cleaned || 'unknown'
}

/** Slot folder: clean `headSha`, or `headSha+dirtyHash` when dirty. */
export function cacheSlotKey(
  headSha: string,
  dirtyHash: string | null,
): string {
  return dirtyHash ? `${headSha}+${dirtyHash}` : headSha
}

function slotDir(
  storeRoot: string,
  purlKey: string,
  headSha: string,
  dirtyHash: string | null,
): string {
  return join(
    storeRoot,
    sanitizePurlDirName(purlKey),
    cacheSlotKey(headSha, dirtyHash),
  )
}

function gitStdout(repoRoot: string, args: string[]): string | null {
  const proc = spawnSync('git', ['-C', repoRoot, ...args], {
    encoding: 'utf8',
    maxBuffer: GIT_STDOUT_MAX_BYTES,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  if (proc.status !== 0) return null
  return (proc.stdout ?? '').slice(0, GIT_STDOUT_MAX_BYTES)
}

function computeDirtyHash(
  status: string,
  diff: string,
  untrackedRaw: string,
  repoRoot: string,
): string {
  const hasher = createHash('sha256')
  hasher.update('status\0')
  hasher.update(status)
  hasher.update('\0diff\0')
  hasher.update(diff)
  hasher.update('\0untracked\0')
  if (untrackedRaw) {
    const paths = untrackedRaw.split('\0').filter(Boolean)
    paths.sort()
    for (const rel of paths) {
      hasher.update(rel)
      hasher.update('\0')
      const abs = join(repoRoot, rel)
      try {
        const st = statSync(abs)
        if (!st.isFile()) {
          hasher.update(`dir:${st.size}\0`)
          continue
        }
        hasher.update(`size:${st.size}\0`)
        if (st.size <= UNTRACKED_HASH_MAX_BYTES) {
          hasher.update(readFileSync(abs))
        } else {
          hasher.update(`mtime:${Math.floor(st.mtimeMs)}\0`)
        }
      } catch {
        hasher.update('missing\0')
      }
      hasher.update('\0')
    }
  }
  return hasher.digest('hex').slice(0, 16)
}

interface GitProbe {
  at: number
  headSha: string | null
  dirtyHash: string | null
}

export interface LocalGraphifyConfig {
  /** Resolve a purl repo key to a local checkout root. */
  resolveRepoRoot(purl: string): string | null
  /** Override the cache root (also settable via env). */
  storeRoot?: string
  /**
   * Optional build hook. When omitted, `ensureCurrent` reports missing slots
   * explicitly instead of extracting a graph.
   */
  ensureCurrent?: (
    model: GraphifyAuditModel,
  ) => Promise<GraphifyAuditEnsureResult>
}

export interface CurrentLocalGraphifySlot {
  purlKey: string
  repoRoot: string
  headSha: string
  dirtyHash: string | null
  slotKey: string
  cached: { path: string; builtAt?: string } | null
}

/** A read-only view of the local graphify cache for one audit host. */
export class LocalGraphifyCache {
  private readonly probes = new Map<string, GitProbe>()

  constructor(private readonly config: LocalGraphifyConfig) {}

  private root(): string {
    return this.config.storeRoot?.trim() || localGraphifyStoreRoot()
  }

  resolveRepoRoot(purl: string): string | null {
    return this.config.resolveRepoRoot(purl)
  }

  private probe(repoRoot: string): GitProbe {
    const cached = this.probes.get(repoRoot)
    if (cached && Date.now() - cached.at < GIT_PROBE_TTL_MS) return cached
    const headSha = gitStdout(repoRoot, ['rev-parse', 'HEAD'])?.trim() || null
    const status = gitStdout(repoRoot, ['status', '--porcelain=v1'])
    let dirtyHash: string | null = null
    if (headSha && status?.trim()) {
      const diff =
        gitStdout(repoRoot, ['diff', 'HEAD', '--binary']) ?? ''
      const untrackedRaw =
        gitStdout(repoRoot, [
          'ls-files',
          '-z',
          '--others',
          '--exclude-standard',
        ]) ?? ''
      dirtyHash = computeDirtyHash(status, diff, untrackedRaw, repoRoot)
    }
    const probe: GitProbe = { at: Date.now(), headSha, dirtyHash }
    this.probes.set(repoRoot, probe)
    return probe
  }

  /** Resolve the exact current-HEAD(+dirty) slot for a purl. */
  async currentSlot(
    purl: string,
    options?: { repoRoot?: string },
  ): Promise<CurrentLocalGraphifySlot | null> {
    const purlKey = purlRepoKey(purl)
    if (!purlKey) return null
    const repoRoot =
      options?.repoRoot?.trim() || this.config.resolveRepoRoot(purlKey)
    if (!repoRoot || !existsSync(repoRoot)) return null
    const { headSha, dirtyHash } = this.probe(repoRoot)
    if (!headSha) return null
    const slotKey = cacheSlotKey(headSha, dirtyHash)
    const dir = slotDir(this.root(), purlKey, headSha, dirtyHash)
    const graphPath = join(dir, 'graph.json')
    const metaPath = join(dir, 'meta.json')
    let cached: CurrentLocalGraphifySlot['cached'] = null
    if (existsSync(graphPath) && existsSync(metaPath)) {
      try {
        const meta = JSON.parse(
          readFileSync(metaPath, 'utf8'),
        ) as { builtAt?: string }
        cached = { path: graphPath, builtAt: meta.builtAt }
      } catch {
        /* treat as missing */
      }
    }
    return {
      purlKey,
      repoRoot,
      headSha,
      dirtyHash,
      slotKey,
      cached,
    }
  }

  /** Fingerprint input: the current slot key + when that slot was built. */
  async resolveGraphifySlot(
    purl: string,
    options?: { repoRoot?: string },
  ): Promise<AuditGraphifySlot | null> {
    const slot = await this.currentSlot(purl, options)
    if (!slot) return null
    return { slotKey: slot.slotKey, builtAt: slot.cached?.builtAt }
  }

  async readiness(
    model: GraphifyAuditModel,
    buildingPurls?: ReadonlySet<string>,
  ): Promise<GraphifyAuditReadiness> {
    const seen = new Set<string>()
    const statuses: GraphifyAuditReadiness['purls'] = []
    for (const component of model.components) {
      const key = purlRepoKey(component.purl)
      if (!key || !isRepoPurl(key) || seen.has(key)) continue
      seen.add(key)
      const repoRoot = this.config.resolveRepoRoot(key) ?? undefined
      if (buildingPurls?.has(key)) {
        statuses.push({ purl: key, status: 'building', repoRoot })
        continue
      }
      const slot = await this.currentSlot(key, { repoRoot })
      if (!slot) {
        statuses.push({ purl: key, status: 'unavailable' })
        continue
      }
      statuses.push({
        purl: key,
        status: slot.cached ? 'ready' : 'missing',
        repoRoot: slot.repoRoot,
      })
    }
    statuses.sort((a, b) => a.purl.localeCompare(b.purl))
    const all = statuses.map((p) => p.status)
    let status: GraphifyAuditReadiness['status']
    if (all.length === 0) status = 'unavailable'
    else if (all.includes('building')) status = 'running'
    else if (all.every((s) => s === 'ready')) status = 'possible'
    else if (all.includes('ready')) status = 'partial'
    else if (all.includes('missing')) status = 'not_ready'
    else status = 'unavailable'
    return { status, purls: statuses }
  }

  async loadGraph(
    purl: string,
    options?: { repoRoot?: string },
  ): Promise<GraphifyAuditSnapshot | null> {
    const slot = await this.currentSlot(purl, options)
    if (!slot?.cached) return null
    try {
      const graph = JSON.parse(
        readFileSync(slot.cached.path, 'utf8'),
      ) as { nodes?: unknown[]; links?: unknown[]; edges?: unknown[] }
      if (!Array.isArray(graph.nodes)) return null
      const edges = graph.links ?? graph.edges ?? []
      return {
        nodes: graph.nodes,
        edges: Array.isArray(edges) ? edges : [],
      }
    } catch {
      return null
    }
  }

  /** Read-only default: report missing current slots instead of building. */
  async ensureCurrent(
    model: GraphifyAuditModel,
  ): Promise<GraphifyAuditEnsureResult> {
    if (this.config.ensureCurrent) {
      return this.config.ensureCurrent(model)
    }
    const ensured: string[] = []
    const failed: GraphifyAuditEnsureResult['failed'] = []
    const seen = new Set<string>()
    for (const component of model.components) {
      const key = purlRepoKey(component.purl)
      if (!key || !isRepoPurl(key) || seen.has(key)) continue
      seen.add(key)
      const slot = await this.currentSlot(key)
      if (slot?.cached) {
        ensured.push(key)
      } else if (!slot) {
        failed.push({
          purl: key,
          error:
            'no local checkout for this purl — register the repo in Alexandria',
        })
      } else {
        failed.push({
          purl: key,
          error: `no graphify cache for the current HEAD(+dirty) slot ${slot.slotKey} — build it in Subsystems Studio or via an MCP Graphify provider`,
        })
      }
    }
    return { ensured, failed }
  }

  /** The GraphifyAuditProvider port, with per-pass snapshot caching. */
  provider(): GraphifyAuditProvider {
    return cacheGraphifyAuditProvider({
      ensureCurrent: (model) => this.ensureCurrent(model),
      readiness: (model, building) => this.readiness(model, building),
      resolveRepoRoot: (purl) => this.config.resolveRepoRoot(purl),
      loadGraph: (purl, options) => this.loadGraph(purl, options),
    })
  }
}

/** Convenience factory: a cached provider + fingerprint resolver for one host. */
export function createLocalGraphifyAuditProvider(
  config: LocalGraphifyConfig,
): GraphifyAuditProvider & {
  resolveGraphifySlot(
    purl: string,
    options?: { repoRoot?: string },
  ): Promise<AuditGraphifySlot | null>
} {
  const cache = new LocalGraphifyCache(config)
  const provider = cache.provider()
  return Object.assign(provider, {
    resolveGraphifySlot: (purl: string, options?: { repoRoot?: string }) =>
      cache.resolveGraphifySlot(purl, options),
  })
}

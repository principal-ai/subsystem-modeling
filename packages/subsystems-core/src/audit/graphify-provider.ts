/**
 * Graphify port used by subsystem-model audits.
 *
 * The audit should depend on graph data and freshness semantics, not on how a
 * graph was produced or served. Implementations may read the local cache, run
 * Graphify on demand, or call a Graphify MCP service.
 */

export interface GraphifyAuditModel {
  components: Array<{
    purl?: string
    construct?: string
  }>
}

export interface GraphifyAuditEnsureResult {
  ensured: string[]
  failed: Array<{ purl: string; error: string }>
}

export interface GraphifyAuditPurlReadiness {
  purl: string
  status: 'ready' | 'missing' | 'building' | 'unavailable'
  repoRoot?: string
}

export interface GraphifyAuditReadiness {
  status: 'possible' | 'partial' | 'not_ready' | 'running' | 'unavailable'
  purls: GraphifyAuditPurlReadiness[]
}

export interface GraphifyAuditSnapshot {
  nodes: unknown[]
  edges: unknown[]
}

export interface GraphifyAuditProvider {
  /** Ensure current-HEAD(+dirty) graphs for the model's local repositories. */
  ensureCurrent(model: GraphifyAuditModel): Promise<GraphifyAuditEnsureResult>
  /** Describe current-HEAD(+dirty) graph availability without building. */
  readiness(
    model: GraphifyAuditModel,
    buildingPurls?: ReadonlySet<string>,
  ): Promise<GraphifyAuditReadiness>
  /** Resolve a repo PURL to a local checkout, when one is available. */
  resolveRepoRoot(purl: string): string | null
  /** Load the graph for a PURL after ensure/readiness has been checked. */
  loadGraph(
    purl: string,
    options?: { repoRoot?: string },
  ): Promise<GraphifyAuditSnapshot | null>
}

/**
 * Keep one Graphify read/parse per repository for a single audit pass.
 * Rejected reads are evicted so a later attempt can recover.
 */
export function cacheGraphifyAuditProvider(
  provider: GraphifyAuditProvider,
): GraphifyAuditProvider {
  const snapshots = new Map<string, Promise<GraphifyAuditSnapshot | null>>()
  return {
    ensureCurrent: (model) => provider.ensureCurrent(model),
    readiness: (model, buildingPurls) => provider.readiness(model, buildingPurls),
    resolveRepoRoot: (purl) => provider.resolveRepoRoot(purl),
    loadGraph(purl, options) {
      const existing = snapshots.get(purl)
      if (existing) return existing
      const pending = provider.loadGraph(purl, options)
      snapshots.set(purl, pending)
      void pending.catch(() => {
        if (snapshots.get(purl) === pending) snapshots.delete(purl)
      })
      return pending
    },
  }
}

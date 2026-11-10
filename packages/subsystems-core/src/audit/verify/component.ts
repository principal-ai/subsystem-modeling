/**
 * Deterministic per-component verification shared by every audit host.
 *
 * Filesystem and tree-sitter access are local; the model store, Graphify
 * transport, accepted augmentations, and span promotion are injected by the
 * host. Studio and the CLI therefore run the same verification policy.
 */

import { existsSync, promises as fs } from 'node:fs'
import { join } from 'node:path'
import {
  findUniqueDefinitionBySymbol,
  resolveComponentAnchor,
  type ComponentAnchorResult,
} from '../../graphify/anchor'
import { normalizeSourcePath } from '../../graphify/ids'
import {
  inferConstructFromGraphify,
  resolveConstructMatch,
} from '../../graphify/construct'
import {
  compareSignatures,
  extractGraphifySignature,
} from '../../graphify/signature'
import type { GraphifyEdge, GraphifyNode } from '../../graphify/types'
import type { SubsystemComponent } from '../../types/subsystem-model'
import type { GraphifyAuditProvider } from '../graphify-provider'
import { storeTypeUndeclared } from '../fixes'
import {
  buildSourceSpan,
  hashContentRange,
  parseSourceLocation,
} from '../hash'
import { purlRepoKey } from '../paths'
import type { AuditComponentVerification } from '../verification'
import { deriveSpan, type SpanTreeCache } from './span'

export interface VerifyComponentSpanClaim {
  startLine: number
  endLine: number
  contentHash: string
}

export interface VerifyComponentSignatureClaim {
  parameters: Array<{ type: string; optional?: boolean }>
  returnType?: string
}

export interface VerifyComponentAugmentation {
  claims: {
    span?: VerifyComponentSpanClaim
    construct?: string
    signature?: VerifyComponentSignatureClaim
  }
  evidence?: string[]
}

/** Host-owned state the verifier reads or writes. */
export interface VerifyComponentDeps {
  /** Load the stored model, or null when the id is unknown. */
  loadModel(
    graphId: string,
  ): Promise<{ id: string; components: SubsystemComponent[] } | null>

  /** Persist promoted components (non-dry-run span promotion only). */
  updateComponents?(
    graphId: string,
    components: SubsystemComponent[],
  ): Promise<void>

  findAcceptedSpanAugmentation(input: {
    purl: string
    file: string
    symbol: string
  }): Promise<VerifyComponentAugmentation | null>

  findAcceptedConstructAugmentation(input: {
    purl: string
    file: string
    symbol: string
  }): Promise<VerifyComponentAugmentation | null>

  findAcceptedSignatureAugmentation(input: {
    purl: string
    file: string
    symbol: string
  }): Promise<VerifyComponentAugmentation | null>
}

export interface VerifyComponentOptions {
  dryRun?: boolean
  graphifyProvider: GraphifyAuditProvider
  treeCache?: SpanTreeCache
}

function mapAnchor(
  anchor: ComponentAnchorResult,
): NonNullable<AuditComponentVerification['anchor']> {
  return {
    resolution: anchor.resolution,
    nodeId: anchor.node ? String(anchor.node.id) : undefined,
    label: anchor.node ? String(anchor.node.label ?? '') : undefined,
    source_file:
      anchor.node && typeof anchor.node.source_file === 'string'
        ? anchor.node.source_file
        : undefined,
    source_location:
      anchor.node && typeof anchor.node.source_location === 'string'
        ? anchor.node.source_location
        : undefined,
    candidates: anchor.candidates.map((n) => ({
      nodeId: String(n.id),
      label: String(n.label ?? ''),
      source_file:
        typeof n.source_file === 'string' ? n.source_file : undefined,
      source_location:
        typeof n.source_location === 'string' ? n.source_location : undefined,
    })),
  }
}

/**
 * Freshness of a span against live content.
 *
 * `full` when the live range hashes to the span's `contentHash` and Graphify
 * still points at the span's start. `stale` when the content changed or the
 * declaration moved (positional drift). The hash is the invariant: a construct
 * that merely moved can be re-pinned by re-hashing the shifted range.
 */
function spanFreshness(
  current: { contentHash: string; startLine: number },
  liveHash: string,
  graphifyStart: number | null,
): NonNullable<AuditComponentVerification['declaration']>['freshness'] {
  if (liveHash !== current.contentHash) return 'stale'
  if (graphifyStart != null && graphifyStart !== current.startLine)
    return 'stale'
  return 'full'
}

async function captureDeclaration(
  graphId: string,
  components: SubsystemComponent[],
  component: SubsystemComponent,
  anchor: ComponentAnchorResult,
  fileContent: string | null,
  opts: VerifyComponentOptions,
  deps: VerifyComponentDeps,
): Promise<
  NonNullable<AuditComponentVerification['declaration']> | undefined
> {
  const stored = component.declarationSpan

  // The capture lane: an accepted span augmentation is the only source of a
  // full span (Graphify gives the start line, never the end).
  let captured: VerifyComponentSpanClaim | undefined
  if (component.purl && component.file && component.symbol) {
    const aug = await deps.findAcceptedSpanAugmentation({
      purl: component.purl,
      file: component.file,
      symbol: component.symbol,
    })
    const claim = aug?.claims.span
    if (claim) {
      captured = buildSourceSpan({
        startLine: claim.startLine,
        endLine: claim.endLine,
        contentHash: claim.contentHash,
      })
    }
  }

  const current = captured ?? stored

  // Tree-sitter derivation: graphify start + a parse of the file gives the
  // declaration's end line for *any* grounded claim, not only ones with a
  // stored span. This is what makes an unanchored construct capturable
  // without an agent when every structural gate passes.
  let derivation:
    | NonNullable<AuditComponentVerification['declaration']>['derivation']
  if (fileContent && component.file) {
    const d = await deriveSpan({
      content: fileContent,
      file: component.file,
      symbol: component.symbol,
      construct: component.construct,
      anchor,
      storedSpan: stored,
      treeCache: opts.treeCache,
    })
    let span: ReturnType<typeof buildSourceSpan> | undefined
    if (
      d.class === 'trivial' &&
      d.graphifyStart != null &&
      d.derivedEnd != null
    ) {
      const hash = hashContentRange(
        fileContent,
        d.graphifyStart,
        d.derivedEnd,
      )
      if (hash) {
        span = buildSourceSpan({
          startLine: d.graphifyStart,
          endLine: d.derivedEnd,
          contentHash: hash,
        })
      }
    }
    derivation = {
      class: d.class,
      endLine: d.derivedEnd ?? undefined,
      span,
      failedGates: d.failedGates,
      evidence: d.evidence,
    }
  }

  if (!current) return { freshness: 'unanchored', derivation }
  if (!fileContent) return { freshness: 'unchecked', span: current, derivation }

  const liveHash = hashContentRange(
    fileContent,
    current.startLine,
    current.endLine,
  )
  if (liveHash == null)
    return { freshness: 'missing', span: current, derivation }

  const graphifyStart =
    anchor.resolution === 'exact' && anchor.node
      ? parseSourceLocation(
          typeof anchor.node.source_location === 'string'
            ? anchor.node.source_location
            : undefined,
        )
      : null

  // A content-preserving move: shift the stored span to Graphify's start,
  // keep its length, and re-hash. Offered only when the hash is unchanged —
  // then the construct moved intact and the shift is a safe re-pin.
  let repin: ReturnType<typeof buildSourceSpan> | undefined
  if (
    stored &&
    graphifyStart != null &&
    graphifyStart !== current.startLine &&
    graphifyStart !== stored.startLine
  ) {
    const len = stored.endLine - stored.startLine
    const shiftedHash = hashContentRange(
      fileContent,
      graphifyStart,
      graphifyStart + len,
    )
    if (shiftedHash === stored.contentHash) {
      repin = buildSourceSpan({
        startLine: graphifyStart,
        endLine: graphifyStart + len,
        contentHash: shiftedHash,
      })
    }
  }

  const freshness = spanFreshness(current, liveHash, graphifyStart)

  // Promote an accepted span augmentation into the model (dry-run reports
  // without writing).
  if (
    !opts.dryRun &&
    deps.updateComponents &&
    captured &&
    (!stored ||
      stored.startLine !== captured.startLine ||
      stored.endLine !== captured.endLine ||
      stored.contentHash !== captured.contentHash)
  ) {
    await deps.updateComponents(
      graphId,
      components.map((c) =>
        c.alias === component.alias
          ? { ...c, declarationSpan: captured }
          : c,
      ),
    )
  }

  return {
    freshness,
    span: current,
    liveContentHash: liveHash,
    repin,
    derivation,
  }
}

async function finalizeResult(
  graphId: string,
  components: SubsystemComponent[],
  component: SubsystemComponent,
  anchor: ComponentAnchorResult | undefined,
  fileContent: string | null,
  result: AuditComponentVerification,
  opts: VerifyComponentOptions,
  deps: VerifyComponentDeps,
): Promise<AuditComponentVerification> {
  if (!anchor) return result
  const declaration = await captureDeclaration(
    graphId,
    components,
    component,
    anchor,
    fileContent,
    opts,
    deps,
  )
  return declaration ? { ...result, declaration } : result
}

export async function verifySubsystemComponent(
  graphId: string,
  componentAlias: string,
  opts: VerifyComponentOptions,
  deps: VerifyComponentDeps,
): Promise<AuditComponentVerification> {
  const graphifyProvider = opts.graphifyProvider
  const graph = await deps.loadModel(graphId)
  if (!graph) {
    return { ok: false, error: `unknown graph: ${graphId}` }
  }
  const component = graph.components.find((c) => c.alias === componentAlias)
  if (!component) {
    return { ok: false, error: `unknown component: ${componentAlias}`, componentAlias }
  }

  const purlKey = purlRepoKey(component.purl)
  const repoRoot = purlKey ? graphifyProvider.resolveRepoRoot(purlKey) : null

  const fileResult: NonNullable<AuditComponentVerification['file']> = {
    exists: false,
    symbolDeclared: null,
    repoRoot: repoRoot ?? undefined,
  }
  let fileContent: string | null = null
  if (repoRoot && component.file) {
    const abs = join(repoRoot, component.file)
    try {
      await fs.access(abs)
      fileResult.exists = true
      fileContent = await fs.readFile(abs, 'utf8')
      // Symbol presence is graphify's job (exact anchor). No text-regex check.
    } catch {
      fileResult.exists = false
    }
  }

  if (!purlKey) {
    return {
      ok: true,
      componentAlias,
      file: fileResult,
      cache: { status: 'unavailable', purl: component.purl || '' },
    }
  }

  const readiness = await graphifyProvider.readiness({
    components: [{ purl: purlKey }],
  })
  const purlStatus = readiness.purls[0]?.status ?? 'unavailable'
  const cacheStatus =
    purlStatus === 'ready'
      ? 'ready'
      : purlStatus === 'missing' || purlStatus === 'building'
        ? 'missing'
        : 'unavailable'

  const cache: NonNullable<AuditComponentVerification['cache']> = {
    status: cacheStatus,
    purl: purlKey,
    repoRoot: readiness.purls[0]?.repoRoot ?? repoRoot ?? undefined,
  }

  if (cacheStatus !== 'ready') {
    return { ok: true, componentAlias, file: fileResult, cache }
  }

  const bundle = await graphifyProvider.loadGraph(purlKey, {
    repoRoot: cache.repoRoot,
  })
  if (!bundle) {
    return {
      ok: true,
      componentAlias,
      file: fileResult,
      cache: { ...cache, status: 'missing' },
    }
  }

  const nodes = bundle.nodes as GraphifyNode[]
  const edges = bundle.edges as GraphifyEdge[]
  const anchor = resolveComponentAnchor(nodes, {
    file: component.file,
    symbol: component.symbol,
    purl: purlKey,
  })

  // Symbol presence comes from graphify anchor, not a text regex.
  const claimedSymbol =
    typeof component.symbol === 'string' && component.symbol.trim().length > 0
  if (claimedSymbol) {
    fileResult.symbolDeclared = anchor.resolution === 'exact'
  }

  let fileSuggest: AuditComponentVerification['fileSuggest']
  let fileCandidates: AuditComponentVerification['fileCandidates']
  if (
    fileResult.exists === false &&
    claimedSymbol &&
    repoRoot &&
    typeof component.symbol === 'string'
  ) {
    const hit = findUniqueDefinitionBySymbol(nodes, component.symbol)
    if (hit.status === 'unique') {
      const suggested = normalizeSourcePath(
        String(hit.node.source_file ?? ''),
      )
      const claimed = component.file
        ? normalizeSourcePath(component.file)
        : ''
      if (
        suggested &&
        suggested !== claimed &&
        existsSync(join(repoRoot, suggested))
      ) {
        fileSuggest = {
          file: suggested,
          nodeId: String(hit.node.id),
          label: String(hit.node.label ?? ''),
        }
      }
    } else if (hit.status === 'ambiguous') {
      const seen = new Set<string>()
      const list: NonNullable<AuditComponentVerification['fileCandidates']> = []
      for (const node of hit.candidates) {
        const file = normalizeSourcePath(String(node.source_file ?? ''))
        if (!file || seen.has(file)) continue
        if (!existsSync(join(repoRoot, file))) continue
        seen.add(file)
        list.push({
          file,
          nodeId: String(node.id),
          label: String(node.label ?? ''),
        })
      }
      if (list.length > 1) fileCandidates = list
      else if (list.length === 1) {
        // Only one candidate still on disk — treat as unique suggest.
        fileSuggest = list[0]
      }
    }
  }

  const base: AuditComponentVerification = {
    ok: true,
    componentAlias,
    file: fileResult,
    cache,
    anchor: mapAnchor(anchor),
    fileSuggest,
    fileCandidates,
  }

  // Kind check only after exact anchor; external claims skip.
  if (anchor.resolution !== 'exact' || !anchor.node) {
    return finalizeResult(
      graphId,
      graph.components,
      component,
      anchor,
      fileContent,
      base,
      opts,
      deps,
    )
  }
  if (component.construct === 'external') {
    return finalizeResult(
      graphId,
      graph.components,
      component,
      anchor,
      fileContent,
      base,
      opts,
      deps,
    )
  }

  const inferred = inferConstructFromGraphify(anchor.node, edges)
  const claimed = String(component.construct ?? '')

  // Accepted, agent-confirmed construct for this file+symbol, if any. Graphify's
  // inferred construct is a structural hint, not ground truth — an augmentation
  // can confirm the claim when Graphify is silent (`unknown`) *or* disagrees
  // (its vocabulary has no `store`/`custom_entity`, and a call-style accessor
  // label biases it to `function`).
  const aug =
    claimed && component.file && component.symbol
      ? await deps.findAcceptedConstructAugmentation({
          purl: purlKey,
          file: component.file,
          symbol: component.symbol,
        })
      : null
  const augConstruct = aug?.claims.construct?.trim()

  const outcome = resolveConstructMatch(
    claimed,
    inferred.construct,
    augConstruct,
  )
  const augmentedEvidence = outcome.augmentedBy
    ? [
        `augmented construct ${outcome.augmentedBy} (agent-confirmed, graphify inferred ${inferred.construct})`,
        ...(aug?.evidence ?? []),
      ]
    : []
  const construct: NonNullable<AuditComponentVerification['construct']> = {
    claimed,
    inferred: inferred.construct,
    match: outcome.match,
    evidence: [...inferred.evidence, ...augmentedEvidence],
    ...(outcome.augmentedBy ? { augmented: outcome.augmentedBy } : {}),
  }

  if (outcome.match === null) {
    return finalizeResult(
      graphId,
      graph.components,
      component,
      anchor,
      fileContent,
      {
        ...base,
        ok: true,
        code: 'construct_unconfirmed',
        construct,
      },
      opts,
      deps,
    )
  }
  if (outcome.match === false) {
    return finalizeResult(
      graphId,
      graph.components,
      component,
      anchor,
      fileContent,
      {
        ...base,
        ok: false,
        code: 'construct_mismatch',
        error: `construct mismatch: claimed ${claimed}, inferred ${inferred.construct}`,
        construct,
      },
      opts,
      deps,
    )
  }

  const withKind: AuditComponentVerification = { ...base, construct }

  // Store completeness — an in-memory store declares the type it holds, the
  // way every other declaration declares its signature. A gap, never a hard
  // failure: the agent reads the declaration and authors `declaration.valueType`.
  const withStoreType: AuditComponentVerification = {
    ...withKind,
    ...(storeTypeUndeclared(component) ? { storeTypeUndeclared: true } : {}),
  }

  // Signature / params — function & method only, after kind ok.
  if (claimed !== 'function' && claimed !== 'method') {
    return finalizeResult(
      graphId,
      graph.components,
      component,
      anchor,
      fileContent,
      withStoreType,
      opts,
      deps,
    )
  }

  const nodesById = new Map(nodes.map((n) => [String(n.id), n]))
  const inferredSig = extractGraphifySignature(
    String(anchor.node.id),
    edges,
    nodesById,
  )
  const claimedForCompare =
    component.declaration &&
    (component.declaration.kind === 'function' ||
      component.declaration.kind === 'method')
      ? {
          parameters:
            'parameters' in component.declaration
              ? (component.declaration.parameters as Array<{
                  name?: string
                  type: string
                }>)
              : undefined,
          returnType:
            'returnType' in component.declaration
              ? (component.declaration.returnType as string | undefined)
              : undefined,
        }
      : undefined

  const sig = compareSignatures(claimedForCompare, inferredSig)
  let signature: NonNullable<AuditComponentVerification['signature']> = {
    match: sig.match,
    skipped: sig.skipped,
    reason: sig.reason,
    skipCode: sig.skipCode,
    claimed: sig.claimed,
    inferred: sig.inferred,
  }

  // Graphify has no usable signature edges. An accepted, agent-extracted
  // augmentation IS the confirmation — there is nothing deterministic to
  // compare against: Graphify is silent, and comparing to the model's own
  // declaration would be circular. Trust it, and label it as agent-confirmed
  // so it is never mistaken for a Graphify-verified match.
  if (sig.skipped && component.file && component.symbol) {
    const aug = await deps.findAcceptedSignatureAugmentation({
      purl: purlKey,
      file: component.file,
      symbol: component.symbol,
    })
    const augSig = aug?.claims.signature
    if (augSig) {
      signature = {
        match: true,
        skipped: false,
        reason: 'augmented signature (agent-extracted, human-confirmed)',
        claimed: sig.claimed,
        inferred: sig.inferred,
        augmented: augSig,
      }
    }
  }

  if (!signature.match && !signature.skipped) {
    return finalizeResult(
      graphId,
      graph.components,
      component,
      anchor,
      fileContent,
      {
        ...withKind,
        ok: false,
        code: 'signature_mismatch',
        error: `signature mismatch: ${sig.reason ?? 'types differ'} (claimed params [${sig.claimed.parameterTypes.join(', ')}] vs [${sig.inferred.parameterTypes.join(', ')}]; return [${sig.claimed.returnTypes.join(', ')}] vs [${sig.inferred.returnTypes.join(', ')}])`,
        signature,
      },
      opts,
      deps,
    )
  }

  return finalizeResult(
    graphId,
    graph.components,
    component,
    anchor,
    fileContent,
    { ...withStoreType, signature },
    opts,
    deps,
  )
}

/** Verdict category for a single component verification result. */
export function verifyVerdict(r: AuditComponentVerification): {
  category: string
  detail?: string
} {
  if (!r.ok) {
    if (r.cache && r.cache.status !== 'ready') {
      return { category: `cache_${r.cache.status}`, detail: r.cache.purl }
    }
    switch (r.code) {
      case 'construct_mismatch':
        return {
          category: 'construct_mismatch',
          detail: `claimed ${r.construct?.claimed}, inferred ${r.construct?.inferred}`,
        }
      case 'signature_mismatch':
        return {
          category: 'signature_mismatch',
          detail: r.error,
        }
      default:
        return { category: 'error', detail: r.error }
    }
  }
  if (r.construct?.match === null || r.code === 'construct_unconfirmed') {
    return {
      category: 'construct_unconfirmed',
      detail: `claimed ${r.construct?.claimed}, inferred unknown`,
    }
  }
  if (r.construct?.augmented) {
    return {
      category: 'construct_augmented',
      detail: `claimed ${r.construct.claimed}, graphify inferred ${r.construct.inferred}, agent-confirmed`,
    }
  }
  if (r.storeTypeUndeclared) {
    return { category: 'store_type_undeclared' }
  }
  if (r.cache && r.cache.status !== 'ready') {
    return { category: `cache_${r.cache.status}`, detail: r.cache.purl }
  }
  if (!r.anchor || r.anchor.resolution !== 'exact') {
    return {
      category: `anchor_${r.anchor?.resolution ?? 'missing'}`,
      detail: r.anchor?.nodeId,
    }
  }
  if (r.signature) {
    if (r.signature.skipped) {
      const detail = r.signature.reason
      switch (r.signature.skipCode) {
        case 'no_claimed_types':
          return { category: 'signature_no_claimed_types', detail }
        case 'generic_arg_only':
          return { category: 'signature_generic_arg_only', detail }
        case 'partially_generic_arg':
          return { category: 'signature_partially_generic_arg', detail }
        case 'unresolved_claimed_types':
          return { category: 'signature_unresolved_claimed_types', detail }
        default:
          return { category: 'signature_skipped', detail }
      }
    }
    if (r.signature.augmented) {
      return {
        category: 'signature_augmented',
        detail: 'agent-extracted, human-confirmed',
      }
    }
    return r.signature.match
      ? { category: 'signature_match' }
      : { category: 'signature_mismatch', detail: r.error }
  }
  return { category: 'construct_only' }
}

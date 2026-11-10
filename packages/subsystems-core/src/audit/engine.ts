/**
 * Deterministic subsystem-model audit engine.
 *
 * The engine owns the audit pass: per-component verification, boundary and
 * trail checks, report assembly, fingerprinting, persistence, and provenance
 * stamping. Hosts (Studio, the CLI, a future MCP daemon) supply the concrete
 * adapters for the model store, Graphify, source access, C4 evidence,
 * augmentations, and persistence.
 */

import type {
  SubsystemComponent,
  SubsystemTrail,
} from '../types/subsystem-model'
import {
  auditBoundaryFields,
  auditProcessBacking,
  auditProcessVerification,
  dropUnbackedMissing,
} from './boundary'
import type { C4AuditElement } from './c4'
import {
  adoptGraphifyDeclarationRefFixFromVerify,
  adoptGraphifyFileFixFromVerify,
  adoptGraphifySignatureFixFromVerify,
  adoptTreeSitterSpanFixFromVerify,
  installedDependencyPackage,
  storeTypeStale,
  verificationFailureDiagnostic,
  verificationUnavailableFinding,
} from './fixes'
import type {
  GraphifyAuditProvider,
  GraphifyAuditReadiness,
} from './graphify-provider'
import { hashContentRange } from './hash'
import { isRepoPurl, purlRepoKey } from './paths'
import { classifyAuditReport } from './report-logic'
import type {
  SubsystemModelAuditCheck,
  SubsystemModelAuditFinding,
  SubsystemModelAuditReport,
} from './report'
import {
  callsSiteOutsideFrom,
  unconnectedComponentFindings,
} from './trail'
import type { AuditComponentVerification } from './verification'

/** The model surface the engine reads. Hosts adapt their stored record. */
export interface AuditModel {
  graphId: string
  title: string
  updatedAt: string
  components: SubsystemComponent[]
  trails?: SubsystemTrail[]
}

export interface AuditModelFileCheck {
  missing: Array<{ componentAlias: string }>
  missingCount: number
}

export interface AuditCallSiteClaim {
  lines: { start: number; end: number }
  contentHash: string
}

export interface AuditGraphifySlot {
  slotKey: string
  builtAt?: string
}

/**
 * Host adapters. Everything here is I/O or host-owned state; the engine holds
 * the audit policy.
 */
export interface AuditEngineDeps {
  graphifyProvider: GraphifyAuditProvider

  /** Load the stored model, or null when the id is unknown. */
  loadModel(graphId: string): Promise<AuditModel | null>

  /** Mechanical file-presence check for the whole model. */
  verifyModelFiles(model: AuditModel): Promise<AuditModelFileCheck>

  /** Verify one component. The host owns filesystem/Graphify/tree-sitter. */
  verifyComponent(
    graphId: string,
    componentAlias: string,
    options: { graphifyProvider: GraphifyAuditProvider; treeCache: unknown },
  ): Promise<AuditComponentVerification>

  /** One parse cache per audit pass, opaque to the engine. */
  createSpanTreeCache(): unknown
  disposeSpanTreeCache(cache: unknown): void

  /** Accepted module-boundary augmentation for an intentional module≠file. */
  findAcceptedModuleAugmentation(input: {
    purl: string
    file: string
    symbol: string
    module: string
  }): Promise<unknown | null>

  /** Accepted call-site augmentation for a trail step. */
  findAcceptedCallSiteAugmentation(input: {
    purl: string
    file: string
    symbol: string
    targetFile: string
    targetSymbol: string
    mechanism: string
  }): Promise<{ claims: { callSite?: AuditCallSiteClaim } } | null>

  /** Read one repo's accepted C4 element set. */
  readC4Elements(repoKey: string): Promise<{ elements: readonly C4AuditElement[] }>

  /** Read a repo-relative file from a checkout. */
  readFile(repoRoot: string, file: string): Promise<string>

  /** Resolve the declaration enclosing a line in a file. */
  enclosingDeclaration(input: {
    repoRoot: string
    file: string
    line: number
  }): Promise<{ symbol: string; startLine: number; endLine: number } | null>

  /** Resolve a named declaration in a file. */
  declarationForSymbol(input: {
    repoRoot: string
    file: string
    symbol: string
  }): Promise<{ startLine: number; endLine: number } | null>

  /** Current HEAD(+dirty) graphify slot identity for fingerprinting. */
  resolveGraphifySlot(
    purl: string,
    options: { repoRoot?: string },
  ): Promise<AuditGraphifySlot | null>

  /** Persist the report (and its fingerprint). */
  persistReport(
    graphId: string,
    report: SubsystemModelAuditReport,
    fingerprint: string,
  ): Promise<void>

  /** True when every referenced file is clean in its checkout. */
  referencedFilesClean(
    components: readonly SubsystemComponent[],
    trails: readonly SubsystemTrail[] | undefined,
  ): Promise<boolean>

  /** Capture one commit per referenced purl repo key. */
  capturePurlCommits(
    components: readonly SubsystemComponent[],
  ): Promise<Record<string, unknown>>

  /** Stamp the verified commit pin on the model. */
  stampVerifiedCommits(
    graphId: string,
    commits: Record<string, unknown>,
  ): Promise<void>

  /** Clock override (tests). */
  now?(): Date

  /** Non-fatal diagnostics. */
  warn?(message: string, err?: unknown): void
}

export type AuditEngineResult =
  | { ok: true; report: SubsystemModelAuditReport; fingerprint: string }
  | { ok: false; error: string }

/**
 * Stable fingerprint of model claims + current checkout graphify slot.
 * Changes when the model is edited, HEAD/dirty moves, or the exact slot rebuilds.
 */
export async function buildAuditFingerprint(
  model: AuditModel,
  graphify: GraphifyAuditReadiness | undefined,
  resolveSlot: AuditEngineDeps['resolveGraphifySlot'],
): Promise<string> {
  const claims = [...model.components]
    .map((c) =>
      [
        c.alias,
        c.file ?? '',
        c.symbol ?? '',
        c.construct ?? '',
        purlRepoKey(c.purl) ?? '',
      ].join('\t'),
    )
    .sort()
    .join('\n')

  const graphifyParts = (
    await Promise.all(
      (graphify?.purls ?? []).map(async (p) => {
        const current = await resolveSlot(p.purl, { repoRoot: p.repoRoot })
        if (!current) return `${p.purl}:${p.status}:`
        const builtAt = current.builtAt ?? ''
        return `${p.purl}:${p.status}:${current.slotKey}:${builtAt}`
      }),
    )
  )
    .sort()
    .join('|')

  return [
    `updatedAt=${model.updatedAt}`,
    `components=${model.components.length}`,
    `claims=${claims}`,
    `graphify=${graphifyParts}`,
  ].join('\n')
}

/** Run one deterministic audit pass. */
export async function runSubsystemModelAudit(
  graphId: string,
  deps: AuditEngineDeps,
): Promise<AuditEngineResult> {
  const warn = deps.warn ?? (() => undefined)
  try {
    const model = await deps.loadModel(graphId)
    if (!model) return { ok: false, error: `unknown graph: ${graphId}` }
    const graphifyProvider = deps.graphifyProvider

    // Audit must use the current HEAD(+dirty) graphify slot, not a stale fallback.
    let graphifyEnsure
    try {
      graphifyEnsure = await graphifyProvider.ensureCurrent(model)
      if (graphifyEnsure.failed.length > 0) {
        warn(
          `[audit] graphify ensure incomplete for ${graphId}: ${graphifyEnsure.failed
            .map((f) => `${f.purl} (${f.error})`)
            .join('; ')}`,
        )
      }
    } catch (err) {
      warn(`[audit] graphify ensure failed for ${graphId}:`, err)
      graphifyEnsure = { ensured: [], failed: [] }
    }

    const files = await deps.verifyModelFiles(model)
    const missingFileAliases = new Set(files.missing.map((m) => m.componentAlias))

    const findings: SubsystemModelAuditFinding[] = unconnectedComponentFindings(
      model.components,
      model.trails ?? [],
    )
    const checks: SubsystemModelAuditCheck[] = []

    // One parsed tree-sitter tree per file for the whole pass.
    const treeCache = deps.createSpanTreeCache()

    // missing_file findings are attached in the per-component loop so we can
    // include a deterministic Graphify file-relocate fix when available.
    // Symbol presence is graphify-only (exact anchor).

    let unresolved = 0
    let staleDeclarations = 0
    let constructMismatches = 0
    let signatureMismatches = 0
    let weakAnchors = 0
    let okComponents = 0
    let filesVerified = 0
    let symbolsVerified = 0
    let declarationsFresh = 0
    let constructsMatched = 0
    let signaturesMatched = 0
    let anchorsExact = 0
    let externalsSkipped = 0
    let missingSymbols = 0

    const seenComponentIssue = new Set<string>([...missingFileAliases])
    // Availability findings are per-repo (purl), not per-component.
    const repoUnresolvedPurls = new Set<string>()
    const cacheUnavailablePurls = new Set<string>()

    for (const c of model.components) {
      // A deprecated claim's source is gone upstream — deliberately, with a
      // commit recorded. Skip it so the model converges.
      if (c.deprecated) {
        externalsSkipped++
        okComponents++
        checks.push({
          componentAlias: c.alias,
          componentName: c.name,
          construct: c.construct,
          symbol: c.symbol,
          file: c.file || undefined,
          fileExists: null,
          symbolDeclared: null,
          declarationFreshness: 'n/a',
          constructMatch: null,
          signature: 'n/a',
          anchor: 'n/a',
          graphify: 'skipped',
          verdict: 'skipped',
          note: c.removedIn?.commit
            ? `deprecated — removed in ${c.removedIn.commit}`
            : 'deprecated — source removed upstream',
        })
        continue
      }

      // A claim anchored into an install root is a third-party dependency
      // wearing a repo-relative path. There is nothing to verify here.
      const dependency = installedDependencyPackage(c.file)
      if (dependency) {
        externalsSkipped++
        okComponents++
        findings.push({
          kind: 'third_party_path',
          severity: 'info',
          componentAlias: c.alias,
          componentName: c.name,
          message: `File ${c.file} points into node_modules — installed artifacts are not part of the repo and cannot be verified. Model ${dependency.packageName} as construct "external" with purl "pkg:npm/${dependency.packageName}" and no file, or anchor the claim to the package's real source.`,
        })
        checks.push({
          componentAlias: c.alias,
          componentName: c.name,
          construct: c.construct,
          symbol: c.symbol,
          file: c.file || undefined,
          fileExists: null,
          symbolDeclared: null,
          declarationFreshness: 'n/a',
          constructMatch: null,
          signature: 'n/a',
          anchor: 'n/a',
          graphify: 'skipped',
          verdict: 'skipped',
          note: `installed dependency (${dependency.packageName}) — no repo source declaration check`,
        })
        continue
      }

      if (c.construct === 'external' || c.construct === 'custom_entity') {
        externalsSkipped++
        okComponents++
        checks.push({
          componentAlias: c.alias,
          componentName: c.name,
          construct: c.construct,
          symbol: c.symbol,
          file: c.file || undefined,
          fileExists: null,
          symbolDeclared: null,
          declarationFreshness: 'n/a',
          constructMatch: null,
          signature: 'n/a',
          anchor: 'n/a',
          graphify: 'skipped',
          verdict: 'skipped',
          note: 'external / custom entity — no source declaration check',
        })
        continue
      }

      // Declared before the verify call so the catch below can report a
      // per-component skip when verify throws (e.g. a tree-sitter WASM abort).
      const check: SubsystemModelAuditCheck = {
        componentAlias: c.alias,
        componentName: c.name,
        construct: c.construct,
        symbol: c.symbol,
        file: c.file || undefined,
        fileExists: null,
        symbolDeclared: null,
        declarationFreshness: 'n/a',
        constructMatch: null,
        signature: 'n/a',
        anchor: 'n/a',
        graphify: 'unavailable',
        verdict: 'ok',
      }

      let r: AuditComponentVerification
      try {
        r = await deps.verifyComponent(graphId, c.alias, {
          graphifyProvider,
          treeCache,
        })
      } catch (err) {
        warn(`[audit] verify failed for ${c.alias}:`, err)
        const diagnostic = verificationFailureDiagnostic(err)
        checks.push({
          ...check,
          graphify: 'unavailable',
          verdict: 'skipped',
          note: diagnostic,
        })
        const purl = purlRepoKey(c.purl) ?? c.purl?.trim()
        if (purl && !cacheUnavailablePurls.has(purl)) {
          cacheUnavailablePurls.add(purl)
          unresolved++
          findings.push(verificationUnavailableFinding(purl, err))
        }
        continue
      }
      let issue = seenComponentIssue.has(c.alias)

      if (!r.file?.repoRoot) {
        const purl = (c.purl || '').trim()
        const repoPurl = isRepoPurl(purl)
        check.fileExists = null
        check.graphify = 'unavailable'
        check.note = repoPurl
          ? `No local repoRoot for ${purl || c.file || c.alias}`
          : `Internal / declaration-only — no code repo for ${purl || c.alias}`
        check.verdict = 'skipped'
        if (repoPurl && !repoUnresolvedPurls.has(purl)) {
          repoUnresolvedPurls.add(purl)
          findings.push({
            kind: 'repo_unresolved',
            severity: 'info',
            purl,
            message: `Repo ${purl} is not available locally — clone it to verify its components`,
          })
          unresolved++
        }
        checks.push(check)
        continue
      }

      check.fileExists = r.file.exists === true
      if (check.fileExists) filesVerified++
      else {
        issue = true
        const fix = r.fileSuggest
          ? adoptGraphifyFileFixFromVerify(c, r.fileSuggest)
          : undefined
        const candidates = r.fileCandidates?.map((x) => x.file) ?? []
        findings.push({
          kind: 'missing_file',
          severity: 'error',
          componentAlias: c.alias,
          componentName: c.name,
          message: fix
            ? `File not found: ${c.file} — Graphify has ${c.symbol} at ${fix.file} (deterministic update available)`
            : candidates.length > 1
              ? `File not found: ${c.file} — Graphify has ${c.symbol} at multiple paths: ${candidates.join(', ')} (agent judgment required)`
              : `File not found: ${c.file}`,
          fix,
        })
      }

      if (typeof c.symbol === 'string' && c.symbol.trim()) {
        // Graphify exact anchor ⇒ symbol present. No cache ⇒ leave null.
        if (r.cache?.status === 'ready' && r.anchor?.resolution) {
          check.symbolDeclared = r.anchor.resolution === 'exact'
          if (check.symbolDeclared) symbolsVerified++
          else missingSymbols++
        } else {
          check.symbolDeclared = null
        }
      } else {
        check.symbolDeclared = null
        check.note = 'no symbol claimed'
      }

      if (r.declaration?.freshness) {
        check.declarationFreshness = r.declaration.freshness
        if (r.declaration.freshness === 'full') declarationsFresh++
        if (r.declaration.freshness === 'unanchored') {
          // An unanchored claim whose declaration span tree-sitter can pin
          // exactly is a deterministic one-click capture, not a hard failure.
          const derivedFix = adoptTreeSitterSpanFixFromVerify(r.declaration)
          if (derivedFix) {
            findings.push({
              kind: 'construct_span_capturable',
              severity: 'info',
              componentAlias: c.alias,
              componentName: c.name,
              message: `No span captured, but the declaration is derivable — ${derivedFix.label}.`,
              fix: derivedFix,
            })
          } else {
            // A hard failure: no captured span and tree-sitter could not
            // derive one deterministically — the agent lane must mint it.
            issue = true
            const deriv = r.declaration.derivation
            const why = deriv?.failedGates?.length
              ? ` (derivation ${deriv.class}: ${deriv.failedGates.join(', ')})`
              : ''
            findings.push({
              kind: 'construct_span_unconfirmed',
              severity: 'error',
              componentAlias: c.alias,
              componentName: c.name,
              message: `No source span captured — capture a span (start/end/content hash) from source to verify this construct.${why}`,
            })
            seenComponentIssue.add(c.alias)
          }
        }
        if (r.declaration.freshness === 'stale') {
          // A warning: the span was captured but drifted.
          const stored = c.declarationSpan
          const fix = adoptGraphifyDeclarationRefFixFromVerify(
            c,
            r.declaration,
            r.anchor,
          )
          findings.push({
            kind: 'construct_span_stale',
            severity: 'info',
            componentAlias: c.alias,
            componentName: c.name,
            message: fix
              ? `Declaration moved — Graphify pins L${fix.declarationSpan.startLine}${
                  stored ? ` (model had L${stored.startLine})` : ''
                }`
              : `Declaration span no longer matches source — the content changed (stored L${stored?.startLine ?? '?'}).`,
            fix,
          })
          staleDeclarations++
        }
      }

      if (r.construct) {
        check.constructMatch = r.construct.match
        check.constructClaimed = r.construct.claimed
        check.constructInferred = r.construct.inferred
        if (r.construct.evidence?.length)
          check.constructEvidence = r.construct.evidence
        if (r.construct.match === true) constructsMatched++
      }
      if (r.construct?.match === null || r.code === 'construct_unconfirmed') {
        findings.push({
          kind: 'construct_unconfirmed',
          severity: 'info',
          componentAlias: c.alias,
          componentName: c.name,
          message: `Construct unclassified — claimed ${r.construct?.claimed ?? c.construct ?? '?'}; classify it from source.${
            r.construct?.evidence?.length
              ? ` (${r.construct.evidence.join('; ')})`
              : ''
          }`,
        })
      }
      if (!r.ok && r.code === 'construct_mismatch') {
        issue = true
        findings.push({
          kind: 'construct_mismatch',
          severity: 'error',
          componentAlias: c.alias,
          componentName: c.name,
          message: r.error ?? 'Construct mismatch',
        })
        constructMismatches++
        seenComponentIssue.add(c.alias)
      }

      // Store completeness — an in-memory store that declares no type, and a
      // store whose declared type may have drifted. Both are gaps (info).
      if (c.construct === 'store') {
        if (storeTypeStale(c, r.declaration?.freshness)) {
          check.storeType = 'stale'
          findings.push({
            kind: 'store_type_stale',
            severity: 'info',
            componentAlias: c.alias,
            componentName: c.name,
            message: `Store declaration moved — its declared value type may be out of date; re-read the declaration and re-propose \`declaration.valueType\` if the type changed.`,
          })
        } else {
          check.storeType = r.storeTypeUndeclared ? 'undeclared' : 'declared'
        }
      } else {
        check.storeType = 'n/a'
      }
      if (r.storeTypeUndeclared) {
        findings.push({
          kind: 'store_type_undeclared',
          severity: 'info',
          componentAlias: c.alias,
          componentName: c.name,
          message:
            'In-memory store declares no type — read the state declaration and claim `declaration.valueType` (e.g. `Map<string, FeedState>`) or name its state members.',
        })
      }

      if (r.signature) {
        if (r.signature.skipped) check.signature = 'skipped'
        else if (r.signature.augmented) {
          check.signature = 'augmented'
          signaturesMatched++
        } else if (r.signature.match) {
          check.signature = 'match'
          signaturesMatched++
        } else {
          check.signature = 'mismatch'
        }
      }
      if (r.signature?.skipped) {
        findings.push({
          kind: 'signature_unconfirmed',
          severity: 'info',
          componentAlias: c.alias,
          componentName: c.name,
          message:
            'Signature could not be confirmed automatically — claim the declared signature from source.',
        })
      }
      if (!r.ok && r.code === 'signature_mismatch') {
        issue = true
        const fix =
          r.signature != null
            ? adoptGraphifySignatureFixFromVerify(r.signature)
            : undefined
        findings.push({
          kind: 'signature_mismatch',
          severity: 'error',
          componentAlias: c.alias,
          componentName: c.name,
          message: fix
            ? `${r.error ?? 'Signature mismatch'} — model has no named types; graphify does (deterministic fill available)`
            : (r.error ?? 'Signature mismatch'),
          fix,
        })
        signatureMismatches++
        seenComponentIssue.add(c.alias)
      }

      const hasClaimedSymbol =
        typeof c.symbol === 'string' && c.symbol.trim().length > 0
      const resolution = r.anchor?.resolution
      if (r.cache?.status === 'ready' && resolution) {
        check.anchor = resolution
        if (!hasClaimedSymbol) {
          check.graphify = 'skipped'
          check.note = 'graphify anchor skipped - no symbol claimed'
        } else if (check.fileExists === false) {
          check.graphify = 'unavailable'
          check.note = r.fileSuggest
            ? `claimed file missing — Graphify has symbol at ${r.fileSuggest.file}`
            : r.fileCandidates && r.fileCandidates.length > 1
              ? `claimed file missing — Graphify has symbol at ${r.fileCandidates.map((x) => x.file).join(', ')}`
              : 'graphify anchor skipped - source file missing'
        } else if (resolution === 'exact') {
          anchorsExact++
          check.graphify = 'confirmed'
        } else {
          check.graphify = 'weak'
          const base = { componentAlias: c.alias, componentName: c.name }
          if (resolution === 'ambiguous') {
            issue = true
            findings.push({
              ...base,
              kind: 'symbol_ambiguous',
              severity: 'error',
              message: `Multiple Graphify nodes match ${c.symbol} (${r.anchor?.candidates?.length ?? 0} candidates)`,
            })
            seenComponentIssue.add(c.alias)
          } else {
            // A claimed symbol with no matching declaration is a broken claim.
            issue = true
            findings.push({
              ...base,
              kind: 'symbol_unmatched',
              severity: 'error',
              message: `No Graphify node matches symbol ${c.symbol} in ${c.file}`,
            })
            seenComponentIssue.add(c.alias)
          }
          weakAnchors++
        }
      } else if (r.cache && r.cache.status !== 'ready') {
        check.anchor = 'n/a'
        check.graphify = 'unavailable'
        check.note = `Graphify cache ${r.cache.status}`
        const purl = r.cache.purl
        if (purl && !cacheUnavailablePurls.has(purl)) {
          cacheUnavailablePurls.add(purl)
          findings.push({
            kind: 'graphify_unavailable',
            severity: 'info',
            purl,
            message: `Graphify cache ${r.cache.status} for ${purl} — build it to verify constructs and anchors`,
          })
          unresolved++
        }
      } else {
        check.graphify = 'unavailable'
      }

      check.verdict = issue ? 'issue' : 'ok'
      if (!issue && r.ok) okComponents++
      checks.push(check)
    }
    deps.disposeSpanTreeCache(treeCache)

    // --- Boundary membership: process (runtime) + module (containment) ---
    const augmentedModuleAliases = new Set<string>()
    for (const c of model.components) {
      const mod = c.module?.trim()
      if (!mod || !c.file?.trim() || !c.symbol?.trim()) continue
      const purl = c.purl?.trim()
      if (!purl || purl === 'external') continue
      const hit = await deps.findAcceptedModuleAugmentation({
        purl,
        file: c.file,
        symbol: c.symbol,
        module: mod,
      })
      if (hit) augmentedModuleAliases.add(c.alias)
    }

    const boundary = auditBoundaryFields(model.components, {
      augmentedModuleAliases,
    })

    // Process-boundary verification — read the accepted element set(s) for the
    // repos this model references. Kept per-repo for the backing check; merged
    // for the boundary read.
    const backingSets = new Map<string, readonly C4AuditElement[]>()
    for (const c of model.components) {
      const repoKey = purlRepoKey(c.purl)
      if (!repoKey || backingSets.has(repoKey)) continue
      const set = await deps.readC4Elements(repoKey)
      backingSets.set(repoKey, set.elements)
    }
    const processVerification = auditProcessVerification(
      model.components,
      [...backingSets.values()].flat(),
    )
    boundary.checks.push(...processVerification.checks)

    const backingFindings = auditProcessBacking(model.components, backingSets)
    const processFindings = dropUnbackedMissing([
      ...boundary.findings,
      ...processVerification.findings,
      ...backingFindings,
    ])
    for (const f of processFindings) {
      findings.push({
        kind: f.kind,
        severity: f.severity,
        processKey: f.processKey,
        componentAlias: f.componentAlias,
        componentName: f.componentName,
        moduleKey: f.moduleKey,
        message: f.message,
      })
    }

    // Trail step verification via call site augmentations
    let stepsVerified = 0
    let stepsUnconfirmed = 0
    let stepsStale = 0
    const componentByAlias = new Map(
      model.components.map((c) => [c.alias, c]),
    )

    for (const trail of model.trails ?? []) {
      for (let stepIndex = 0; stepIndex < trail.steps.length; stepIndex++) {
        const step = trail.steps[stepIndex]!
        const toComponent = componentByAlias.get(step.to)
        const fromComponent = componentByAlias.get(step.from)

        // A calls step's site is the caller frame, so the portable schema
        // requires it. Surface stored models from before that requirement as a
        // hard gap so the UI can drive the fix.
        if (step.mechanism === 'calls' && !step.site) {
          findings.push({
            kind: 'step_site_unconfirmed',
            severity: 'error',
            trailId: trail.id,
            step: stepIndex,
            message: `Trail "${trail.title}" step ${stepIndex + 1}: calls step has no site construct (${step.from} → ${step.to}); add the enclosing caller declaration.`,
          })
        }

        // The step's site purl determines the repo.
        const stepPurl = step.purl?.trim()
        if (!stepPurl || !isRepoPurl(stepPurl)) continue

        const repoRoot = graphifyProvider.resolveRepoRoot(stepPurl)
        if (!repoRoot) continue

        // Prefer the step's own span; fall back to the accepted call-site
        // augmentation — the capture lane that mints it.
        let span = step.span
        if (!span && toComponent?.file?.trim() && toComponent?.symbol?.trim()) {
          const aug = await deps.findAcceptedCallSiteAugmentation({
            purl: stepPurl,
            file: step.file,
            symbol: step.symbol,
            targetFile: toComponent.file,
            targetSymbol: toComponent.symbol,
            mechanism: step.mechanism,
          })
          const claim = aug?.claims.callSite
          if (claim) {
            span = {
              startLine: claim.lines.start,
              endLine: claim.lines.end,
              contentHash: claim.contentHash,
            }
          }
        }

        if (!span) {
          // No captured span — the step is unconfirmed (a gap, not a failure).
          stepsUnconfirmed++
          findings.push({
            kind: 'step_span_unconfirmed',
            severity: 'error',
            trailId: trail.id,
            step: stepIndex,
            message: `Trail "${trail.title}" step ${stepIndex + 1}: step span not captured (${step.from} → ${step.to} via ${step.mechanism})`,
          })
          continue
        }

        // `calls` claims the site lives in the source construct. Informational
        // so existing models can be reclassified without failing their audits.
        if (callsSiteOutsideFrom(step, fromComponent)) {
          const fromFile = fromComponent?.file?.trim()
          findings.push({
            kind: 'step_site_outside_from',
            severity: 'info',
            trailId: trail.id,
            step: stepIndex,
            message: `Trail "${trail.title}" step ${stepIndex + 1}: calls site is in ${step.file}${step.symbol ? ` (${step.symbol})` : ''}, outside ${step.from}${fromFile ? ` (${fromFile})` : ''}; use mechanism "uses" or model the caller and change "from".`,
          })
        }

        try {
          const content = await deps.readFile(repoRoot, step.file)
          const currentHash = hashContentRange(
            content,
            span.startLine,
            span.endLine,
          )
          if (currentHash === span.contentHash) {
            stepsVerified++
          } else {
            stepsStale++
            findings.push({
              kind: 'step_span_stale',
              severity: 'info',
              trailId: trail.id,
              step: stepIndex,
              message: `Trail "${trail.title}" step ${stepIndex + 1}: step span changed since verification (lines ${span.startLine}-${span.endLine} in ${step.file})`,
            })
          }

          // The resolved site construct is the caller/via frame. Verify it
          // independently: the range must be a real declaration, the hash
          // fresh, and the seam line inside it.
          if (step.site) {
            const site = step.site
            const siteHash = hashContentRange(
              content,
              site.span.startLine,
              site.span.endLine,
            )
            if (siteHash !== site.span.contentHash) {
              findings.push({
                kind: 'step_site_stale',
                severity: 'info',
                trailId: trail.id,
                step: stepIndex,
                message: `Trail "${trail.title}" step ${stepIndex + 1}: site construct ${site.symbol} changed since it was captured (lines ${site.span.startLine}-${site.span.endLine} in ${step.file}).`,
              })
            }
            const resolvedSite = await deps
              .enclosingDeclaration({
                repoRoot,
                file: step.file,
                line: site.span.startLine,
              })
              .catch(() => null)
            if (
              !resolvedSite ||
              resolvedSite.symbol !== site.symbol ||
              resolvedSite.startLine !== site.span.startLine ||
              resolvedSite.endLine !== site.span.endLine
            ) {
              findings.push({
                kind: 'step_site_mismatch',
                severity: 'info',
                trailId: trail.id,
                step: stepIndex,
                message: `Trail "${trail.title}" step ${stepIndex + 1}: site construct ${site.symbol} does not resolve to ${step.file}:${site.span.startLine}-${site.span.endLine}${resolvedSite ? ` (found ${resolvedSite.symbol} at ${resolvedSite.startLine}-${resolvedSite.endLine})` : ''}.`,
              })
            }
            if (
              step.span &&
              !(
                site.span.startLine <= step.span.startLine &&
                step.span.endLine <= site.span.endLine
              )
            ) {
              findings.push({
                kind: 'step_site_mismatch',
                severity: 'info',
                trailId: trail.id,
                step: stepIndex,
                message: `Trail "${trail.title}" step ${stepIndex + 1}: site construct ${site.symbol} (${site.span.startLine}-${site.span.endLine}) does not contain the seam (${step.span.startLine}-${step.span.endLine}).`,
              })
            }
          }

          // The target construct lives in its own repo/file.
          if (step.target) {
            const target = step.target
            const targetRoot = target.purl?.trim()
              ? graphifyProvider.resolveRepoRoot(target.purl)
              : null
            if (targetRoot) {
              try {
                const targetContent = await deps.readFile(targetRoot, target.file)
                if (target.span) {
                  const targetHash = hashContentRange(
                    targetContent,
                    target.span.startLine,
                    target.span.endLine,
                  )
                  if (targetHash !== target.span.contentHash) {
                    findings.push({
                      kind: 'step_target_stale',
                      severity: 'info',
                      trailId: trail.id,
                      step: stepIndex,
                      message: `Trail "${trail.title}" step ${stepIndex + 1}: target construct ${target.symbol} changed since it was captured (lines ${target.span.startLine}-${target.span.endLine} in ${target.file}).`,
                    })
                  }
                }
                const resolvedTarget = await deps.declarationForSymbol({
                  repoRoot: targetRoot,
                  file: target.file,
                  symbol: target.symbol,
                })
                if (!resolvedTarget) {
                  findings.push({
                    kind: 'step_target_mismatch',
                    severity: 'info',
                    trailId: trail.id,
                    step: stepIndex,
                    message: `Trail "${trail.title}" step ${stepIndex + 1}: target construct ${target.symbol} does not resolve in ${target.file}.`,
                  })
                } else if (
                  target.span &&
                  (resolvedTarget.startLine !== target.span.startLine ||
                    resolvedTarget.endLine !== target.span.endLine)
                ) {
                  findings.push({
                    kind: 'step_target_mismatch',
                    severity: 'info',
                    trailId: trail.id,
                    step: stepIndex,
                    message: `Trail "${trail.title}" step ${stepIndex + 1}: target construct ${target.symbol} resolves to ${resolvedTarget.startLine}-${resolvedTarget.endLine}, but the step claims ${target.span.startLine}-${target.span.endLine}.`,
                  })
                }
              } catch {
                // Target checkout/file unreadable — reported by the repo/file
                // lanes (or simply not available locally).
              }
            }
          }
        } catch {
          // File doesn't exist or can't be read — already covered by
          // mechanical checks.
          continue
        }
      }
    }

    const summary = {
      components: model.components.length,
      filesVerified,
      symbolsVerified,
      declarationsFresh,
      constructsMatched,
      signaturesMatched,
      anchorsExact,
      graphifyConfirmed: anchorsExact,
      externalsSkipped,
      missingFiles: files.missingCount,
      missingSymbols,
      trailFailures: 0,
      stepsUnconfirmed,
      stepsStale,
      stepsVerified,
      staleDeclarations,
      constructMismatches,
      signatureMismatches,
      weakAnchors,
      unresolved,
      ok: okComponents,
      modulesClaimed: boundary.summary.modulesClaimed,
      moduleFileOk: boundary.summary.moduleFileOk,
      moduleFileMismatch: boundary.summary.moduleFileMismatch,
      processNestsChecked: boundary.summary.processNestsChecked,
      processNestOk: boundary.summary.processNestOk,
      processNestDisagree: boundary.summary.processNestDisagree,
      processRequired: boundary.summary.processRequired,
      processClaimed: boundary.summary.processClaimed,
      processMissing: boundary.summary.processMissing,
    }

    const needsUpdate = findings.some((f) => f.severity === 'error')

    const report: SubsystemModelAuditReport = {
      graphId,
      title: model.title,
      checkedAt: (deps.now?.() ?? new Date()).toISOString(),
      needsUpdate,
      summary,
      checks,
      boundaryChecks: boundary.checks,
      findings,
    }

    const graphify = await graphifyProvider.readiness(model)
    const fingerprint = await buildAuditFingerprint(
      model,
      graphify,
      deps.resolveGraphifySlot,
    )
    try {
      await deps.persistReport(graphId, report, fingerprint)
    } catch (err) {
      warn(
        `[audit] failed to persist report for ${graphId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }

    // Provenance: a full pass earns the verified pin, but only against a clean
    // referenced state.
    if (classifyAuditReport(report) === 'fully_verified') {
      try {
        if (await deps.referencedFilesClean(model.components, model.trails)) {
          const commits = await deps.capturePurlCommits(model.components)
          await deps.stampVerifiedCommits(graphId, commits)
        }
      } catch (err) {
        warn(
          `[audit] failed to stamp verified commits for ${graphId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      }
    }

    return { ok: true, report, fingerprint }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

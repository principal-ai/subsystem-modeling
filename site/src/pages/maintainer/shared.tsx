import { Link } from 'react-router-dom'
import { PierreExampleCode } from '../../components/PierreExampleCode'
import {
  neighborSections,
  type MaintainerSectionId,
} from './sections'

export type CaseOutcome = 'pass' | 'issue' | 'gap' | 'neutral'

/**
 * How this check is remediable today:
 * - deterministic — Studio Apply (finding.fix) with no agent
 * - construct-fixer / construct-verifier — construct lane
 * - package-module-fixer / package-module-verifier — static topology (containment)
 * - dynamic-topology-verifier — dynamic topology (process)
 * - none — report only; human edit or not yet wired (e.g. package-layer checks)
 */
export type RemediationLane =
  | 'deterministic'
  | 'construct-fixer'
  | 'construct-verifier'
  | 'package-module-fixer'
  | 'package-module-verifier'
  | 'dynamic-topology-verifier'
  | 'none'

export type AuditCase = {
  example: string
  meaning: string
  outcome: CaseOutcome
  remediation: RemediationLane
  /** Optional model / code snippet showing a typical claim. */
  snippet?: string
}

export const VERDICTS = [
  {
    id: 'unverified',
    label: 'Unverified',
    meaning:
      'No audit has run yet — or the last report was cleared. Nothing has been checked against source or graphify.',
  },
  {
    id: 'failed',
    label: 'Verification failed',
    meaning:
      'An audit ran and at least one check failed: missing file or symbol, construct/signature mismatch, stale declaration, and similar.',
  },
  {
    id: 'partial',
    label: 'Partially verified',
    meaning:
      'An audit ran and nothing failed, but confirmation is incomplete — gaps remain (for example construct unclassified, or signature not in cache).',
  },
  {
    id: 'fully',
    label: 'Fully verified',
    meaning:
      'An audit ran. Nothing failed. Every applicable claim that could be confirmed was confirmed.',
  },
] as const

export const SOURCE_CASES: AuditCase[] = [
  {
    example: 'file found',
    meaning: 'File path exists under the component’s repo root.',
    outcome: 'pass',
    remediation: 'none',
  },
  {
    example: 'file missing (unique relocate)',
    meaning:
      'Claimed file missing; Graphify has a unique definition of the symbol at another path — Apply updates component.file.',
    outcome: 'issue',
    remediation: 'deterministic',
  },
  {
    example: 'file missing',
    meaning:
      'File path not found and Graphify cannot uniquely relocate (ambiguous paths or symbol missing). construct-fixer proposes a path.',
    outcome: 'issue',
    remediation: 'construct-fixer',
  },
  {
    example: 'no source check',
    meaning: 'External / custom entity — no file check applies.',
    outcome: 'neutral',
    remediation: 'none',
  },
]

export const GRAPHIFY_CASES: AuditCase[] = [
  {
    example: 'exact symbol match',
    meaning: 'Found the symbol’s definition in Graphify.',
    outcome: 'pass',
    remediation: 'none',
  },
  {
    example: 'no symbol match',
    meaning: 'Symbol’s definition was not in Graphify.',
    outcome: 'issue',
    remediation: 'construct-fixer',
  },
  {
    example: 'declaration line matches',
    meaning: 'Stored declaration line hash still matches the live file.',
    outcome: 'pass',
    remediation: 'none',
  },
  {
    example: 'declaration line drifted',
    meaning:
      'Declaration line moved or changed since last capture; Graphify still has an exact symbol match — Apply re-pins start line + hash.',
    outcome: 'issue',
    remediation: 'deterministic',
  },
  {
    example: 'construct matches',
    meaning:
      'Construct agrees with Graphify structure (class / function / type family).',
    outcome: 'pass',
    remediation: 'none',
  },
  {
    example: 'construct ≠ inferred',
    meaning:
      'Graphify structure implies a different construct — a weak hint. Never one-click adopt; construct-fixer judges from source.',
    outcome: 'issue',
    remediation: 'construct-fixer',
  },
  {
    example: 'construct unclassified',
    meaning:
      'Exact symbol found, but Graphify could not classify the kind (common for interfaces, type aliases, module-level values).',
    outcome: 'gap',
    remediation: 'construct-verifier',
  },
  {
    example: 'signature matches',
    meaning:
      'Params / return types match Graphify type edges (or an accepted signature augmentation).',
    outcome: 'pass',
    remediation: 'none',
  },
  {
    example: 'signature empty — Graphify has types',
    meaning:
      'Model has no named param/return types; Graphify does — Apply fills declaration bags from Graphify.',
    outcome: 'issue',
    remediation: 'deterministic',
  },
  {
    example: 'signature mismatch',
    meaning:
      'Params / return types differ from Graphify while the model already has types. Never auto-adopt; construct-fixer trusts source.',
    outcome: 'issue',
    remediation: 'construct-fixer',
  },
  {
    example: 'signature not in cache',
    meaning: 'No usable signature edges in Graphify for this function/method.',
    outcome: 'gap',
    remediation: 'construct-verifier',
  },
  {
    example: 'cache unavailable',
    meaning:
      'Graphify could not be ensured for this repo — symbol / construct / signature checks could not run.',
    outcome: 'gap',
    remediation: 'none',
  },
  {
    example: 'skipped',
    meaning: 'Graphify anchoring not applicable (external, no symbol, etc.).',
    outcome: 'neutral',
    remediation: 'none',
  },
]

/**
 * Package-layer cache checks — repo/package identity from component `purl`,
 * corroborated by codebase-composition discovery (Studio Package Layers tab).
 * Cache + ensure are shipped; audit soft checks are the next Maintain wire-up.
 * Package frames are presentation on top of purl (multi-repo only by default).
 */
export const PACKAGE_LAYER_CASES: AuditCase[] = [
  {
    example: 'package cache ready',
    meaning:
      'Package-layers slot exists for this component’s purl at the current HEAD(+dirty) — same freshness bar as Graphify. Studio Package Layers tab Ensure builds it via codebase-composition.',
    outcome: 'pass',
    remediation: 'none',
  },
  {
    example: 'purl matches discovery',
    meaning:
      'Component purl repo key resolves to a package discovered under that checkout (manifest-bounded path). Confirms the repo/package identity used for multi-repo frames.',
    outcome: 'pass',
    remediation: 'none',
    snippet: `{
  "id": "dispatch",
  "construct": "function",
  "symbol": "dispatch",
  "file": "src/host/main.ts",
  "purl": "pkg:github/acme/app"
}
// package-layers cache lists pkg:npm/@acme/app (or github purl) for this tree`,
  },
  {
    example: 'cache unavailable',
    meaning:
      'No package-layers cache for this purl at current HEAD(+dirty). Unconfirmed — do not hard-fail construct checks; Ensure from the Package Layers tab (or Maintain ensure step) then re-audit. Planned.',
    outcome: 'gap',
    remediation: 'none',
  },
  {
    example: 'purl unknown to discovery',
    meaning:
      'Cache is ready but no discovered package matches this purl (typo, wrong ecosystem, or stale model). Unconfirmed until an agent proposes a corrected purl; human confirms. Planned.',
    outcome: 'gap',
    remediation: 'construct-verifier',
    snippet: `{
  "purl": "pkg:github/acme/wrong-name"  // ← not in package-layers for this checkout
}`,
  },
  {
    example: 'multi-repo framing ready',
    meaning:
      'Graph has 2+ distinct repo purls and each has a current package-layers (or at least a resolvable purl). Package frames can draw. Single-repo graphs skip package frames by design.',
    outcome: 'pass',
    remediation: 'none',
  },
  {
    example: 'skipped',
    meaning:
      'External / custom entity / proposed — no package-layer identity check. Workspace-package frames inside a single-repo monorepo are out of scope for framing (cache still useful for agents).',
    outcome: 'neutral',
    remediation: 'none',
  },
]

type AgentTag = {
  tag: string
  meaning: string
  outcome: Extract<CaseOutcome, 'issue' | 'gap'>
}

type AgentRemediation = {
  tag: string
  meaning: string
}

export type MaintenanceAgent = {
  id:
    | 'construct-fixer'
    | 'construct-verifier'
    | 'package-module-fixer'
    | 'package-module-verifier'
    | 'dynamic-topology-verifier'
  name: string
  runsOn: string
  summary: string
  reviews: AgentTag[]
  remediations: AgentRemediation[]
}

export const MAINTENANCE_AGENTS: MaintenanceAgent[] = [
  {
    id: 'construct-fixer',
    name: 'construct-fixer',
    runsOn: 'Verification failed',
    summary:
      'Hard failures only — cases whose Remediation lane is construct-fixer. Investigates source, proposes field corrections; you confirm in Studio. Ignores gaps. Graphify inferred construct/signature is a hint — never auto-adopted.',
    reviews: [
      {
        tag: 'file missing (ambiguous relocate)',
        meaning:
          'Claimed file missing and Graphify has the symbol in multiple paths — pick which definition belongs in the model.',
        outcome: 'issue',
      },
      {
        tag: 'file missing',
        meaning:
          'File path not found and Graphify could not uniquely relocate the symbol (missing entirely).',
        outcome: 'issue',
      },
      {
        tag: 'no symbol match',
        meaning: 'Symbol’s definition was not in Graphify.',
        outcome: 'issue',
      },
      {
        tag: 'construct ≠ inferred',
        meaning:
          'Graphify structure implies a different construct. Needs source judgment — inferred is a weak hint, not ground truth.',
        outcome: 'issue',
      },
      {
        tag: 'signature mismatch',
        meaning:
          'Params / return types differ from Graphify. Same judgment rule: trust source; do not auto-adopt Graphify bags when the model already has types.',
        outcome: 'issue',
      },
    ],
    remediations: [
      {
        tag: 'file path chosen',
        meaning:
          'Propose component.file to one of the Graphify candidates (or a path found in the repo). Next audit checks that file.',
      },
      {
        tag: 'construct updated from source',
        meaning:
          'Only when source shows the model claim is wrong — propose component.construct. If the claim is intentional or Graphify is thin, skip.',
      },
      {
        tag: 'symbol / file identity fixed',
        meaning:
          'Propose corrected component.symbol or component.file when the mismatch is really pointing at the wrong declaration.',
      },
    ],
  },
  {
    id: 'construct-verifier',
    name: 'construct-verifier',
    runsOn: 'Partially verified',
    summary:
      'Confirmation holes only — cases whose Remediation lane is construct-verifier. Reads source and proposes fills (often augmentations); you confirm in Studio. Does not chase hard failures.',
    reviews: [
      {
        tag: 'construct unclassified',
        meaning:
          'Exact symbol found, but Graphify could not classify the kind (common for interfaces, type aliases, and module-level values).',
        outcome: 'gap',
      },
      {
        tag: 'signature not in cache',
        meaning:
          'No usable signature edges in Graphify for this function/method.',
        outcome: 'gap',
      },
    ],
    remediations: [
      {
        tag: 'construct confirmed (augmented)',
        meaning:
          'Propose an augmentation that confirms construct for file#symbol. Accept writes the augmentation store — next audit treats it as confirmed.',
      },
      {
        tag: 'signature confirmed (augmented)',
        meaning:
          'Propose named param/return type bags from source. Accept writes the augmentation store — next audit treats the signature as confirmed.',
      },
    ],
  },
]

/**
 * Package (purl / discovery) + module (source-file) membership — finer grains
 * of the same idea. Package frames from multi-repo purls; module frames from
 * shared source paths. Not runtime boundary (that is process).
 */
export const MODULE_MEMBERSHIP_CASES: AuditCase[] = [
  {
    example: 'module matches file',
    meaning:
      'component.module is the source-file membership key — a finer package grain. Usually equals file (or a path prefix). Consistent membership → multi-member modules can draw a frame.',
    outcome: 'pass',
    remediation: 'none',
    snippet: `{
  "id": "parse",
  "construct": "function",
  "symbol": "parseTranscript",
  "file": "src/session/transcript.ts",
  "module": "src/session/transcript.ts",
  "purl": "pkg:github/acme/app"
}`,
  },
  {
    example: 'module ≠ file',
    meaning:
      'module is set but does not match file (and is not a sensible parent path). Unconfirmed (boundary_module_file_mismatch). package-module-verifier proposes a module augmentation when intentional, or sets module to the file when it was a slip.',
    outcome: 'gap',
    remediation: 'package-module-verifier',
    snippet: `{
  "file": "src/session/transcript.ts",
  "module": "src/session/paths.ts"  // ← different file
}`,
  },
  {
    example: 'module without file',
    meaning:
      'module is set but file is empty on a non-external, non-proposed node. Audit issue (boundary_module_without_file). package-module-fixer proposes file and/or clears module.',
    outcome: 'issue',
    remediation: 'package-module-fixer',
    snippet: `{
  "construct": "function",
  "symbol": "boot",
  "file": "",
  "module": "src/host/main.ts"  // ← membership with no file anchor
}`,
  },
]

/**
 * Runtime process boundary — deployment-unit membership. Orthogonal to
 * package/module (source identity). Nesting: package → process → module → leaf.
 */
export const PROCESS_BOUNDARY_CASES: AuditCase[] = [
  {
    example: 'process nest agrees',
    meaning:
      'Every member of a multi-member module shares the same process → module frame nests inside that process (package → process → module → export when multi-repo).',
    outcome: 'pass',
    remediation: 'none',
    snippet: `// both exports:
{ "module": "src/host/main.ts", "process": "principal-studio/host" }
{ "module": "src/host/main.ts", "process": "principal-studio/host" }
// → module frame under process principal-studio/host`,
  },
  {
    example: 'process nest disagrees',
    meaning:
      'Members of the same module claim different process values. Unconfirmed (boundary_process_nest_disagree). dynamic-topology-verifier aligns process (or clears it).',
    outcome: 'gap',
    remediation: 'dynamic-topology-verifier',
    snippet: `{ "id": "boot",  "module": "src/host/main.ts", "process": "host" }
{ "id": "create", "module": "src/host/main.ts", "process": "renderer" }
// ← same module, two processes`,
  },
]

export const MODULE_MEMBERSHIP_AGENTS: MaintenanceAgent[] = [
  {
    id: 'package-module-fixer',
    name: 'package-module-fixer',
    runsOn: 'Module membership issues (after construct issues are clear)',
    summary:
      'Hard containment failures only — module without file. Static topology (package/module), not process. Proposes file/module corrections; you confirm.',
    reviews: [
      {
        tag: 'module without file',
        meaning:
          'module set on a grounded component with empty file — nowhere to ground the source-file frame.',
        outcome: 'issue',
      },
    ],
    remediations: [
      {
        tag: 'file filled',
        meaning: 'Propose component.file when the module path is the real source file.',
      },
      {
        tag: 'module cleared',
        meaning: 'Clear module when the membership claim was a mistake.',
      },
    ],
  },
  {
    id: 'package-module-verifier',
    name: 'package-module-verifier',
    runsOn: 'Module membership unconfirmed',
    summary:
      'Module containment unconfirmed (module≠file): prefer module augmentation when intentional; set module to file when it was a slip. Static topology (containment), not process.',
    reviews: [
      {
        tag: 'module ≠ file',
        meaning: 'Source-file membership key does not match file / path prefix.',
        outcome: 'gap',
      },
    ],
    remediations: [
      {
        tag: 'module confirmed (augmented)',
        meaning:
          'Propose an augmentation confirming the claimed module. Accept writes the augmentation store — next audit treats it as confirmed.',
      },
      {
        tag: 'module corrected',
        meaning: 'Set module to file (or a sensible path prefix).',
      },
    ],
  },
]

export const PROCESS_BOUNDARY_AGENTS: MaintenanceAgent[] = [
  {
    id: 'dynamic-topology-verifier',
    name: 'dynamic-topology-verifier',
    runsOn: 'Process nest unconfirmed',
    summary:
      'When multi-member module members disagree on process, align or clear process so nesting stays coherent. Dynamic topology (process).',
    reviews: [
      {
        tag: 'process nest disagrees',
        meaning: 'Same module, different process values.',
        outcome: 'gap',
      },
    ],
    remediations: [
      {
        tag: 'process aligned',
        meaning: 'Propose a shared process (or clear process) across module members.',
      },
    ],
  },
]

export const WALKTHROUGH_MECHANICAL_CASES: AuditCase[] = [
  {
    example: 'site drifted',
    meaning:
      'Step file:line moved, shifted, or was deleted. Often surfaces as out-of-range, blank line, or missing file — same family as declaration drift, but per hop.',
    outcome: 'issue',
    remediation: 'none',
  },
  {
    example: 'broken hop endpoints',
    meaning:
      'Step from/to names a component that was deleted or renamed. Can appear after nodes change without updating walkthroughs. Display edges for hops are derived — they stand on their own.',
    outcome: 'issue',
    remediation: 'none',
  },
  {
    example: 'missing / out-of-range site',
    meaning:
      'Step file is gone under the repo root, or line is past EOF (or blank). Reported by create/update file verification.',
    outcome: 'issue',
    remediation: 'none',
  },
]

export type CatalogEntry = {
  label: string
  meaning: string
  /** Short TypeScript-ish snippet showing a typical site / claim. */
  example: string
}

/**
 * Walkthrough hop `mechanism` catalogue — runtime seams with a file:line
 * site. Topology labels do not belong on hops.
 */
export const WALKTHROUGH_MECHANISM_CATALOG: CatalogEntry[] = [
  {
    label: 'calls',
    meaning:
      'from invokes to — a function/method call, RPC dispatch, or similar request/response hop.',
    example: `async function saveSession(id: string) {
  await writeSession(id)  // ← site: SessionApi calls WriteSession
}`,
  },
  {
    label: 'uses',
    meaning:
      'General dependency: from relies on to without a more specific verb. Prefer a tighter mechanism when one fits.',
    example: `function buildReport(rows: Row[]) {
  return formatTable(rows)  // ← site: ReportBuilder uses FormatTable
}`,
  },
  {
    label: 'writes',
    meaning: 'from mutates retained state held by to (store, registry, cache).',
    example: `function subscribe(listener: Listener) {
  listeners.add(listener)  // ← site: subscribe writes ListenerSet
}`,
  },
  {
    label: 'reads',
    meaning: 'from reads retained state held by to.',
    example: `function listOpen() {
  return [...openTabs]  // ← site: listOpen reads OpenTabStore
}`,
  },
  {
    label: 'watches',
    meaning:
      'from observes to for changes (listener attached, reactive subscription).',
    example: `useEffect(() => {
  return store.subscribe(onChange)  // ← site: Panel watches SessionStore
}, [])`,
  },
  {
    label: 'registers-into',
    meaning:
      'from registers itself (or a callback) into a fan-out bag owned by to.',
    example: `function mountPlugin(plugin: Plugin) {
  registry.register(plugin)  // ← site: Plugin registers-into PluginRegistry
}`,
  },
  {
    label: 'feeds',
    meaning:
      'Data-flow handoff: from pushes input into to (pipeline stage, queue put).',
    example: `async function onUpload(file: File) {
  await pipeline.enqueue(file)  // ← site: UploadHandler feeds IngestPipeline
}`,
  },
  {
    label: 'produces',
    meaning: 'from emits an output that to consumes (event, message, result).',
    example: `function finish(job: Job) {
  bus.emit("job.done", job)  // ← site: Worker produces JobBus
}`,
  },
]

const OUTCOME_LABEL: Record<CaseOutcome, string> = {
  pass: 'Pass',
  issue: 'Issue',
  gap: 'Unconfirmed',
  neutral: 'N/A',
}

const REMEDIATION_LABEL: Record<RemediationLane, string> = {
  deterministic: 'Apply',
  'construct-fixer': 'construct-fixer',
  'construct-verifier': 'construct-verifier',
  'package-module-fixer': 'package-module-fixer',
  'package-module-verifier': 'package-module-verifier',
  'dynamic-topology-verifier': 'dynamic-topology-verifier',
  none: '—',
}

export function CaseTable({ cases }: { cases: AuditCase[] }) {
  return (
    <div className="maintainer-table-wrap">
      <table className="maintainer-table">
        <thead>
          <tr>
            <th scope="col">Check</th>
            <th scope="col">Means</th>
            <th scope="col">Outcome</th>
            <th scope="col">Remediation</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => (
            <tr key={c.example}>
              <td>
                <span className={`maintainer-pill maintainer-pill--${c.outcome}`}>
                  {c.example}
                </span>
              </td>
              <td>
                <p className="maintainer-case-meaning">{c.meaning}</p>
                {c.snippet ? (
                  <PierreExampleCode
                    code={c.snippet}
                    fileName={`${c.example.replace(/\s+/g, '-')}.json`}
                  />
                ) : null}
              </td>
              <td>
                <span className={`maintainer-outcome maintainer-outcome--${c.outcome}`}>
                  {OUTCOME_LABEL[c.outcome]}
                </span>
              </td>
              <td>
                <span
                  className={`maintainer-remediation maintainer-remediation--${c.remediation}`}
                >
                  {REMEDIATION_LABEL[c.remediation]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AgentCard({ agent }: { agent: MaintenanceAgent }) {
  const tone = agent.id.endsWith('-fixer') ? 'failed' : 'partial'
  return (
    <article className={`maintainer-agent maintainer-agent--${tone}`}>
      <header className="maintainer-agent-header">
        <div className="maintainer-agent-title-row">
          <h3 className="maintainer-agent-name">{agent.name}</h3>
          <span className="maintainer-agent-runs">Runs on {agent.runsOn}</span>
        </div>
        <p className="maintainer-agent-summary">{agent.summary}</p>
      </header>

      <div className="maintainer-agent-block">
        <h4 className="maintainer-agent-block-label">Reviews</h4>
        <div className="maintainer-table-wrap">
          <table className="maintainer-table">
            <thead>
              <tr>
                <th scope="col">Tag</th>
                <th scope="col">Means</th>
                <th scope="col">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {agent.reviews.map((r) => (
                <tr key={r.tag}>
                  <td>
                    <span
                      className={`maintainer-pill maintainer-pill--${r.outcome}`}
                    >
                      {r.tag}
                    </span>
                  </td>
                  <td>{r.meaning}</td>
                  <td>
                    <span
                      className={`maintainer-outcome maintainer-outcome--${r.outcome}`}
                    >
                      {OUTCOME_LABEL[r.outcome]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="maintainer-agent-block">
        <h4 className="maintainer-agent-block-label">Remediations</h4>
        <div className="maintainer-table-wrap">
          <table className="maintainer-table">
            <thead>
              <tr>
                <th scope="col">After you confirm</th>
                <th scope="col">Means</th>
              </tr>
            </thead>
            <tbody>
              {agent.remediations.map((r) => (
                <tr key={r.tag}>
                  <td>
                    <span className="maintainer-pill maintainer-pill--pass">
                      {r.tag}
                    </span>
                  </td>
                  <td>{r.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </article>
  )
}

export function LabelCatalog({ entries }: { entries: CatalogEntry[] }) {
  return (
    <div className="maintainer-mechanisms">
      {entries.map((e) => (
        <article key={e.label} className="maintainer-mechanism">
          <h4 className="maintainer-mechanism-name">
            <code>{e.label}</code>
          </h4>
          <p className="maintainer-mechanism-meaning">{e.meaning}</p>
          <PierreExampleCode
            code={e.example}
            fileName={`${e.label.replace(/\s+/g, '-').replace(/\//g, '-')}.ts`}
          />
        </article>
      ))}
    </div>
  )
}

export function SectionPager({ sectionId }: { sectionId: MaintainerSectionId }) {
  const { prev, next } = neighborSections(sectionId)
  return (
    <nav className="maintainer-pager" aria-label="Section">
      {prev ? (
        <Link className="maintainer-pager-link maintainer-pager-link--prev" to={prev.path}>
          <span className="maintainer-pager-dir">Previous</span>
          <span className="maintainer-pager-label">{prev.label}</span>
        </Link>
      ) : (
        <span className="maintainer-pager-link maintainer-pager-link--disabled" />
      )}
      {next ? (
        <Link className="maintainer-pager-link maintainer-pager-link--next" to={next.path}>
          <span className="maintainer-pager-dir">Next</span>
          <span className="maintainer-pager-label">{next.label}</span>
        </Link>
      ) : (
        <span className="maintainer-pager-link maintainer-pager-link--disabled" />
      )}
    </nav>
  )
}


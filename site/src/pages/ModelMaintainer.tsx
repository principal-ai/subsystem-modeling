import { Link } from 'react-router-dom'
import { PierreExampleCode } from '../components/PierreExampleCode'

type CaseOutcome = 'pass' | 'issue' | 'gap' | 'neutral'

type AuditCase = {
  example: string
  meaning: string
  outcome: CaseOutcome
}

const VERDICTS = [
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

const SOURCE_CASES: AuditCase[] = [
  {
    example: 'file found',
    meaning: 'File path exists under the component’s repo root.',
    outcome: 'pass',
  },
  {
    example: 'file missing',
    meaning: 'File path was not found in the repo.',
    outcome: 'issue',
  },
  {
    example: 'no source check',
    meaning: 'External / custom entity — no file check applies.',
    outcome: 'neutral',
  },
]

const GRAPHIFY_CASES: AuditCase[] = [
  {
    example: 'exact symbol match',
    meaning: 'Found the symbol’s definition in Graphify.',
    outcome: 'pass',
  },
  {
    example: 'no symbol match',
    meaning: 'Symbol’s definition was not in Graphify.',
    outcome: 'issue',
  },
  {
    example: 'declaration line matches',
    meaning: 'Stored declaration line hash still matches the live file.',
    outcome: 'pass',
  },
  {
    example: 'declaration line drifted',
    meaning:
      'Declaration line moved or changed since last capture — Apply re-pins from Graphify when the symbol still matches exactly.',
    outcome: 'issue',
  },
  {
    example: 'construct matches',
    meaning:
      'Construct agrees with Graphify structure (class / function / type family).',
    outcome: 'pass',
  },
  {
    example: 'construct ≠ inferred',
    meaning:
      'Graphify structure implies a different construct — a weak hint. issue-fixer judges from source; never one-click adopt.',
    outcome: 'issue',
  },
  {
    example: 'signature matches',
    meaning:
      'Params / return types match Graphify type edges (or an accepted signature augmentation).',
    outcome: 'pass',
  },
  {
    example: 'signature mismatch',
    meaning: 'Params / return types differ from Graphify.',
    outcome: 'issue',
  },
  {
    example: 'cache unavailable',
    meaning:
      'Graphify could not be ensured for this repo — symbol / construct / signature checks could not run.',
    outcome: 'gap',
  },
  {
    example: 'skipped',
    meaning: 'Graphify anchoring not applicable (external, no symbol, etc.).',
    outcome: 'neutral',
  },
]

/** One-click remediations offered from Graphify when the audit can fix without an agent. */
const GRAPHIFY_REMEDIATION_CASES: AuditCase[] = [
  {
    example: 'file path updated from Graphify',
    meaning:
      'Claimed file was missing; Graphify had a unique symbol definition at another path — applied without an agent.',
    outcome: 'pass',
  },
  {
    example: 'declaration re-pinned from Graphify',
    meaning:
      'Declaration line drifted; Graphify still has an exact symbol match — re-pin start line + hash from Graphify’s source location.',
    outcome: 'pass',
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

type MaintenanceAgent = {
  id: 'issue-fixer' | 'gap-filler'
  name: string
  runsOn: string
  summary: string
  reviews: AgentTag[]
  remediations: AgentRemediation[]
}

const MAINTENANCE_AGENTS: MaintenanceAgent[] = [
  {
    id: 'issue-fixer',
    name: 'issue-fixer',
    runsOn: 'Verification failed',
    summary:
      'Hard failures only. Investigates source, proposes field corrections; you confirm in Studio. Ignores gaps. Graphify inferred construct/signature is a hint — never auto-adopted.',
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
    id: 'gap-filler',
    name: 'gap-filler',
    runsOn: 'Partially verified',
    summary:
      'Confirmation holes only. Reads source and proposes fills (often augmentations); you confirm in Studio. Does not chase hard failures.',
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

const TOPOLOGY_MECHANICAL_CASES: AuditCase[] = [
  {
    example: 'endpoints present',
    meaning: 'Relation from/to both resolve to components in the model.',
    outcome: 'pass',
  },
  {
    example: 'broken relation endpoints',
    meaning:
      'from or to names a component that was deleted or renamed. Can appear after nodes change without updating relations.',
    outcome: 'issue',
  },
  {
    example: 'unknown relationType',
    meaning:
      'Label is outside the closed relationType vocabulary. Rejected on create/update; should not appear on stored models.',
    outcome: 'issue',
  },
  {
    example: 'Graphify soft corroboration',
    meaning:
      'Optional later: imports / similar module edges soft-checked against Graphify. Never a hard fail — judgment stays with Maintain.',
    outcome: 'gap',
  },
]

const WALKTHROUGH_MECHANICAL_CASES: AuditCase[] = [
  {
    example: 'site drifted',
    meaning:
      'Step file:line moved, shifted, or was deleted. Often surfaces as out-of-range, blank line, or missing file — same family as declaration drift, but per hop.',
    outcome: 'issue',
  },
  {
    example: 'broken hop endpoints',
    meaning:
      'Step from/to names a component that was deleted or renamed. Can appear after nodes change without updating walkthroughs. Display edges for hops are derived — they do not depend on topology relations.',
    outcome: 'issue',
  },
  {
    example: 'missing / out-of-range site',
    meaning:
      'Step file is gone under the repo root, or line is past EOF (or blank). Reported by create/update file verification.',
    outcome: 'issue',
  },
]

type CatalogEntry = {
  label: string
  meaning: string
  /** Short TypeScript-ish snippet showing a typical site / claim. */
  example: string
}

/**
 * Topology `relationType` catalogue — structural / module / type claims on
 * relations[]. No file:line site required.
 */
const RELATION_TYPE_CATALOG: CatalogEntry[] = [
  {
    label: 'imports',
    meaning:
      'Module boundary: from depends on to — often an external library or package modeled as a node.',
    example: `import { ReactFlow, useNodesState } from "@xyflow/react"
// ← SubsystemComponentNode imports @xyflow/react`,
  },
  {
    label: 'method',
    meaning: 'from is a class (or owner) and to is one of its methods as a separate node.',
    example: `class SessionStore {
  write(id: string) { … }
}`,
  },
  {
    label: 'contains',
    meaning:
      'Structural ownership / nesting: to is part of from’s composition (shell owns a panel, view owns a child surface) — not a method membership edge.',
    example: `function WorkspaceShell() {
  return (
    <>
      <DrawingsLeftPanel />
      <DrawingTabContent />
    </>
  )
}
// ← WorkspaceShell contains DrawingsLeftPanel, DrawingTabContent`,
  },
  {
    label: 'extends / inherits',
    meaning: 'Inheritance: from extends or inherits from to.',
    example: `class FileSessionStore extends SessionStore {
  …
}`,
  },
  {
    label: 'implements',
    meaning: 'from implements interface to.',
    example: `class FileSessionStore implements SessionStore {
  …
}`,
  },
  {
    label: 'mixes_in',
    meaning: 'from mixes in behavior from to.',
    example: `class Panel {
  … // mixes in Disposable
}`,
  },
  {
    label: 'references',
    meaning:
      'Type or symbol reference that is not a call — annotation, cast, or name mention.',
    example: `function open(id: SessionId) {
  …
}`,
  },
]

/**
 * Walkthrough hop `mechanism` catalogue — runtime seams with a file:line
 * site. Topology relationType labels do not belong on hops.
 */
const WALKTHROUGH_MECHANISM_CATALOG: CatalogEntry[] = [
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
  gap: 'Gap',
  neutral: 'N/A',
}

function CaseTable({ cases }: { cases: AuditCase[] }) {
  return (
    <div className="maintainer-table-wrap">
      <table className="maintainer-table">
        <thead>
          <tr>
            <th scope="col">Check</th>
            <th scope="col">Means</th>
            <th scope="col">Outcome</th>
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
              <td>{c.meaning}</td>
              <td>
                <span className={`maintainer-outcome maintainer-outcome--${c.outcome}`}>
                  {OUTCOME_LABEL[c.outcome]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AgentCard({ agent }: { agent: MaintenanceAgent }) {
  const tone = agent.id === 'issue-fixer' ? 'failed' : 'partial'
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

function LabelCatalog({ entries }: { entries: CatalogEntry[] }) {
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

export function ModelMaintainer() {
  return (
    <section className="maintainer-page">
      <header className="maintainer-header">
        <p className="maintainer-eyebrow">Principal AI</p>
        <h1>Model Maintainer</h1>
        <p>
          Subsystem Models drift as code changes. A model maintainer periodically
          audits claims against source and graphify — without rewriting the
          diagram — so you can see what still holds, what failed, and what is
          only partially confirmed.
        </p>
      </header>

      <ol className="maintainer-loop">
        <li>
          <strong>Author</strong>
          <span>
            A model claims constructs (nodes), optional topology relations, and
            walkthroughs (ordered runtime hops with file:line sites).
          </span>
        </li>
        <li>
          <strong>Audit</strong>
          <span>
            Three layers: construct → topology → walkthrough. Only construct
            runs in Studio audit today.
          </span>
        </li>
        <li>
          <strong>Verdict</strong>
          <span>
            Construct layer today: unverified → verification failed → partially
            verified → fully verified.
          </span>
        </li>
        <li>
          <strong>Maintain</strong>
          <span>
            Construct layer: <em>issue-fixer</em> / <em>gap-filler</em>.
            Topology and walkthrough Maintain are later, separate passes.
          </span>
        </li>
      </ol>

      <section className="maintainer-section">
        <h2>Verdicts</h2>
        <p className="maintainer-lede">
          From not checked yet to fully confirmed. Only the three audited
          states mean checks actually ran — <em>unverified</em> means no
          verification has happened. These verdicts are the{' '}
          <em>construct</em> layer today; topology and walkthrough get their
          own status later.
        </p>
        <ul className="maintainer-verdicts">
          {VERDICTS.map((v) => (
            <li key={v.id} className={`maintainer-verdict maintainer-verdict--${v.id}`}>
              <span className="maintainer-verdict-label">{v.label}</span>
              <p>{v.meaning}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="maintainer-section">
        <h2>Issue vs gap</h2>
        <div className="maintainer-split">
          <div>
            <h3>Issue</h3>
            <p>
              A check failed. The model claim disagrees with what we can see in
              source or in the graphify cache. Counts toward{' '}
              <em>verification failed</em>. Studio Maintain runs{' '}
              <strong>issue-fixer</strong>.
            </p>
          </div>
          <div>
            <h3>Gap</h3>
            <p>
              Nothing failed, but we could not fully confirm a claim. Counts
              toward <em>partially verified</em>. Studio Maintain runs{' '}
              <strong>gap-filler</strong> — judgment proposals, not automatic
              rewrites.
            </p>
          </div>
        </div>
      </section>

      <section className="maintainer-section maintainer-layer">
        <p className="maintainer-layer-label">Layer 1</p>
        <h2>Construct verification</h2>
        <p className="maintainer-lede">
          Per component: does this node’s file, symbol, kind, and signature
          still hold? Evidence from the repo and Graphify. Shipped in Studio
          audit today.
        </p>

        <h3 className="maintainer-subhead">Source checks</h3>
        <p className="maintainer-lede">
          Ensures each construct’s defining file path exists in the repo.
        </p>
        <CaseTable cases={SOURCE_CASES} />

        <h3 className="maintainer-subhead">Graphify checks</h3>
        <p className="maintainer-lede">
          We leverage Graphify for a preliminary check on construct existence,
          location, classification, and signature when it can provide them.
        </p>
        <CaseTable cases={GRAPHIFY_CASES} />

        <h3 className="maintainer-subhead">Graphify remediation</h3>
        <p className="maintainer-lede">
          When Graphify can resolve an issue uniquely, audit offers a one-click
          fix — no Maintenance Agent required.
        </p>
        <CaseTable cases={GRAPHIFY_REMEDIATION_CASES} />

        <h3 className="maintainer-subhead">Maintenance Agents</h3>
        <p className="maintainer-lede">
          One list action; the host re-audits and picks the agent. Issues always
          win over gaps — fix failures first, then fill gaps on a later run.
          Each agent owns a fixed set of audit tags and proposes remediations
          for you to confirm.
        </p>
        <div className="maintainer-agents">
          {MAINTENANCE_AGENTS.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      </section>

      <section className="maintainer-section maintainer-layer">
        <p className="maintainer-layer-label">Layer 2</p>
        <h2>Topology verification</h2>
        <p className="maintainer-lede">
          Per relation: does this structural / module / type claim still hold?
          Relations use <em>relationType</em>. No runtime <em>file:line</em>{' '}
          site — that belongs on walkthrough hops. Studio <em>audit</em> does
          not run this layer yet; create/update rejects unknown relation types.
        </p>

        <h3 className="maintainer-subhead">Relation types</h3>
        <p className="maintainer-lede">
          Closed vocabulary on each <em>relations[]</em> item.
        </p>
        <LabelCatalog entries={RELATION_TYPE_CATALOG} />

        <h3 className="maintainer-subhead">Mechanical checks</h3>
        <p className="maintainer-lede">
          Planned endpoint and vocabulary integrity. Soft Graphify corroboration
          for module edges is optional later — never a hard fail.
        </p>
        <CaseTable cases={TOPOLOGY_MECHANICAL_CASES} />
      </section>

      <section className="maintainer-section maintainer-layer">
        <p className="maintainer-layer-label">Layer 3</p>
        <h2>Walkthrough verification</h2>
        <p className="maintainer-lede">
          Per flow: does this ordered story still fire at these{' '}
          <em>file:line</em> seams? Each hop carries its own{' '}
          <em>mechanism</em>; the graph edge for that hop is derived.
          Cross-hop evidence is weaker than construct checks. Studio{' '}
          <em>audit</em> does not run this layer yet; create/update file
          verification does for mechanical site integrity.
        </p>

        <h3 className="maintainer-subhead">Hop mechanisms</h3>
        <p className="maintainer-lede">
          Closed vocabulary on each walkthrough step. The step’s{' '}
          <em>file:line</em> should be the concrete site of that runtime seam
          for this flow.
        </p>
        <LabelCatalog entries={WALKTHROUGH_MECHANISM_CATALOG} />

        <h3 className="maintainer-subhead">Mechanical checks</h3>
        <p className="maintainer-lede">
          Site and endpoint integrity — independent of mechanism. Text affinity
          (substring token match) is not part of this catalogue; whether the
          site is the right seam for the story belongs with the agent.
          Story-level issues (wrong order, missing hops) come later.
        </p>
        <CaseTable cases={WALKTHROUGH_MECHANICAL_CASES} />

        <h3 className="maintainer-subhead">How to inspect</h3>
        <p className="maintainer-lede">
          On create/update, the host runs walkthrough site checks and writes{' '}
          <em>verification.walkthroughsFailed</em> on the stored model. Read
          them with <em>subsystem-model get &lt;id&gt;</em>. Deterministic{' '}
          <em>subsystem-model audit</em> is construct-only today.
        </p>
      </section>

      <p className="maintainer-next">
        <Link to="/schema">Schema</Link>
        {' · '}
        <Link to="/start">Try it</Link>
        {' · '}
        <Link to="/about">Mission</Link>
      </p>
    </section>
  )
}


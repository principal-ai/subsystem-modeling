import { useSearchParams } from 'react-router-dom'
import '@xyflow/react/dist/style.css'
import { ThemeProvider, defaultEditorTheme, useTheme } from '@principal-ade/industry-theme'
import { SubsystemComponentGraph } from '@principal-ai/subsystems-react/dist/subsystem/SubsystemComponentGraph.js'
import {
  ISSUE_FIX_EXAMPLES,
  type IssueFixExample,
  type IssueFixModel,
} from '../showcase/issueFixes'
import { PierreExampleCode } from './PierreExampleCode'

const TRAIL_STEP_MS = 3_200

const REMEDIATION_LABEL: Record<IssueFixExample['remediation'], string> = {
  deterministic: 'Apply',
  'construct-fixer': 'construct-fixer',
  'package-module-fixer': 'package-module-fixer',
  none: 'report only',
}

function GraphPane({
  model,
  graph,
  side,
  exampleId,
}: {
  model: IssueFixModel
  graph: IssueFixExample['graph']
  side: 'issue' | 'fix'
  exampleId: string
}) {
  return (
    <div className="issue-fix-graph">
      <SubsystemComponentGraph
        key={`${exampleId}-${side}`}
        components={model.components}
        trails={model.trails}
        title={model.title}
        hideSidebar
        showEdgeLabels={graph.showEdgeLabels}
        edgeView={graph.edgeView}
        autoPlayTrails={graph.autoPlayTrails}
        trailAutoPlayIntervalMs={TRAIL_STEP_MS}
        trailStepMode="dim"
        zoomOnTrailFocus={false}
        showTrailTitle={graph.autoPlayTrails}
        maxNodeWidth={240}
      />
    </div>
  )
}

function ComparisonPane({
  tone,
  label,
  caption,
  snippet,
  model,
  graph,
  exampleId,
}: {
  tone: 'issue' | 'fix'
  label: string
  caption: string
  snippet: string
  model: IssueFixModel
  graph: IssueFixExample['graph']
  exampleId: string
}) {
  return (
    <article className={`issue-fix-pane issue-fix-pane--${tone}`}>
      <header className="issue-fix-pane-header">
        <span className={`maintainer-pill maintainer-pill--${tone === 'issue' ? 'issue' : 'pass'}`}>
          {label}
        </span>
        <p className="issue-fix-pane-caption">{caption}</p>
      </header>
      <GraphPane model={model} graph={graph} side={tone} exampleId={exampleId} />
      <div className="issue-fix-snippet">
        <PierreExampleCode
          code={snippet}
          fileName={`${exampleId}-${tone}.json`}
        />
      </div>
    </article>
  )
}

function HeroInner() {
  const { theme } = useTheme()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('example')
  const selected =
    ISSUE_FIX_EXAMPLES.find((e) => e.id === selectedId) ?? ISSUE_FIX_EXAMPLES[0]!
  const border = theme.colors.border ?? 'rgba(127,127,127,0.3)'

  const selectExample = (id: string) => {
    const next = new URLSearchParams(searchParams)
    if (id === ISSUE_FIX_EXAMPLES[0]!.id) next.delete('example')
    else next.set('example', id)
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="issue-fix-hero">
      <header className="issue-fix-copy">
        <h1>
          Issue
          <span className="hero-title-badge">Fix</span>
        </h1>
        <p>
          A check failed. Left is the authored claim; right is after the
          remediator landed. Same diagram language as the rest of the docs —
          just side by side.
        </p>
      </header>

      <div className="issue-fix-tabs" role="tablist" aria-label="Audit findings">
        {ISSUE_FIX_EXAMPLES.map((example) => {
          const active = example.id === selected.id
          return (
            <button
              key={example.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={
                active ? 'issue-fix-tab issue-fix-tab--active' : 'issue-fix-tab'
              }
              onClick={() => selectExample(example.id)}
            >
              <span className="issue-fix-tab-layer">{example.layer}</span>
              <span className="issue-fix-tab-check">{example.check}</span>
            </button>
          )
        })}
      </div>

      <p className="issue-fix-blurb">
        {selected.blurb}{' '}
        <span
          className={`maintainer-remediation maintainer-remediation--${selected.remediation}`}
        >
          {REMEDIATION_LABEL[selected.remediation]}
        </span>
      </p>

      <div className="issue-fix-stage" style={{ borderColor: border }}>
        <ComparisonPane
          tone="issue"
          label="Issue"
          caption={selected.issue.caption}
          snippet={selected.issue.snippet}
          model={selected.issue.model}
          graph={selected.graph}
          exampleId={selected.id}
        />
        <ComparisonPane
          tone="fix"
          label="Fix"
          caption={selected.fix.caption}
          snippet={selected.fix.snippet}
          model={selected.fix.model}
          graph={selected.graph}
          exampleId={selected.id}
        />
      </div>
    </div>
  )
}

export function IssueFixHero() {
  return (
    <ThemeProvider theme={defaultEditorTheme}>
      <HeroInner />
    </ThemeProvider>
  )
}

import { DIAGRAMMING_GAPS, type GapStatus } from './diagrammingGaps'
import { SectionPager } from './shared'

const STATUS_LABEL: Record<GapStatus, string> = {
  covered: 'Handled today',
  partial: 'Partly modeled',
  open: 'Not modeled yet',
}

export function MaintainerCommonIssues() {
  return (
    <section className="maintainer-page">
      <header className="maintainer-header">
        <h1>Diagramming gaps</h1>
        <p>
          A living list of modeling situations the current vocabulary does not
          express cleanly — and the richer diagramming each one points to. These
          are not bugs in a single model; they are places where the diagram runs
          out of primitives.
        </p>
        <p>
          The running theme: Graphify’s inferred construct is a structural hint,
          not ground truth. Where it is silent or disagrees, source-reading — an
          agent, recorded as an accepted augmentation — is the authority.
        </p>
      </header>

      <section className="maintainer-section">
        <div className="maintainer-mechanisms">
          {DIAGRAMMING_GAPS.map((gap) => (
            <article
              key={gap.id}
              id={gap.id}
              className="maintainer-mechanism"
            >
              <h4 className="maintainer-mechanism-name">{gap.title}</h4>
              <p className="maintainer-mechanism-meaning">
                <strong>Looks like:</strong> {gap.symptom}
              </p>
              <p className="maintainer-mechanism-meaning">
                <strong>Why it’s hard:</strong> {gap.why}
              </p>
              <p className="maintainer-mechanism-meaning">
                <strong>Today:</strong> {gap.today}
              </p>
              <p className="maintainer-mechanism-meaning">
                <strong>Points to:</strong> {gap.pointsTo}
              </p>
              {gap.example ? (
                <pre className="maintainer-mechanism-example maintainer-mechanism-example--plain">
                  <code>{gap.example}</code>
                </pre>
              ) : null}
              <p className="maintainer-mechanism-meaning">
                <em>{STATUS_LABEL[gap.status]}</em>
              </p>
            </article>
          ))}
        </div>
      </section>

      <SectionPager sectionId="gaps" />
    </section>
  )
}

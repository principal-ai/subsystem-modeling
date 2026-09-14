import { Link } from 'react-router-dom'
import { SectionPager, VERDICTS } from './shared'

export function MaintainerReference() {
  return (
    <section className="maintainer-page">
      <header className="maintainer-header">
        <h1>Reference</h1>
        <p>
          Shared vocabulary for the Author → Audit → Verdict → Maintain loop
          across construct, static topology, runtime topology, and walkthrough.
        </p>
      </header>

      <section className="maintainer-section">
        <p className="maintainer-layer-label">Reference</p>
        <h2 id="the-loop">The loop</h2>
        <ol className="maintainer-loop">
          <li>
            <strong>Author</strong>
            <span>
              A model claims constructs (nodes), static topology (relations +
              package/module), runtime topology (<em>process</em>), and
              walkthroughs (ordered hops with file:line sites).
            </span>
          </li>
          <li>
            <strong>Audit</strong>
            <span>
              Four layers: construct → static topology → runtime topology →
              walkthrough. Construct, relations, and module/process field checks
              run in Studio audit today; package-layer soft checks and
              walkthrough audit are next.
            </span>
          </li>
          <li>
            <strong>Verdict</strong>
            <span>
              Construct layer today: unverified → verification failed →
              partially verified → fully verified.
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
      </section>

      <section className="maintainer-section">
        <h2 id="verdicts">Verdicts</h2>
        <p className="maintainer-lede">
          From not checked yet to fully confirmed. Only the three audited states
          mean checks actually ran — <em>unverified</em> means no verification
          has happened. These verdicts are the <em>construct</em> layer today;
          static/runtime topology and walkthrough get their own status later.
        </p>
        <ul className="maintainer-verdicts">
          {VERDICTS.map((v) => (
            <li
              key={v.id}
              className={`maintainer-verdict maintainer-verdict--${v.id}`}
            >
              <span className="maintainer-verdict-label">{v.label}</span>
              <p>{v.meaning}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="maintainer-section">
        <h2 id="issue-vs-gap">Issue vs gap</h2>
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

      <p className="maintainer-next">
        <Link to="/start">Try it</Link>
        {' · '}
        <Link to="/about">Mission</Link>
      </p>

      <SectionPager sectionId="reference" />
    </section>
  )
}

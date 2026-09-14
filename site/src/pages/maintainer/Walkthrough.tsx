import {
  CaseTable,
  LabelCatalog,
  SectionPager,
  WALKTHROUGH_MECHANICAL_CASES,
  WALKTHROUGH_MECHANISM_CATALOG,
} from './shared'

export function MaintainerWalkthrough() {
  return (
    <section className="maintainer-page">
      <section className="maintainer-section maintainer-layer">
        <p className="maintainer-layer-label">Layer 4</p>
        <h1 id="walkthrough-verification">Walkthrough verification</h1>
        <p className="maintainer-lede">
          Per flow: does this ordered story still fire at these{' '}
          <em>file:line</em> seams? Each hop carries its own <em>mechanism</em>;
          the graph edge for that hop is derived. Not process membership — a
          chosen narrative. Cross-hop evidence is weaker than construct checks.
          Studio <em>audit</em> does not run this layer yet; create/update file
          verification does for mechanical site integrity.
        </p>

        <h2 className="maintainer-subhead" id="hop-mechanisms">
          Hop mechanisms
        </h2>
        <p className="maintainer-lede">
          Closed vocabulary on each walkthrough step. The step’s{' '}
          <em>file:line</em> should be the concrete site of that runtime seam
          for this flow.
        </p>
        <LabelCatalog entries={WALKTHROUGH_MECHANISM_CATALOG} />

        <h2 className="maintainer-subhead" id="walkthrough-mechanical-checks">
          Mechanical checks
        </h2>
        <p className="maintainer-lede">
          Site and endpoint integrity — independent of mechanism. Text affinity
          (substring token match) is not part of this catalogue; whether the
          site is the right seam for the story belongs with the agent.
          Story-level issues (wrong order, missing hops) come later.
        </p>
        <CaseTable cases={WALKTHROUGH_MECHANICAL_CASES} />

        <h2 className="maintainer-subhead" id="how-to-inspect">
          How to inspect
        </h2>
        <p className="maintainer-lede">
          On create/update, the host runs walkthrough site checks and writes{' '}
          <em>verification.walkthroughsFailed</em> on the stored model. Read
          them with <em>subsystem-model get &lt;id&gt;</em>. Deterministic{' '}
          <em>subsystem-model audit</em> is construct-only today.
        </p>
      </section>

      <SectionPager sectionId="walkthrough" />
    </section>
  )
}

import {
  AgentCard,
  CaseTable,
  LabelCatalog,
  SectionPager,
  TRAIL_AGENTS,
  TRAIL_MECHANICAL_CASES,
  TRAIL_MECHANISM_CATALOG,
  TRAIL_STEP_CASES,
} from './shared'

export function MaintainerTrail() {
  return (
    <section className="maintainer-page">
      <section className="maintainer-section maintainer-layer">
        <p className="maintainer-layer-label">Layer 4</p>
        <h1 id="trail-verification">Trail verification</h1>
        <p className="maintainer-lede">
          Per flow: does this ordered story still fire at these{' '}
          <em>file:line</em> seams? Each step carries its own <em>mechanism</em>;
          the graph edge for that step is derived. Not process membership — a
          chosen narrative. Cross-step evidence is weaker than construct checks.
          Studio <em>audit</em> runs two passes: mechanical site integrity, and
          step call-site verification against accepted augmentations.
        </p>

        <h2 className="maintainer-subhead" id="step-mechanisms">
          Step mechanisms
        </h2>
        <p className="maintainer-lede">
          Closed vocabulary on each trail step. The step’s{' '}
          <em>file:line</em> should be the concrete site of that runtime seam
          for this flow.
        </p>
        <LabelCatalog entries={TRAIL_MECHANISM_CATALOG} />

        <h2 className="maintainer-subhead" id="trail-mechanical-checks">
          Mechanical checks
        </h2>
        <p className="maintainer-lede">
          Site and endpoint integrity — independent of mechanism. Text affinity
          (substring token match) is not part of this catalogue; whether the
          site is the right seam for the story belongs with the agent.
        </p>
        <CaseTable cases={TRAIL_MECHANICAL_CASES} />

        <h2 className="maintainer-subhead" id="trail-step-checks">
          Step call sites
        </h2>
        <p className="maintainer-lede">
          Whether each step’s call actually fires where it claims, verified by an
          accepted <em>callSite</em> augmentation rather than by substring match.
        </p>
        <CaseTable cases={TRAIL_STEP_CASES} />

        <h2 className="maintainer-subhead" id="trail-agents">
          Trail agent
        </h2>
        <div className="maintainer-agents">
          {TRAIL_AGENTS.map((agent) => (
            <AgentCard key={`trail-${agent.id}`} agent={agent} />
          ))}
        </div>

        <h2 className="maintainer-subhead" id="how-to-inspect">
          How to inspect
        </h2>
        <p className="maintainer-lede">
          Read findings with <em>subsystem-model audit &lt;id&gt;</em> (or the
          Studio audit via the HTTP bridge). Step findings carry{' '}
          <em>trailId</em> and <em>step</em>; mechanical site checks also run on
          create/update and write <em>verification</em> on the stored model.
        </p>
      </section>

      <SectionPager sectionId="trail" />
    </section>
  )
}

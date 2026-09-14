import {
  AgentCard,
  CaseTable,
  PROCESS_BOUNDARY_AGENTS,
  PROCESS_BOUNDARY_CASES,
  SectionPager,
} from './shared'

export function MaintainerRuntimeTopology() {
  return (
    <section className="maintainer-page">
      <section className="maintainer-section maintainer-layer">
        <p className="maintainer-layer-label">Layer 3</p>
        <h1 id="runtime-topology-verification">Runtime topology</h1>
        <p className="maintainer-lede">
          Deployment-unit membership via <em>process</em> — where constructs
          run. Orthogonal to static containment (package/module) and to
          walkthrough narratives. Soft gaps never block publish. When a
          multi-member module nests under process, members must agree on
          process.
        </p>

        <h2 className="maintainer-subhead" id="process-boundary-checks">
          Process
        </h2>
        <CaseTable cases={PROCESS_BOUNDARY_CASES} />

        <h2 className="maintainer-subhead" id="process-boundary-agents">
          Process agents
        </h2>
        <p className="maintainer-lede">
          Same Maintain host agent as module gaps today (
          <em>boundary-gap-filler</em>). Propose; you confirm.
        </p>
        <div className="maintainer-agents">
          {PROCESS_BOUNDARY_AGENTS.map((agent) => (
            <AgentCard key={`process-${agent.id}`} agent={agent} />
          ))}
        </div>
      </section>

      <SectionPager sectionId="runtime-topology" />
    </section>
  )
}

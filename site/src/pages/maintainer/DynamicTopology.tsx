import {
  AgentCard,
  CaseTable,
  PROCESS_BOUNDARY_AGENTS,
  PROCESS_BOUNDARY_CASES,
  SectionPager,
} from './shared'

export function MaintainerDynamicTopology() {
  return (
    <section className="maintainer-page">
      <section className="maintainer-section maintainer-layer">
        <p className="maintainer-layer-label">Layer 3</p>
        <h1 id="dynamic-topology-verification">Dynamic topology</h1>
        <p className="maintainer-lede">
          How constructs are arranged at runtime: deployment-unit membership via{' '}
          <em>process</em>. Unconfirmed claims never block publish. A runtime
          component (function, class, custom entity) must state its process; a
          model that states it everywhere and disagrees nowhere is verified. Types
          are exempt — erased at compile time, and a shared type is often
          legitimately reachable from several processes at once. When a
          multi-member module nests under process, members must agree on process.
          Package and module containment live under static topology.
        </p>
        <p className="maintainer-lede">
          Two halves: <em>membership</em> (do a component’s process claims hold
          together?) and <em>container verification</em> (does an accepted C4
          container claim the boundary?). <strong>Container-first</strong>: a
          process key is only coined by accepting a container — the membership
          agent proposes only keys an accepted container already verifies.
        </p>

        <h2 className="maintainer-subhead" id="process-boundary-checks">
          Process
        </h2>
        <CaseTable cases={PROCESS_BOUNDARY_CASES} />

        <h2 className="maintainer-subhead" id="process-boundary-agents">
          Process agents
        </h2>
        <p className="maintainer-lede">
          Membership corrections (<em>runtime-topology-verifier</em>) and
          container verification (<em>container-verifier</em>). Propose; you
          confirm.
        </p>
        <div className="maintainer-agents">
          {PROCESS_BOUNDARY_AGENTS.map((agent) => (
            <AgentCard key={`process-${agent.id}`} agent={agent} />
          ))}
        </div>
      </section>

      <SectionPager sectionId="dynamic-topology" />
    </section>
  )
}

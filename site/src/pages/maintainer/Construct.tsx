import {
  AgentCard,
  CaseTable,
  GRAPHIFY_CASES,
  MAINTENANCE_AGENTS,
  RemediationLegend,
  SectionPager,
  SOURCE_CASES,
} from './shared'

export function MaintainerConstruct() {
  return (
    <section className="maintainer-page">
      <section className="maintainer-section maintainer-layer">
        <p className="maintainer-layer-label">Layer 1</p>
        <h1 id="construct-verification">Construct verification</h1>
        <p className="maintainer-lede">
          Per component: does this node’s file, symbol, kind, and signature still
          hold? Evidence from the repo and Graphify. Package/module and process
          live in the topology layers.
        </p>
        <RemediationLegend />

        <h2 className="maintainer-subhead" id="source-checks">
          Source checks
        </h2>
        <p className="maintainer-lede">
          Ensures each construct’s defining file path exists in the repo.
        </p>
        <CaseTable cases={SOURCE_CASES} />

        <h2 className="maintainer-subhead" id="graphify-checks">
          Graphify checks
        </h2>
        <p className="maintainer-lede">
          Preliminary check on construct existence, location, classification,
          and signature. When Remediation is Apply, the audit finding carries a{' '}
          <em>fix</em> and the modal offers one-click Apply.
        </p>
        <CaseTable cases={GRAPHIFY_CASES} />

        <h2 className="maintainer-subhead" id="construct-agents">
          Construct agents
        </h2>
        <p className="maintainer-lede">
          Construct layer only. One list action; the host re-audits and picks
          the agent. Construct issues win over construct gaps — and over
          topology — so relation retargets run against a stable component set.
          Agents propose; you confirm.
        </p>
        <div className="maintainer-agents">
          {MAINTENANCE_AGENTS.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      </section>

      <SectionPager sectionId="construct" />
    </section>
  )
}

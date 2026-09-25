import {
  AgentCard,
  CaseTable,
  LabelCatalog,
  RELATION_TYPE_CATALOG,
  SectionPager,
  TOPOLOGY_MAINTENANCE_AGENTS,
  TOPOLOGY_MECHANICAL_CASES,
} from './shared'

export function MaintainerStaticTopology() {
  return (
    <section className="maintainer-page">
      <section className="maintainer-section maintainer-layer">
        <p className="maintainer-layer-label">Layer 2</p>
        <h1 id="static-topology-verification">Static topology</h1>
        <p className="maintainer-lede">
          How constructs are arranged in source: typed associations (
          <em>relations[]</em>). Soft Graphify / discovery corroboration; missing
          evidence is an unconfirmed claim, never a hard fail for soft checks. No
          runtime <em>file:line</em> site — that belongs on walkthrough hops.
          Containment (package / <em>module</em>) and process live under dynamic
          topology.
        </p>

        <h2 className="maintainer-subhead" id="relation-types">
          Relation types
        </h2>
        <p className="maintainer-lede">
          Closed authoring vocabulary on each <em>relations[]</em> item. Soft
          Graphify corroboration maps each label onto Graphify edge verbs (e.g.
          model <em>extends</em> ↔ Graphify <em>inherits</em>).
        </p>
        <LabelCatalog entries={RELATION_TYPE_CATALOG} />

        <h2 className="maintainer-subhead" id="topology-mechanical-checks">
          Relation checks (shipped)
        </h2>
        <p className="maintainer-lede">
          What Studio <em>audit</em> runs on <em>relations[]</em>: endpoint
          integrity for every relation; soft Graphify corroboration for every
          relationType. Absence of Graphify evidence is never a hard fail.
          Unconfirmed claims: propose a relation augmentation when the claim is
          intentional; drop/retarget when source shows it is wrong.
        </p>
        <CaseTable cases={TOPOLOGY_MECHANICAL_CASES} />

        <h2 className="maintainer-subhead" id="topology-agents">
          Relation agents
        </h2>
        <p className="maintainer-lede">
          Same Maintain button; host routes here only when construct has nothing
          left to fix. Propose relation drop/retarget; you confirm.
        </p>
        <div className="maintainer-agents">
          {TOPOLOGY_MAINTENANCE_AGENTS.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      </section>

      <SectionPager sectionId="static-topology" />
    </section>
  )
}

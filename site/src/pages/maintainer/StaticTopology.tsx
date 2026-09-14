import {
  AgentCard,
  CaseTable,
  LabelCatalog,
  MODULE_MEMBERSHIP_AGENTS,
  MODULE_MEMBERSHIP_CASES,
  PACKAGE_LAYER_CASES,
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
          <em>relations[]</em>) and containment (package/<em>purl</em>,{' '}
          <em>module</em>). Soft Graphify / discovery corroboration; missing
          evidence is a gap, never a hard fail for soft checks. No runtime{' '}
          <em>file:line</em> site — that belongs on walkthrough hops. Prefer real
          constructs plus optional <em>module</em> over a module construct.
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
          relationType. Absence of Graphify evidence is never a hard fail. Soft
          gaps: propose a relation augmentation when the claim is intentional;
          drop/retarget when source shows it is wrong.
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

        <h2 className="maintainer-subhead" id="package-module-membership">
          Package &amp; module membership
        </h2>
        <p className="maintainer-lede">
          Containment at two grains: <em>purl</em> (repo/package identity from
          discovery) and <em>module</em> (source-file membership, usually equals{' '}
          <em>file</em>). Package-layer cache under{' '}
          <em>~/.principal/package-layers</em> (Package Layers tab Ensure — same
          HEAD(+dirty) freshness as Graphify). Soft gaps when the cache is
          missing or purl does not match discovery — planned. Module field
          checks are shipped. Multi-repo graphs use purls for package frames;
          single-repo monorepos stay unframed at that level by design.
        </p>
        <CaseTable cases={[...PACKAGE_LAYER_CASES, ...MODULE_MEMBERSHIP_CASES]} />

        <h2 className="maintainer-subhead" id="module-membership-agents">
          Module membership agents
        </h2>
        <p className="maintainer-lede">
          Shipped as <em>boundary-fixer</em> / <em>boundary-gap-filler</em>{' '}
          (legacy names). Conceptually static topology — not process. Propose;
          you confirm.
        </p>
        <div className="maintainer-agents">
          {MODULE_MEMBERSHIP_AGENTS.map((agent) => (
            <AgentCard key={`module-${agent.id}`} agent={agent} />
          ))}
        </div>
      </section>

      <SectionPager sectionId="static-topology" />
    </section>
  )
}

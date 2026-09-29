import {
  AgentCard,
  CaseTable,
  MODULE_MEMBERSHIP_AGENTS,
  MODULE_MEMBERSHIP_CASES,
  PACKAGE_LAYER_CASES,
  SectionPager,
} from './shared'

export function MaintainerStaticTopology() {
  return (
    <section className="maintainer-page">
      <section className="maintainer-section maintainer-layer">
        <p className="maintainer-layer-label">Layer 2</p>
        <h1 id="static-topology-verification">Static topology</h1>
        <p className="maintainer-lede">
          How constructs are arranged in source: containment via{' '}
          <em>purl</em> (repo/package identity from discovery) and{' '}
          <em>module</em> (source-file membership, usually equals <em>file</em>).
          Unconfirmed claims never block publish. No runtime <em>file:line</em>{' '}
          site — that belongs on walkthrough hops. Process (deployment-unit
          membership) lives under dynamic topology.
        </p>

        <h2 className="maintainer-subhead" id="package-module-membership">
          Package &amp; module membership
        </h2>
        <p className="maintainer-lede">
          Containment at two grains: <em>purl</em> (repo/package identity from
          discovery) and <em>module</em> (source-file membership, usually equals{' '}
          <em>file</em>). Package-layer cache under{' '}
          <em>~/.principal/package-layers</em> (Package Layers tab Ensure — same
          HEAD(+dirty) freshness as Graphify). Unconfirmed when the cache is
          missing or purl does not match discovery — planned. Module field checks
          are shipped. Multi-repo graphs use purls for package frames;
          single-repo monorepos stay unframed at that level by design.
        </p>
        <CaseTable cases={[...PACKAGE_LAYER_CASES, ...MODULE_MEMBERSHIP_CASES]} />

        <h2 className="maintainer-subhead" id="module-membership-agents">
          Module membership agents
        </h2>
        <p className="maintainer-lede">
          Hard containment failures go to <em>package-module-fixer</em>;
          unconfirmed module≠file claims go to <em>package-module-verifier</em>.
          Propose; you confirm.
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

import { Link } from 'react-router-dom'
import { SectionPager } from './shared'

export function MaintainerOverview() {
  return (
    <section className="maintainer-page">
      <header className="maintainer-header">
        <h1 id="overview">Docs</h1>
        <p>
          In order for a diagram to be maintainable by agents, we have dissected
          its components into four concepts: <strong>Constructs</strong>,{' '}
          <strong>Static topology</strong>, <strong>Dynamic topology</strong>,
          and <strong>Walkthrough</strong>.
        </p>
        <p>
          <strong>Constructs</strong> are primitives such as types, functions,
          and classes — and correcting those first.
        </p>
        <p>
          <strong>Static topology</strong> is how constructs are arranged in
          source: how they relate to other constructs (<em>relations[]</em>).
        </p>
        <p>
          <strong>Dynamic topology</strong> is how constructs are arranged at
          runtime: deployment-unit membership (<em>process</em>) and containment
          (package / <em>module</em>).
        </p>
        <p>
          <strong>Walkthrough</strong> is the content necessary to help
          understand a concept. It houses mechanisms similar to a stacktrace,
          but allows for more loose definitions.
        </p>
        <p>
          Each layer can fail a check. See an issue and its fix{' '}
          <Link to="/maintainer/issues">side by side</Link>.
        </p>
      </header>

      <SectionPager sectionId="overview" />
    </section>
  )
}

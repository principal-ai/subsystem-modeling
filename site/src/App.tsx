import { lazy, Suspense } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import './App.css'

const Schema = lazy(() =>
  import('./pages/Schema').then((m) => ({ default: m.Schema })),
)

const Start = lazy(() =>
  import('./pages/Start').then((m) => ({ default: m.Start })),
)

const Gist = lazy(() =>
  import('./pages/Gist').then((m) => ({ default: m.Gist })),
)

const ModelMaintainer = lazy(() =>
  import('./pages/ModelMaintainer').then((m) => ({ default: m.ModelMaintainer })),
)

const HeroGraphic = lazy(() =>
  import('./components/HeroGraphic').then((m) => ({ default: m.HeroGraphic })),
)

const HomeCarousel = lazy(() =>
  import('./components/HomeCarousel').then((m) => ({ default: m.HomeCarousel })),
)

const GALLERY_HREF = `${import.meta.env.BASE_URL}gallery/`

function Home() {
  return (
    <section className="hero hero--with-gallery">
      <div className="hero-copy">
        <h1>Your Mental Model — Visualized</h1>
      </div>
      <div className="hero-gallery">
        <Suspense fallback={<div className="hero-gallery-fallback">Loading examples…</div>}>
          <HomeCarousel />
        </Suspense>
      </div>
      <div className="hero-actions">
        <Link to="/start" className="button primary">
          Try it yourself
        </Link>
        <a href={GALLERY_HREF} className="button ghost">
          Browse gallery
        </a>
      </div>
    </section>
  )
}

function About() {
  return (
    <section className="about">
      <h1>Verifiable System Diagrams</h1>
      <p>
        This open source project is an attempt to create an artifact that agents
        can use to visualize parts of a codebase for human developers — a
        Subsystem Model you can check against real declarations, not a disposable
        sketch.
      </p>

      <div className="about-art">
        <Suspense fallback={<div className="about-art-fallback" />}>
          <HeroGraphic />
        </Suspense>
      </div>

      <div className="about-columns">
        <div className="about-column">
          <h2 className="about-column-title">Goals</h2>

          <h3>Verifiable Artifact</h3>
          <p>
            A lot of artifacts that are generated tend to have a very short time
            to live given the pace at which code is being written with the
            assistance of agents. As a result, it is important that an artifact
            is able to be verified independent of an agent — or with the help of
            fast agents — so as to be able to maintain them longer term.
          </p>

          <h3>Surface actual code</h3>
          <p>
            Maintaining a mental model of what a codebase does is important for
            steering agents into making the right choices, to prevent codebases
            from becoming unmanageable. For this reason, the goal of this
            artifact is to have the information necessary so that a developer
            tool can surface actual code for a user to review when they want to
            understand the implementation.
          </p>

          <h3>Common constructs</h3>
          <p>
            The artifact should stay a lighter-weight abstraction that can
            centralize a wide range of languages and coding applications. Over
            time, code itself has drifted toward a common set of constructs —
            which tend to be what is necessary for most developers to reason
            about the code they are assigned to maintain.
          </p>
        </div>

        <div className="about-column">
          <h2 className="about-column-title">Non Goals</h2>

          <h3>Not a no-code stand-in</h3>
          <p>
            This is not a no-code representation of a codebase, and it is not
            meant to replace reading the implementation. The artifact should
            stay light enough to maintain, and close enough to the code that a
            tool can open the real source when someone needs to go deeper.
          </p>

          <h3>Not a whole-system map</h3>
          <p>
            It is also not an attempt to model an entire system in one diagram.
            Subsystem Models are scoped on purpose — one mental model at a time
            — so they stay verifiable and useful for steering work, rather than
            becoming a stale map of everything.
          </p>

          <h3>Not a stack trace</h3>
          <p>
            The point is to focus attention on the key components needed to tell
            a story, intentionally omitting details that are not pertinent — so
            the model stays readable, not exhaustive.
          </p>
        </div>
      </div>

      <div className="about-related">
        <h2 className="about-related-title">Related projects</h2>
        <p>
          There is lots of work going on in the space of developer tools that
          aim at increasing the speed at which a developer can understand the
          code being worked on — and this is just another one of those, with
          specific goals.
        </p>
        <ul className="about-related-list">
          {/* Add project links here */}
        </ul>
      </div>
    </section>
  )
}

function App() {
  const { pathname } = useLocation()
  const shellClass =
    pathname === '/'
      ? 'shell shell--home'
      : pathname === '/about'
        ? 'shell shell--about'
        : pathname === '/schema'
          ? 'shell shell--schema'
          : pathname === '/start'
            ? 'shell shell--start'
            : pathname === '/gist'
              ? 'shell shell--gist'
              : pathname === '/maintainer'
                ? 'shell shell--maintainer'
                : 'shell'

  return (
    <div className={shellClass}>
      {pathname === '/about' && (
        <div className="about-sparkles" aria-hidden="true">
          {Array.from({ length: 18 }, (_, i) => (
            <span key={i} className={`about-sparkle about-sparkle--${i + 1}`} />
          ))}
        </div>
      )}
      <nav>
        <Link to="/" className="brand">
          <svg
            className="brand-mark"
            aria-hidden="true"
            viewBox="0 0 32 32"
            width="32"
            height="32"
            fill="none"
          >
            {/* Through-lines (muted) — full runs across the box */}
            <g
              stroke="currentColor"
              strokeWidth="1.5"
              opacity="0.15"
              strokeLinecap="butt"
            >
              <path d="M2 8 H30" />
              <path d="M2 16 H30" />
              <path d="M2 24 H30" />
              <path d="M8 2 V30" />
              <path d="M24 2 V30" />
            </g>
            <rect
              x="1"
              y="1"
              width="30"
              height="30"
              rx="2"
              stroke="currentColor"
              strokeWidth="2"
              opacity="0.4"
            />
            {/* Emphasized segments that read as an S */}
            <g
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="square"
              strokeLinejoin="miter"
            >
              <path d="M8 8 H24" />
              <path d="M8 8 V16" />
              <path d="M8 16 H24" />
              <path d="M24 16 V24" />
              <path d="M24 24 H8" />
            </g>
          </svg>
          Subsystem Modeling
        </Link>
        <div className="nav-links">
          <Link to="/start">Try it</Link>
          <Link to="/gist">Gist</Link>
          <Link to="/maintainer">Maintainer</Link>
          <Link to="/about">Mission</Link>
          <Link to="/schema">Schema</Link>
          <a href={GALLERY_HREF}>Gallery</a>
          <a
            href="https://github.com/principal-ai/subsystem-modeling"
            target="_blank"
            rel="noreferrer"
            className="nav-icon-link"
            aria-label="GitHub"
            title="GitHub"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" width="18" height="18" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8" />
            </svg>
          </a>
          <a
            href="https://discord.gg/2m8yzX2Qp"
            target="_blank"
            rel="noreferrer"
            className="nav-icon-link"
            aria-label="Discord"
            title="Discord"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" width="18" height="18" fill="currentColor">
              <path d="M13.545 2.907a13.2 13.2 0 0 0-3.257-1.011.05.05 0 0 0-.052.025c-.141.25-.297.577-.406.833a12.2 12.2 0 0 0-3.658 0 8 8 0 0 0-.412-.833.05.05 0 0 0-.052-.025c-1.125.194-2.22.534-3.257 1.011a.04.04 0 0 0-.021.018C.356 6.024-.213 9.047.066 12.032q.001.022.021.037a13.3 13.3 0 0 0 3.995 2.02.05.05 0 0 0 .056-.019q.463-.63.818-1.329a.05.05 0 0 0-.01-.059l-.018-.011a9 9 0 0 1-1.288-.599.05.05 0 0 1-.02-.066l.004-.01a.05.05 0 0 1 .015-.019l.012-.01a11.1 11.1 0 0 0 9.55 0l.012.01a.05.05 0 0 1 .032.027.05.05 0 0 1-.01.056c-.41.246-.842.44-1.287.598a.05.05 0 0 0-.03.03.05.05 0 0 0 .003.041c.24.465.515.909.817 1.329a.05.05 0 0 0 .056.019 13.2 13.2 0 0 0 4.001-2.02.05.05 0 0 0 .021-.037c.334-3.451-.559-6.449-2.378-9.106a.03.03 0 0 0-.02-.019m-8.198 7.307c-.789 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.45.73 1.438 1.613 0 .888-.637 1.612-1.438 1.612m5.316 0c-.788 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.451.73 1.438 1.613 0 .888-.631 1.612-1.438 1.612" />
            </svg>
          </a>
        </div>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route
            path="/start"
            element={
              <Suspense fallback={<section className="start-page">Loading…</section>}>
                <Start />
              </Suspense>
            }
          />
          <Route
            path="/schema"
            element={
              <Suspense fallback={<section className="schema-page">Loading schema…</section>}>
                <Schema />
              </Suspense>
            }
          />
          <Route
            path="/gist"
            element={
              <Suspense fallback={<section className="gist-page">Loading…</section>}>
                <Gist />
              </Suspense>
            }
          />
          <Route
            path="/maintainer"
            element={
              <Suspense fallback={<section className="maintainer-page">Loading…</section>}>
                <ModelMaintainer />
              </Suspense>
            }
          />
          <Route path="/about" element={<About />} />
        </Routes>
      </main>
    </div>
  )
}

export default App

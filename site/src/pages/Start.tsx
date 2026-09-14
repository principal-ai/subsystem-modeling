import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { GistPicker } from '../components/GistPicker'

const SKILL_PAGE =
  'https://skills.sh/principal-ai/subsystem-modeling/create-subsystem-model'
const PROMPT_EXAMPLE =
  'Diagram the checkout subsystem in this repo as a Subsystem Model, then open it in Subsystems Studio.'

export function Start() {
  const { hash } = useLocation()

  useEffect(() => {
    if (hash !== '#gist') return
    document.getElementById('gist')?.scrollIntoView()
  }, [hash])

  return (
    <section className="start-page">
      <header className="start-header">
        <h1>Try it yourself</h1>
      </header>

      <ol className="start-steps">
        <li className="start-step">
          <h2>
            <span className="start-step-num">1</span>
            Get the skill
          </h2>
          <div className="start-step-actions">
            <a
              className="button primary"
              href={SKILL_PAGE}
              target="_blank"
              rel="noreferrer"
            >
              create-subsystem-model
            </a>
          </div>
        </li>

        <li className="start-step">
          <h2>
            <span className="start-step-num">2</span>
            Ask your agent
          </h2>
          <blockquote className="start-prompt">{PROMPT_EXAMPLE}</blockquote>
        </li>
      </ol>

      <section className="start-gist" id="gist">
        <p className="start-or">or</p>
        <h2>Look at an example</h2>
        <GistPicker />
      </section>

      <p className="start-next">
        Not sure what a good model looks like?{' '}
        <a href={`${import.meta.env.BASE_URL}gallery/`}>Browse the gallery</a>
        {' · '}
        <Link to="/maintainer">Docs</Link>
        {' · '}
        <Link to="/about">Mission</Link>
      </p>
    </section>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import '@xyflow/react/dist/style.css'
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme'
import { SubsystemComponentGraph } from '@principal-ai/subsystems-react'
import type { SubsystemModelDocument } from '@principal-ai/subsystems-core'
import { loadSubsystemModelFromGist, parseGistId } from '../lib/gist'
import { makeGithubRenderers } from '../lib/githubFiles'
import { GIST_EXAMPLES, gistExampleOwner } from '../showcase/gistExamples'

type LoadState =
  | { status: 'idle' }
  | { status: 'loading'; gistInput: string }
  | { status: 'ready'; document: SubsystemModelDocument; gistId: string; fileName: string }
  | { status: 'error'; message: string }

function ExampleList({ onOpen }: { onOpen: (gistId: string) => void }) {
  return (
    <ul className="gist-examples">
      {GIST_EXAMPLES.map((ex) => {
        const owner = gistExampleOwner(ex.repo)
        return (
          <li key={ex.id}>
            <button type="button" className="gist-example" onClick={() => onOpen(ex.id)}>
              <img
                className="gist-example-avatar"
                src={`https://github.com/${encodeURIComponent(owner)}.png?size=128`}
                alt=""
                width={56}
                height={56}
                loading="lazy"
                decoding="async"
              />
              <span className="gist-example-body">
                <span className="gist-example-title">{ex.title}</span>
                <span className="gist-example-repo">{ex.repo}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function Gist() {
  const [searchParams, setSearchParams] = useSearchParams()
  const gistParam = searchParams.get('gist') ?? searchParams.get('url') ?? ''
  const fileParam = searchParams.get('file') ?? undefined
  const refParam = searchParams.get('ref') ?? undefined

  const [input, setInput] = useState(gistParam)
  const [state, setState] = useState<LoadState>({ status: 'idle' })

  const load = useCallback(async (gistInput: string, fileName?: string) => {
    const id = parseGistId(gistInput)
    if (!id) {
      setState({
        status: 'error',
        message: 'Enter a public gist id or gist.github.com URL.',
      })
      return
    }

    setState({ status: 'loading', gistInput })
    const result = await loadSubsystemModelFromGist(gistInput, { fileName })
    if (!result.ok) {
      setState({ status: 'error', message: result.error })
      return
    }

    setState({
      status: 'ready',
      document: result.document,
      gistId: result.gistId,
      fileName: result.fileName,
    })
  }, [])

  useEffect(() => {
    setInput(gistParam)
    if (!gistParam.trim()) {
      setState({ status: 'idle' })
      return
    }
    void load(gistParam, fileParam)
  }, [gistParam, fileParam, load])

  const openExample = useCallback(
    (gistId: string) => {
      const next = new URLSearchParams()
      next.set('gist', gistId)
      if (refParam) next.set('ref', refParam)
      setSearchParams(next)
    },
    [refParam, setSearchParams],
  )

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const id = parseGistId(input)
    if (!id) {
      setState({
        status: 'error',
        message: 'Enter a public gist id or gist.github.com URL.',
      })
      return
    }
    const next = new URLSearchParams()
    next.set('gist', id)
    if (fileParam) next.set('file', fileParam)
    if (refParam) next.set('ref', refParam)
    setSearchParams(next)
  }

  const githubRenderers = useMemo(() => {
    if (state.status !== 'ready') return null
    return makeGithubRenderers(state.document.components, refParam)
  }, [state, refParam])

  return (
    <section className="gist-page">
      {state.status !== 'ready' && (
        <header className="gist-chrome">
          <form className="gist-form" onSubmit={onSubmit}>
            <label className="gist-label" htmlFor="gist-input">
              Gist
            </label>
            <input
              id="gist-input"
              className="gist-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="gist id or https://gist.github.com/…"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
            <button type="submit" className="button primary gist-load">
              Load
            </button>
          </form>
        </header>
      )}

      <div className="gist-stage">
        {state.status === 'idle' && (
          <div className="gist-empty">
            <h1>View a Subsystem Model from a gist</h1>
            <p>
              Open an example below, or paste a public gist id that contains
              portable Subsystem Model JSON. Source files resolve from GitHub
              via each component&apos;s <code>purl</code>.
            </p>

            <ExampleList onOpen={openExample} />

            <p className="gist-empty-hint">
              Prefer authoring with the{' '}
              <Link to="/start">create-subsystem-model</Link> skill, then gist
              the portable document (no <code>repoRoot</code>).
            </p>
          </div>
        )}

        {state.status === 'loading' && (
          <div className="gist-empty">
            <p>Loading gist…</p>
          </div>
        )}

        {state.status === 'error' && (
          <div className="gist-empty gist-empty--error">
            <p>{state.message}</p>
            <ExampleList onOpen={openExample} />
          </div>
        )}

        {state.status === 'ready' && (
          <ThemeProvider theme={defaultEditorTheme}>
            <div className="gist-graph">
              <SubsystemComponentGraph
                key={`${state.gistId}:${state.fileName}:${refParam ?? 'main'}`}
                components={state.document.components}
                relations={state.document.relations}
                walkthroughs={state.document.walkthroughs}
                title={state.document.title}
                description={state.document.description}
                showEdgeLabels
                {...(githubRenderers ?? {})}
              />
            </div>
          </ThemeProvider>
        )}
      </div>
    </section>
  )
}

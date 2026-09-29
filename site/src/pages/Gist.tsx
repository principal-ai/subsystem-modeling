import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import '@xyflow/react/dist/style.css'
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme'
import { SubsystemComponentGraph } from '@principal-ai/subsystems-react'
import type { SubsystemModelDocument } from '@principal-ai/subsystems-core'
import { GistExampleList } from '../components/GistPicker'
import { loadSubsystemModelFromGist, parseGistId } from '../lib/gist'
import { makeGithubRenderers } from '../lib/githubFiles'

type LoadState =
  | { status: 'idle' }
  | { status: 'loading'; gistInput: string }
  | { status: 'ready'; document: SubsystemModelDocument; gistId: string; fileName: string }
  | { status: 'error'; message: string }

export function Gist() {
  const [searchParams, setSearchParams] = useSearchParams()
  const gistParam = searchParams.get('gist') ?? searchParams.get('url') ?? ''
  const fileParam = searchParams.get('file') ?? undefined
  const refParam = searchParams.get('ref') ?? undefined

  const [state, setState] = useState<LoadState>({ status: 'idle' })

  const load = useCallback(async (gistInput: string, fileName?: string) => {
    const id = parseGistId(gistInput)
    if (!id) {
      setState({
        status: 'error',
        message: 'This gist link is not valid.',
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
    if (!gistParam.trim()) return
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

  const githubRenderers = useMemo(() => {
    if (state.status !== 'ready') return null
    return makeGithubRenderers(state.document.components, refParam)
  }, [state, refParam])

  if (!gistParam.trim()) {
    return <Navigate to="/start#gist" replace />
  }

  return (
    <section className="gist-page">
      <div className="gist-stage">
        {(state.status === 'idle' || state.status === 'loading') && (
          <div className="gist-empty">
            <p>Loading gist…</p>
          </div>
        )}

        {state.status === 'error' && (
          <div className="gist-empty gist-empty--error">
            <p>{state.message}</p>
            <GistExampleList onOpen={openExample} />
          </div>
        )}

        {state.status === 'ready' && (
          <ThemeProvider theme={defaultEditorTheme}>
            <div className="gist-graph">
              <SubsystemComponentGraph
                key={`${state.gistId}:${state.fileName}:${refParam ?? 'main'}`}
                components={state.document.components}
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

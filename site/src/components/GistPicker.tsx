import { useNavigate } from 'react-router-dom'
import { GIST_EXAMPLES, gistExampleOwner } from '../showcase/gistExamples'

export function GistExampleList({ onOpen }: { onOpen: (gistId: string) => void }) {
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

/** Example models on Try it — opening one routes to the full-bleed viewer. */
export function GistPicker() {
  const navigate = useNavigate()

  const open = (gistId: string) => {
    const params = new URLSearchParams()
    params.set('gist', gistId)
    navigate(`/gist?${params.toString()}`)
  }

  return <GistExampleList onOpen={open} />
}

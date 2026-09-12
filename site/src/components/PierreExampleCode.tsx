import { useEffect, useState } from 'react'
import { createHighlighter, type Highlighter, type ThemedToken, type ThemeInput } from 'shiki'
import pierreDark from '@pierre/theme/pierre-dark'

let highlighterPromise: Promise<Highlighter> | null = null

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [pierreDark as unknown as ThemeInput],
      langs: ['typescript'],
    })
  }
  return highlighterPromise
}

type HighlightedLine = ThemedToken[]

/**
 * Static TypeScript snippet highlighted with Shiki + pierre-dark —
 * same stack Pierre File views use, without File virtualization
 * (which collapses to 0 height in auto-sized catalog cards).
 *
 * Renders one block per line so formatting never depends on Shiki's
 * `.line` span + whitespace quirks.
 */
export function PierreExampleCode({ code }: { code: string; fileName?: string }) {
  const [lines, setLines] = useState<HighlightedLine[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void getHighlighter()
      .then((highlighter) =>
        highlighter.codeToTokens(code, {
          lang: 'typescript',
          theme: 'pierre-dark',
        }),
      )
      .then((result) => {
        if (!cancelled) setLines(result.tokens)
      })
      .catch(() => {
        if (!cancelled) setLines(null)
      })
    return () => {
      cancelled = true
    }
  }, [code])

  if (!lines) {
    return (
      <pre className="maintainer-mechanism-example maintainer-mechanism-example--plain">
        <code>
          {code.split('\n').map((line, i) => (
            <span key={i} className="maintainer-code-line">
              {line.length ? line : '\u00a0'}
            </span>
          ))}
        </code>
      </pre>
    )
  }

  return (
    <pre className="maintainer-mechanism-example maintainer-mechanism-example--shiki">
      <code>
        {lines.map((line, i) => (
          <span key={i} className="maintainer-code-line">
            {line.length === 0
              ? '\u00a0'
              : line.map((token, j) => (
                  <span key={j} style={token.color ? { color: token.color } : undefined}>
                    {token.content}
                  </span>
                ))}
          </span>
        ))}
      </code>
    </pre>
  )
}

import type { ReactNode } from 'react'
import {
  PierreFileView,
  PierreWalkthroughCodeView,
  type WalkthroughViewerContext,
} from '@principal-ai/subsystems-react'
import type { SubsystemComponent } from '@principal-ai/subsystems-core'

const PURL_GITHUB = /^pkg:github\/([^/@]+)\/([^@#]+)(?:@([^#]+))?(?:#(.+))?$/i

export interface GithubRepoRef {
  owner: string
  name: string
  /** Branch, tag, or commit SHA. Defaults to main. */
  ref: string
}

export function parseGithubPurl(purl: string | undefined): Omit<GithubRepoRef, 'ref'> | null {
  if (!purl) return null
  const m = PURL_GITHUB.exec(purl.trim())
  if (!m) return null
  return { owner: m[1]!, name: m[2]! }
}

/** Prefer an explicit ref, else `@ref` in a purl, else `main`. */
export function resolveDefaultRepo(
  components: SubsystemComponent[],
  refOverride?: string,
): GithubRepoRef | null {
  for (const c of components) {
    const parsed = parseGithubPurl(c.purl)
    if (!parsed) continue
    const m = c.purl ? PURL_GITHUB.exec(c.purl.trim()) : null
    const purlRef = m?.[3]
    return {
      owner: parsed.owner,
      name: parsed.name,
      ref: refOverride?.trim() || purlRef || 'main',
    }
  }
  return null
}

function repoForPath(
  path: string,
  components: SubsystemComponent[],
  fallback: GithubRepoRef,
): GithubRepoRef {
  const norm = path.replace(/^\.?\//, '')
  const match = components.find((c) => c.file?.replace(/^\.?\//, '') === norm)
  const parsed = parseGithubPurl(match?.purl)
  if (!parsed) return fallback
  const m = match?.purl ? PURL_GITHUB.exec(match.purl.trim()) : null
  return {
    owner: parsed.owner,
    name: parsed.name,
    ref: m?.[3] || fallback.ref,
  }
}

/**
 * Browser reader for public GitHub source via raw.githubusercontent.com.
 * Paths are repo-root-relative (same as Subsystem Model `file` fields).
 */
export function makeGithubReadFile(
  components: SubsystemComponent[],
  refOverride?: string,
): ((path: string) => Promise<string>) | null {
  const fallback = resolveDefaultRepo(components, refOverride)
  if (!fallback) return null

  const cache = new Map<string, Promise<string>>()

  return (path: string) => {
    const repo = repoForPath(path, components, fallback)
    const rel = path.replace(/^\.?\//, '')
    const key = `${repo.owner}/${repo.name}@${repo.ref}:${rel}`
    const cached = cache.get(key)
    if (cached) return cached

    const url = `https://raw.githubusercontent.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/${encodeURIComponent(repo.ref)}/${rel
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`

    const promise = fetch(url).then(async (res) => {
      if (!res.ok) {
        return [
          `// ${rel}`,
          '//',
          `// Could not load from GitHub (${res.status}).`,
          `// ${url}`,
          '//',
          '// Public repos only from this static site; private sources need auth/proxy.',
        ].join('\n') + '\n'
      }
      return res.text()
    })

    cache.set(key, promise)
    return promise
  }
}

export function makeGithubRenderers(
  components: SubsystemComponent[],
  refOverride?: string,
): {
  renderFileViewer: (file: string) => ReactNode
  renderWalkthroughViewer: (ctx: WalkthroughViewerContext) => ReactNode
} | null {
  const readFile = makeGithubReadFile(components, refOverride)
  if (!readFile) return null

  return {
    renderFileViewer: (file) => (
      <PierreFileView
        filePath={file}
        fileName={file.split('/').pop() ?? file}
        readFile={readFile}
      />
    ),
    renderWalkthroughViewer: (ctx) => (
      <PierreWalkthroughCodeView
        walkthrough={ctx.walkthrough}
        stepIndex={ctx.stepIndex}
        readFile={readFile}
      />
    ),
  }
}

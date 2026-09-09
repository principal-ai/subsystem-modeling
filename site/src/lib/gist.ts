import {
  isSubsystemModelDocument,
  type SubsystemModelDocument,
} from '@principal-ai/subsystems-core'

export type GistLoadResult =
  | { ok: true; document: SubsystemModelDocument; gistId: string; fileName: string }
  | { ok: false; error: string }

/** Extract a gist id from a bare id or common gist.github.com URL. */
export function parseGistId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  if (/^[a-f0-9]{32}$/i.test(trimmed) || /^[a-f0-9]{20,}$/i.test(trimmed)) {
    return trimmed.toLowerCase()
  }

  try {
    const url = new URL(trimmed)
    if (!/(^|\.)gist\.github\.com$/i.test(url.hostname)) return null
    const parts = url.pathname.split('/').filter(Boolean)
    // /:user/:id or /:id
    const candidate = parts.length >= 2 ? parts[1]! : parts[0]
    if (candidate && /^[a-f0-9]{20,}$/i.test(candidate)) {
      return candidate.toLowerCase()
    }
  } catch {
    // not a URL
  }

  return null
}

interface GistApiFile {
  filename?: string
  language?: string
  type?: string
  raw_url?: string
  content?: string
  truncated?: boolean
}

interface GistApiResponse {
  files?: Record<string, GistApiFile>
  message?: string
}

function pickModelFile(
  files: Record<string, GistApiFile>,
  preferredName?: string,
): { name: string; file: GistApiFile } | null {
  const entries = Object.entries(files)
  if (preferredName) {
    const exact = entries.find(([name]) => name === preferredName)
    if (exact) return { name: exact[0], file: exact[1]! }
  }

  const json =
    entries.find(([name]) => name.toLowerCase().endsWith('.json')) ??
    entries.find(([, f]) => f.language === 'JSON' || f.type === 'application/json')
  if (json) return { name: json[0], file: json[1]! }

  return entries[0] ? { name: entries[0][0], file: entries[0][1]! } : null
}

async function readGistFileContent(file: GistApiFile): Promise<string> {
  if (file.content && !file.truncated) return file.content
  if (!file.raw_url) {
    throw new Error('Gist file has no content and no raw_url')
  }
  const res = await fetch(file.raw_url)
  if (!res.ok) {
    throw new Error(`Failed to fetch gist raw file (${res.status})`)
  }
  return res.text()
}

/**
 * Fetch a public gist and parse its portable Subsystem Model JSON.
 * Prefer a `.json` file; override with `fileName` when the gist has several.
 */
export async function loadSubsystemModelFromGist(
  gistInput: string,
  opts?: { fileName?: string },
): Promise<GistLoadResult> {
  const gistId = parseGistId(gistInput)
  if (!gistId) {
    return { ok: false, error: 'Enter a gist id or gist.github.com URL.' }
  }

  let res: Response
  try {
    res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
  } catch {
    return { ok: false, error: 'Network error fetching gist.' }
  }

  if (res.status === 404) {
    return { ok: false, error: 'Gist not found (is it public?).' }
  }
  if (!res.ok) {
    return { ok: false, error: `GitHub gist API error (${res.status}).` }
  }

  let payload: GistApiResponse
  try {
    payload = (await res.json()) as GistApiResponse
  } catch {
    return { ok: false, error: 'Gist response was not JSON.' }
  }

  if (!payload.files || Object.keys(payload.files).length === 0) {
    return { ok: false, error: 'Gist has no files.' }
  }

  const picked = pickModelFile(payload.files, opts?.fileName)
  if (!picked) {
    return { ok: false, error: 'Could not pick a file from the gist.' }
  }

  let text: string
  try {
    text = await readGistFileContent(picked.file)
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Failed to read gist file content.',
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return {
      ok: false,
      error: `File “${picked.name}” is not valid JSON.`,
    }
  }

  if (!isSubsystemModelDocument(parsed)) {
    return {
      ok: false,
      error:
        'JSON is not a portable Subsystem Model (needs title, components[], edges[]).',
    }
  }

  return {
    ok: true,
    document: toPortableDocument(parsed),
    gistId,
    fileName: picked.name,
  }
}

/** Keep only portable fields — drop host bindings if someone gist’d a hydrated model. */
function toPortableDocument(doc: SubsystemModelDocument): SubsystemModelDocument {
  const out: SubsystemModelDocument = {
    title: doc.title,
    components: doc.components,
    edges: doc.edges,
  }
  if (doc.$schema) out.$schema = doc.$schema
  if (doc.description) out.description = doc.description
  if (doc.throughlines) out.throughlines = doc.throughlines
  return out
}

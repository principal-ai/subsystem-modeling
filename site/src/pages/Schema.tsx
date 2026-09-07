import { JsonSchemaViewer } from '@stoplight/json-schema-viewer'
import { Provider as MosaicProvider } from '@stoplight/mosaic'
import type { JSONSchema7 } from 'json-schema'
import { useEffect, useState } from 'react'
import subsystemModelSchema from '@schemas/subsystem-model.schema.json'
import '@stoplight/mosaic/styles.css'

const schema = subsystemModelSchema as unknown as JSONSchema7
const schemaText = JSON.stringify(subsystemModelSchema, null, 2)
const SCHEMA_GITHUB_URL =
  'https://github.com/principal-ai/subsystem-modeling/blob/main/packages/subsystems-core/schemas/subsystem-model.schema.json'
const STUDIO_URL = 'https://studio.ioflux.org'

function useColorScheme(): 'light' | 'dark' {
  const [scheme, setScheme] = useState<'light' | 'dark'>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setScheme(media.matches ? 'dark' : 'light')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return scheme
}

function IconCopy() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
      <path d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H6zM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1v1H2z" />
    </svg>
  )
}

function IconExternal() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
      <path d="M6.22 8.72a.75.75 0 0 0 1.06 1.06l5.22-5.22v1.69a.75.75 0 0 0 1.5 0V3.75A.75.75 0 0 0 13.25 3H9.75a.75.75 0 0 0 0 1.5h1.69L6.22 8.72z" />
      <path d="M3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 0 0 7 4H4.75A2.75 2.75 0 0 0 2 6.75v4.5A2.75 2.75 0 0 0 4.75 14h4.5A2.75 2.75 0 0 0 12 11.25V9a.75.75 0 0 0-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5z" />
    </svg>
  )
}

export function Schema() {
  const colorScheme = useColorScheme()
  const [copied, setCopied] = useState(false)

  async function copySchema() {
    try {
      await navigator.clipboard.writeText(schemaText)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section className="schema-page">
      <header className="schema-header">
        <div className="schema-heading">
          <h1>Subsystem Model Schema</h1>
          <a
            className="schema-path"
            href={SCHEMA_GITHUB_URL}
            target="_blank"
            rel="noreferrer"
          >
            <code>packages/subsystems-core/schemas/subsystem-model.schema.json</code>
          </a>
        </div>
        <div className="schema-actions">
          <button type="button" className="schema-action" onClick={copySchema}>
            <IconCopy />
            {copied ? 'Copied' : 'Copy schema'}
          </button>
          <a className="schema-action" href={STUDIO_URL} target="_blank" rel="noreferrer">
            <IconExternal />
            Open in JSON Schema Studio
          </a>
        </div>
      </header>

      <div className="schema-viewer" data-theme={colorScheme}>
        <MosaicProvider>
          <JsonSchemaViewer
            schema={schema}
            emptyText="No schema defined"
            defaultExpandedDepth={0}
            renderRootTreeLines
            skipTopLevelDescription
          />
        </MosaicProvider>
      </div>
    </section>
  )
}

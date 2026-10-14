import { Suspense, lazy } from 'react'

const SubsystemModelCanvas = lazy(() =>
  import('./SubsystemModelCanvas').then((m) => ({ default: m.SubsystemModelCanvas })),
)

const SUBSYSTEM_MODEL_JSON = `{
  "title": "Checkout",
  "components": [
    {
      "alias": "checkout-api",
      "construct": "function", "symbol": "checkoutApi",
      "role": "entry", "purl": "pkg:github/you/your-app",
      "file": "src/checkout/api.ts"
    },
    {
      "alias": "cart-store",
      "construct": "store", "symbol": "cartStore",
      "purl": "pkg:github/you/your-app",
      "file": "src/checkout/cartStore.ts"
    },
    {
      "alias": "Stripe",
      "construct": "external", "role": "service",
      "purl": "external"
    },
    {
      "alias": "Web client",
      "construct": "external", "purl": "external"
    }
  ],
  "trails": [
    {
      "id": "wt-checkout",
      "title": "Checkout",
      "steps": [
        {
          "from": "Web client", "to": "checkout-api",
          "mechanism": "calls",
          "file": "src/checkout/api.ts",
          "span": { "startLine": 1, "endLine": 1, "contentHash": "edc66d36b0aa68b622e78e9ffe830b00" }
        },
        {
          "from": "checkout-api", "to": "cart-store",
          "mechanism": "writes",
          "file": "src/checkout/api.ts",
          "span": { "startLine": 12, "endLine": 12, "contentHash": "9e242a85bb83b331b7ece1e48b234b1c" }
        },
        {
          "from": "checkout-api", "to": "Stripe",
          "mechanism": "calls",
          "file": "src/checkout/api.ts",
          "span": { "startLine": 24, "endLine": 24, "contentHash": "111f9d50f5852db9e9b7347b07e0a9fd" }
        }
      ]
    }
  ]
}`

interface JsonPiece {
  text: string
  cls?: string
}

const JSON_TOKEN_RE =
  /"(?:[^"\\]|\\.)*"(\s*:)|"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?|\b(?:true|false|null)\b/g

function highlightJson(code: string): JsonPiece[] {
  const pieces: JsonPiece[] = []
  let last = 0
  for (const m of code.matchAll(JSON_TOKEN_RE)) {
    const idx = m.index
    if (idx > last) pieces.push({ text: code.slice(last, idx) })
    if (m[1]) {
      pieces.push({ text: m[0].slice(0, m[0].length - m[1].length), cls: 'j-key' })
      pieces.push({ text: m[1] })
    } else if (m[0].startsWith('"')) {
      pieces.push({ text: m[0], cls: 'j-str' })
    } else if (m[0] === 'true' || m[0] === 'false' || m[0] === 'null') {
      pieces.push({ text: m[0], cls: 'j-kw' })
    } else {
      pieces.push({ text: m[0], cls: 'j-num' })
    }
    last = idx + m[0].length
  }
  if (last < code.length) pieces.push({ text: code.slice(last) })
  return pieces
}

export function HeroGraphic() {
  return (
    <div className="graphic-window">
      <div className="graphic-titlebar">
        <div className="graphic-dots" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <span className="graphic-filename">checkout.subsystem-model.json</span>
        <span className="graphic-badge">Subsystem Model</span>
      </div>
      <div className="graphic-panes">
        <pre className="graphic-json">
          {highlightJson(SUBSYSTEM_MODEL_JSON).map((p, i) =>
            p.cls ? (
              <span key={i} className={p.cls}>
                {p.text}
              </span>
            ) : (
              <span key={i}>{p.text}</span>
            ),
          )}
        </pre>
        <div className="graphic-graph">
          <div className="graphic-graph-canvas">
            <Suspense fallback={<div className="graphic-graph-loading" />}>
              <SubsystemModelCanvas />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  )
}

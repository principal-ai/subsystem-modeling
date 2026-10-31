import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type * as THREE from 'three'
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme'
// Deep import: the package barrel pulls shiki/markdown and ~5MB into the
// bundle; the subsystem module alone is what the hero needs.
import { SubsystemComponentGraph } from '@principal-ai/subsystems-react/dist/subsystem/SubsystemComponentGraph.js'
import type {
  SubsystemComponent,
  SubsystemNodeRect,
  SubsystemTrail,
} from '@principal-ai/subsystems-react'
import {
  CodeCityBuilderWithGrid,
  buildFileSystemTreeFromFileInfoList,
} from '@principal-ai/file-city-builder'
import type { CityData } from '@principal-ai/file-city-builder'
import {
  FileCity3D,
  calculateBuildingHeight,
  projectToCanvas,
  rotateCameraTo,
  tiltCameraTo,
} from '@principal-ai/file-city-react'
import type { FileCity3DHighlightLayer, OnCameraFrame } from '@principal-ai/file-city-react'
import './HeroCityGraph.css'

// ---------------------------------------------------------------------------
// Synthetic repo → city. Paths the subsystem anchors to must exist here.
// ---------------------------------------------------------------------------

const REPO_FILES: Array<{ path: string; lineCount: number }> = [
  { path: 'src/checkout/api.ts', lineCount: 240 },
  { path: 'src/checkout/validate.ts', lineCount: 90 },
  { path: 'src/checkout/pricing.ts', lineCount: 140 },
  { path: 'src/checkout/receipt.ts', lineCount: 70 },
  { path: 'src/cart/cartStore.ts', lineCount: 180 },
  { path: 'src/cart/cartSelectors.ts', lineCount: 60 },
  { path: 'src/cart/cartEvents.ts', lineCount: 45 },
  { path: 'src/payments/stripeClient.ts', lineCount: 210 },
  { path: 'src/payments/webhooks.ts', lineCount: 120 },
  { path: 'src/payments/types.ts', lineCount: 40 },
  { path: 'src/orders/ordersRepo.ts', lineCount: 160 },
  { path: 'src/orders/orderStatus.ts', lineCount: 55 },
  { path: 'src/orders/migrations/001_init.sql', lineCount: 80 },
  { path: 'src/orders/migrations/002_status.sql', lineCount: 30 },
  { path: 'src/catalog/products.ts', lineCount: 130 },
  { path: 'src/catalog/search.ts', lineCount: 95 },
  { path: 'src/catalog/inventory.ts', lineCount: 110 },
  { path: 'src/auth/session.ts', lineCount: 85 },
  { path: 'src/auth/middleware.ts', lineCount: 65 },
  { path: 'src/ui/App.tsx', lineCount: 120 },
  { path: 'src/ui/CheckoutPage.tsx', lineCount: 200 },
  { path: 'src/ui/CartDrawer.tsx', lineCount: 150 },
  { path: 'src/ui/ProductGrid.tsx', lineCount: 170 },
  { path: 'src/ui/components/Button.tsx', lineCount: 40 },
  { path: 'src/ui/components/Modal.tsx', lineCount: 75 },
  { path: 'src/ui/components/Price.tsx', lineCount: 30 },
  { path: 'src/ui/hooks/useCart.ts', lineCount: 60 },
  { path: 'src/ui/hooks/useCheckout.ts', lineCount: 80 },
  { path: 'src/ui/styles/global.css', lineCount: 220 },
  { path: 'src/lib/http.ts', lineCount: 70 },
  { path: 'src/lib/logger.ts', lineCount: 50 },
  { path: 'src/lib/env.ts', lineCount: 35 },
  { path: 'src/index.ts', lineCount: 40 },
  { path: 'tests/checkout.test.ts', lineCount: 180 },
  { path: 'tests/cart.test.ts', lineCount: 120 },
  { path: 'tests/payments.test.ts', lineCount: 140 },
  { path: 'tests/fixtures/orders.json', lineCount: 300 },
  { path: 'package.json', lineCount: 60 },
  { path: 'tsconfig.json', lineCount: 25 },
  { path: 'README.md', lineCount: 90 },
]

type FileInfo = Parameters<typeof buildFileSystemTreeFromFileInfoList>[0][number]

function buildCity(): CityData {
  const infos: FileInfo[] = REPO_FILES.map((f) => ({
    name: f.path.split('/').pop() || f.path,
    path: f.path,
    relativePath: f.path,
    size: f.lineCount * 38,
    lineCount: f.lineCount,
    extension: f.path.includes('.') ? '.' + (f.path.split('.').pop() || '') : '',
    lastModified: new Date(),
    isDirectory: false,
  }))
  const tree = buildFileSystemTreeFromFileInfoList(infos, 'shop')
  return new CodeCityBuilderWithGrid().buildCityFromFileSystem(tree, '', {
    paddingTop: 2,
    paddingBottom: 2,
    paddingLeft: 2,
    paddingRight: 2,
    paddingInner: 1,
    paddingOuter: 3,
  })
}

const HEIGHT_SCALING = 'linear' as const

/**
 * Linear height scale so the tallest file reaches about an eighth of the
 * city's footprint: a low-rise base the graph can float over.
 */
function heightScaleFor(cityData: CityData): number {
  const { minX, maxX, minZ, maxZ } = cityData.bounds
  const citySize = Math.max(maxX - minX, maxZ - minZ)
  const units = cityData.buildings.map((b) =>
    b.lineCount !== undefined ? b.lineCount : (b.size ?? 0) / 1024,
  )
  return (citySize * 0.12) / Math.max(1, ...units)
}

// ---------------------------------------------------------------------------
// The "Checkout" subsystem model
// ---------------------------------------------------------------------------

const PURL = 'pkg:github/you/your-app'
const stepPurl = (file: string) => `${PURL}#${file}`

const components: SubsystemComponent[] = [
  {
    alias: 'Web client',
    name: 'Web client',
    construct: 'external',
    file: '',
    purl: 'external',
  },
  {
    alias: 'checkout-api',
    name: 'checkoutApi',
    construct: 'function',
    symbol: 'checkoutApi',
    role: 'entry',
    purl: PURL,
    file: 'src/checkout/api.ts',
    process: 'your-app/server',
  },
  {
    alias: 'cart-store',
    name: 'CartStore',
    construct: 'store',
    symbol: 'CartStore',
    purl: PURL,
    file: 'src/cart/cartStore.ts',
    process: 'your-app/server',
  },
  {
    alias: 'payments',
    name: 'StripeClient',
    construct: 'class',
    symbol: 'StripeClient',
    purl: PURL,
    file: 'src/payments/stripeClient.ts',
    process: 'your-app/server',
  },
  {
    alias: 'orders-repo',
    name: 'OrdersRepo',
    construct: 'class',
    symbol: 'OrdersRepo',
    purl: PURL,
    file: 'src/orders/ordersRepo.ts',
    process: 'your-app/server',
  },
  {
    alias: 'Stripe',
    name: 'Stripe',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
  },
]

const trails: SubsystemTrail[] = [
  {
    id: 'wt-checkout',
    title: 'Checkout',
    steps: [
      { from: 'Web client', to: 'checkout-api', mechanism: 'calls', file: 'src/checkout/api.ts', span: { startLine: 12, endLine: 12, contentHash: 'hero' }, purl: stepPurl('src/checkout/api.ts'), symbol: 'checkoutApi' },
      { from: 'checkout-api', to: 'cart-store', mechanism: 'reads', file: 'src/checkout/api.ts', span: { startLine: 18, endLine: 18, contentHash: 'hero' }, purl: stepPurl('src/checkout/api.ts'), symbol: 'checkoutApi.loadCart' },
      { from: 'checkout-api', to: 'payments', mechanism: 'calls', file: 'src/checkout/api.ts', span: { startLine: 24, endLine: 24, contentHash: 'hero' }, purl: stepPurl('src/checkout/api.ts'), symbol: 'checkoutApi.charge' },
      { from: 'payments', to: 'Stripe', mechanism: 'calls', file: 'src/payments/stripeClient.ts', span: { startLine: 31, endLine: 31, contentHash: 'hero' }, purl: stepPurl('src/payments/stripeClient.ts'), symbol: 'StripeClient.charge' },
      { from: 'checkout-api', to: 'orders-repo', mechanism: 'writes', file: 'src/checkout/api.ts', span: { startLine: 30, endLine: 30, contentHash: 'hero' }, purl: stepPurl('src/checkout/api.ts'), symbol: 'checkoutApi.save' },
    ],
  },
]

/** Components anchored to a file, in the order the trail first reaches them. */
const ANCHORED: Array<{ alias: string; file: string }> = (() => {
  const byAlias = new Map(components.map((c) => [c.alias, c]))
  const out: Array<{ alias: string; file: string }> = []
  const seen = new Set<string>()
  for (const step of trails[0].steps) {
    for (const alias of [step.from, step.to]) {
      const c = byAlias.get(alias)
      if (!c?.file || seen.has(alias)) continue
      seen.add(alias)
      out.push({ alias, file: c.file })
    }
  }
  return out
})()

const ACCENT = '#2dd4bf'

// Tilt is measured from straight down (0 = top-down, 90 = level). The default
// grown pose sits near 49; this reads as "more isometric" and leaves room
// above the city for the graph.
const CAMERA_AZIMUTH = 30
const CAMERA_TILT = 69

/** Beats after the camera first frames the city, in ms. */
const T_COLLAPSE = 1600
const T_TILT = 2400
const T_GRAPH = 3600
const T_WALK = T_GRAPH + 1800

type Phase = 'city' | 'graph' | 'walk'

/**
 * Hero: a File City of the repo as the base, with the Checkout Subsystem Model
 * graph projected above it. The non-subsystem buildings collapse, the camera
 * tilts, the graph fades in, and beams tie each node to the file it names.
 * Then the trail walks step by step.
 */
export function HeroCityGraph() {
  const cityData = useMemo(() => buildCity(), [])
  const heightScale = useMemo(() => heightScaleFor(cityData), [cityData])
  const [isolate, setIsolate] = useState(false)
  const [phase, setPhase] = useState<Phase>('city')
  const [layoutReady, setLayoutReady] = useState(false)
  /** Aliases lit by the active autoplay step; null = nothing dimmed. */
  const [litAliases, setLitAliases] = useState<Set<string> | null>(null)

  const rootRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<HTMLDivElement>(null)
  const beamRefs = useRef(new Map<string, SVGGElement>())
  const rectsRef = useRef(new Map<string, SubsystemNodeRect>())
  const roofPxRef = useRef(new Map<string, { x: number; y: number; visible: boolean }>())

  const highlightLayers = useMemo<FileCity3DHighlightLayer[]>(
    () => [
      {
        id: 'subsystem',
        name: 'Checkout subsystem',
        enabled: true,
        priority: 1,
        color: ACCENT,
        // No fill strategy: anchored files keep their file-type color and
        // stand out by being the only buildings left standing.
        items: ANCHORED.map((a) => ({ path: a.file, type: 'file' as const })),
      },
    ],
    [],
  )

  // World-space roof points. FileCity3D centers the city on the origin, so
  // building positions shift by the bounds center.
  const roofs = useMemo(() => {
    const byPath = new Map(cityData.buildings.map((b) => [b.path, b]))
    const { minX, maxX, minZ, maxZ } = cityData.bounds
    const cx = (minX + maxX) / 2
    const cz = (minZ + maxZ) / 2
    const out = new Map<string, { x: number; y: number; z: number }>()
    for (const a of ANCHORED) {
      const b = byPath.get(a.file)
      if (!b) continue
      out.set(a.alias, {
        x: b.position.x - cx,
        y: calculateBuildingHeight(b, HEIGHT_SCALING, heightScale),
        z: b.position.z - cz,
      })
    }
    return out
  }, [cityData, heightScale])

  /** Lay each beam from its node's bottom edge down to its roof. */
  const redraw = useCallback(() => {
    const root = rootRef.current
    const graph = graphRef.current
    if (!root || !graph) return
    const rootBox = root.getBoundingClientRect()
    const graphBox = graph.getBoundingClientRect()
    const ox = graphBox.left - rootBox.left
    const oy = graphBox.top - rootBox.top
    for (const a of ANCHORED) {
      const g = beamRefs.current.get(a.alias)
      const rect = rectsRef.current.get(a.alias)
      const roof = roofPxRef.current.get(a.alias)
      if (!g) continue
      if (!rect || !roof || !roof.visible) {
        g.style.visibility = 'hidden'
        continue
      }
      g.style.visibility = ''
      const sx = ox + rect.x + rect.width / 2
      const sy = oy + rect.y + rect.height
      const k = Math.max(24, (roof.y - sy) * 0.45)
      const d = `M ${sx} ${sy} C ${sx} ${sy + k}, ${roof.x} ${roof.y - k}, ${roof.x} ${roof.y}`
      for (const p of g.querySelectorAll('path')) p.setAttribute('d', d)
      const ring = g.querySelector('ellipse')
      if (ring) {
        ring.setAttribute('cx', String(roof.x))
        ring.setAttribute('cy', String(roof.y))
      }
    }
  }, [])

  const onCameraFrame = useCallback<OnCameraFrame>(
    (camera: THREE.Camera, size) => {
      for (const [alias, w] of roofs) {
        const p = projectToCanvas(camera, size, w)
        roofPxRef.current.set(alias, { x: p.x, y: p.y, visible: p.visible })
      }
      redraw()
    },
    [roofs, redraw],
  )

  const onNodeRects = useCallback(
    (rects: SubsystemNodeRect[]) => {
      rectsRef.current = new Map(rects.map((r) => [r.alias, r]))
      redraw()
    },
    [redraw],
  )

  // Beats: hold the full city, sink everything outside the subsystem, swing
  // the camera into the diagram pose, bring the graph in, then walk the trail.
  const onCameraReady = useCallback(() => {
    const timers = [
      setTimeout(() => setIsolate(true), T_COLLAPSE),
      setTimeout(() => {
        rotateCameraTo(CAMERA_AZIMUTH, { duration: 1100 })
        tiltCameraTo(CAMERA_TILT, { duration: 1100 })
      }, T_TILT),
      setTimeout(() => setPhase('graph'), T_GRAPH),
      setTimeout(() => setPhase('walk'), T_WALK),
    ]
    return () => timers.forEach(clearTimeout)
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const ro = new ResizeObserver(() => redraw())
    ro.observe(root)
    return () => ro.disconnect()
  }, [redraw])

  const graphVisible = phase !== 'city' && layoutReady

  return (
    <div ref={rootRef} className="hero-city">
      <FileCity3D
        cityData={cityData}
        width="100%"
        height="100%"
        backgroundColor="transparent"
        heightScaling={HEIGHT_SCALING}
        linearScale={heightScale}
        animation={{ startFlat: false }}
        highlightLayers={isolate ? highlightLayers : undefined}
        isolationMode="collapse"
        showInfoPanel={false}
        // Frame the city in the lower half; the graph owns the top.
        safeArea={{ left: 0.06, top: 0.5, right: 0.06, bottom: 0.06 }}
        onCameraReady={onCameraReady}
        onCameraFrame={onCameraFrame}
      />

      <div className={`hero-city-grid${graphVisible ? ' is-on' : ''}`} aria-hidden="true" />

      <div ref={graphRef} className={`hero-city-graph${graphVisible ? ' is-on' : ''}`}>
        <ThemeProvider theme={defaultEditorTheme}>
          <SubsystemComponentGraph
            components={components}
            trails={trails}
            hideSidebar
            hideDrawer
            hideLayoutToggle
            layoutDirection="horizontal"
            edgeView="trails"
            initialTrailId="wt-checkout"
            interactive={false}
            canvasBackground="transparent"
            trailStepMode="dim"
            zoomOnTrailFocus={false}
            autoPlayTrails={phase === 'walk'}
            trailAutoPlayIntervalMs={2200}
            onLayoutReady={() => setLayoutReady(true)}
            onAutoPlayStep={(ref) => {
              const step = ref ? trails.find((t) => t.id === ref.trailId)?.steps[ref.stepIndex] : undefined
              setLitAliases(step ? new Set([step.from, step.to]) : null)
            }}
            onNodeRects={onNodeRects}
          />
        </ThemeProvider>
      </div>

      <svg className={`hero-city-beams${graphVisible ? ' is-on' : ''}`} aria-hidden="true">
        <defs>
          <linearGradient id="hero-beam-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={ACCENT} stopOpacity="0.95" />
            <stop offset="1" stopColor={ACCENT} stopOpacity="0.35" />
          </linearGradient>
        </defs>
        {ANCHORED.map((a, i) => (
          <g
            key={a.alias}
            ref={(el) => {
              if (el) beamRefs.current.set(a.alias, el)
              else beamRefs.current.delete(a.alias)
            }}
            className={`hero-city-beam${litAliases && !litAliases.has(a.alias) ? ' is-dim' : ''}`}
            style={{ '--delay': `${i * 160}ms` } as CSSProperties}
          >
            <path className="hero-city-beam-glow" pathLength={1} />
            <path className="hero-city-beam-core" pathLength={1} />
            <ellipse className="hero-city-beam-ring" rx={7} ry={3.5} />
          </g>
        ))}
      </svg>
    </div>
  )
}

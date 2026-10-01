export type MaintainerSectionId =
  | 'overview'
  | 'issues'
  | 'construct'
  | 'static-topology'
  | 'dynamic-topology'
  | 'trail'
  | 'reference'
  | 'gaps'

export type MaintainerSection = {
  id: MaintainerSectionId
  path: string
  label: string
  /** Short TOC / pager label when different from page title. */
  shortLabel?: string
  children?: { id: string; label: string }[]
}

export const MAINTAINER_SECTIONS: MaintainerSection[] = [
  {
    id: 'overview',
    path: '/maintainer',
    label: 'Overview',
  },
  {
    id: 'issues',
    path: '/maintainer/issues',
    label: 'Issues',
    shortLabel: 'Issues & fixes',
  },
  {
    id: 'construct',
    path: '/maintainer/construct',
    label: 'Construct',
    children: [
      { id: 'source-checks', label: 'Source checks' },
      { id: 'graphify-checks', label: 'Graphify checks' },
      { id: 'construct-agents', label: 'Construct agents' },
    ],
  },
  {
    id: 'static-topology',
    path: '/maintainer/static-topology',
    label: 'Static topology',
    children: [
      { id: 'package-module-membership', label: 'Package & module' },
      { id: 'module-membership-agents', label: 'Module agents' },
    ],
  },
  {
    id: 'dynamic-topology',
    path: '/maintainer/dynamic-topology',
    label: 'Dynamic topology',
    children: [
      { id: 'process-boundary-checks', label: 'Process' },
      { id: 'process-boundary-agents', label: 'Process agents' },
    ],
  },
  {
    id: 'trail',
    path: '/maintainer/trail',
    label: 'Trail',
    children: [
      { id: 'step-mechanisms', label: 'Step mechanisms' },
      { id: 'trail-mechanical-checks', label: 'Mechanical checks' },
      { id: 'how-to-inspect', label: 'How to inspect' },
    ],
  },
  {
    id: 'reference',
    path: '/maintainer/reference',
    label: 'Reference',
    children: [
      { id: 'the-loop', label: 'The loop' },
      { id: 'verdicts', label: 'Verdicts' },
      { id: 'issue-vs-unconfirmed', label: 'Issue vs unconfirmed' },
    ],
  },
  {
    id: 'gaps',
    path: '/maintainer/gaps',
    label: 'Diagramming gaps',
    shortLabel: 'Gaps',
    children: [
      { id: 'store-behind-accessor', label: 'Store behind an accessor' },
      { id: 'store-value-type', label: 'Store value type' },
      { id: 'graphify-vocabulary', label: 'Graphify vocabulary' },
      { id: 'store-two-nodes', label: 'Class-mediated store' },
      { id: 'closure-local-anchor', label: 'Non-addressable state' },
    ],
  },
]

export function sectionByPath(pathname: string): MaintainerSection | undefined {
  const exact = MAINTAINER_SECTIONS.find((s) => s.path === pathname)
  if (exact) return exact
  return MAINTAINER_SECTIONS.find(
    (s) => s.path !== '/maintainer' && pathname.startsWith(s.path),
  )
}

export function neighborSections(id: MaintainerSectionId): {
  prev: MaintainerSection | null
  next: MaintainerSection | null
} {
  const i = MAINTAINER_SECTIONS.findIndex((s) => s.id === id)
  return {
    prev: i > 0 ? (MAINTAINER_SECTIONS[i - 1] ?? null) : null,
    next:
      i >= 0 && i < MAINTAINER_SECTIONS.length - 1
        ? (MAINTAINER_SECTIONS[i + 1] ?? null)
        : null,
  }
}

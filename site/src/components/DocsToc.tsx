import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  MAINTAINER_SECTIONS,
  sectionByPath,
} from '../pages/maintainer/sections'

function flattenChildIds(
  sections: typeof MAINTAINER_SECTIONS,
): string[] {
  const ids: string[] = []
  for (const s of sections) {
    if (s.children) {
      for (const c of s.children) ids.push(c.id)
    }
  }
  return ids
}

const IN_PAGE_HEADING_IDS = flattenChildIds(MAINTAINER_SECTIONS)

function useActiveInPageHeading(enabled: boolean): string | null {
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setActive(null)
      return
    }

    const root = document.getElementById('root')
    const visible = new Set<string>()

    const pick = () => {
      let current: string | null = null
      let currentTop = Number.POSITIVE_INFINITY
      for (const id of IN_PAGE_HEADING_IDS) {
        if (!visible.has(id)) continue
        const el = document.getElementById(id)
        if (!el) continue
        const top = el.getBoundingClientRect().top
        if (top < currentTop) {
          current = id
          currentTop = top
        }
      }
      setActive(current)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        pick()
      },
      {
        root,
        rootMargin: '0px 0px -70% 0px',
        threshold: 0,
      },
    )

    for (const id of IN_PAGE_HEADING_IDS) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }

    pick()
    return () => observer.disconnect()
  }, [enabled])

  return active
}

function TocLinks({
  pathname,
  activeHeadingId,
  schemaCurrent,
}: {
  pathname: string
  activeHeadingId: string | null
  schemaCurrent: boolean
}) {
  const currentSection = sectionByPath(pathname)

  return (
    <>
      <p className="docs-toc-label">Docs</p>
      <ul className="docs-toc-list">
        {MAINTAINER_SECTIONS.map((section) => {
          const sectionCurrent = currentSection?.id === section.id
          return (
            <li key={section.id}>
              <Link
                to={section.path}
                aria-current={sectionCurrent ? 'page' : undefined}
              >
                {section.label}
              </Link>
              {section.children && sectionCurrent ? (
                <ul className="docs-toc-list docs-toc-list--nested">
                  {section.children.map((child) => (
                    <li key={child.id}>
                      <Link
                        to={`${section.path}#${child.id}`}
                        aria-current={
                          activeHeadingId === child.id ? 'location' : undefined
                        }
                      >
                        {child.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          )
        })}
      </ul>
      <p className="docs-toc-label docs-toc-label--page">Also</p>
      <ul className="docs-toc-list">
        <li>
          <Link to="/schema" aria-current={schemaCurrent ? 'page' : undefined}>
            Schema
          </Link>
        </li>
      </ul>
    </>
  )
}

export function DocsLayout({
  page,
  children,
}: {
  page: 'maintainer' | 'schema'
  children: ReactNode
}) {
  const { pathname } = useLocation()
  const onMaintainer = pathname === '/maintainer' || pathname.startsWith('/maintainer/')
  const activeHeadingId = useActiveInPageHeading(onMaintainer)
  const schemaCurrent = page === 'schema'

  return (
    <div className={`docs-layout docs-layout--${page}`}>
      <nav className="docs-toc docs-toc--sidebar" aria-label="Contents">
        <TocLinks
          pathname={pathname}
          activeHeadingId={onMaintainer ? activeHeadingId : null}
          schemaCurrent={schemaCurrent}
        />
      </nav>
      <div className="docs-layout-main">
        <details className="docs-toc docs-toc--mobile">
          <summary>Contents</summary>
          <nav aria-label="Contents">
            <TocLinks
              pathname={pathname}
              activeHeadingId={onMaintainer ? activeHeadingId : null}
              schemaCurrent={schemaCurrent}
            />
          </nav>
        </details>
        {children}
      </div>
    </div>
  )
}

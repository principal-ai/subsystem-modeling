import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { DocsLayout } from '../../components/DocsToc'

export function MaintainerLayout() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash) {
      const id = hash.replace(/^#/, '')
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView()
      })
      return
    }
    const root = document.getElementById('root')
    if (root) root.scrollTop = 0
    else window.scrollTo(0, 0)
  }, [pathname, hash])

  return (
    <DocsLayout page="maintainer">
      <Outlet />
    </DocsLayout>
  )
}

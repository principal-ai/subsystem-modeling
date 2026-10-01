function Skeleton({ className }: { className: string }) {
  return <span className={`skeleton ${className}`} />
}

export function DocsFallback() {
  return (
    <div className="docs-layout" aria-busy="true">
      <span className="visually-hidden">Loading docs…</span>
      <div className="docs-toc docs-toc--sidebar" aria-hidden="true">
        <Skeleton className="skeleton--label" />
        <Skeleton className="skeleton--row" />
        <Skeleton className="skeleton--row skeleton--row--short" />
        <Skeleton className="skeleton--row" />
        <Skeleton className="skeleton--row skeleton--row--short" />
      </div>
      <div className="docs-layout-main">
        <Skeleton className="skeleton--title" />
        <Skeleton className="skeleton--line" />
        <Skeleton className="skeleton--line" />
        <Skeleton className="skeleton--line skeleton--line--short" />
      </div>
    </div>
  )
}

export function PageFallback() {
  return (
    <div className="page-fallback" aria-busy="true">
      <span className="visually-hidden">Loading…</span>
      <Skeleton className="skeleton--title" />
      <Skeleton className="skeleton--line" />
      <Skeleton className="skeleton--line" />
      <Skeleton className="skeleton--line skeleton--line--short" />
    </div>
  )
}

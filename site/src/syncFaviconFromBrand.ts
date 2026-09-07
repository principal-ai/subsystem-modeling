/** Sync the tab icon stroke to `--brand` from index.css. */
export function syncFaviconFromBrand() {
  const color =
    getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() ||
    '#4c6a91'

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <g stroke="${color}" stroke-width="1.5" opacity="0.15" stroke-linecap="butt">
    <path d="M2 8 H30"/>
    <path d="M2 16 H30"/>
    <path d="M2 24 H30"/>
    <path d="M8 2 V30"/>
    <path d="M24 2 V30"/>
  </g>
  <rect x="1" y="1" width="30" height="30" rx="2" stroke="${color}" stroke-width="2" opacity="0.4"/>
  <g stroke="${color}" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter">
    <path d="M8 8 H24"/>
    <path d="M8 8 V16"/>
    <path d="M8 16 H24"/>
    <path d="M24 16 V24"/>
    <path d="M24 24 H8"/>
  </g>
</svg>`

  const href = `data:image/svg+xml,${encodeURIComponent(svg)}`
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']")
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    link.type = 'image/svg+xml'
    document.head.appendChild(link)
  }
  link.href = href
}

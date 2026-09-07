import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { syncFaviconFromBrand } from './syncFaviconFromBrand.ts'

syncFaviconFromBrand()

// basename matches vite.config.ts `base` so client-side routes resolve
// under the /subsystem-modeling/ subpath on GitHub Pages.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

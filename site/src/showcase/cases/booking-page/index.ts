import { meta } from './meta';
import * as model from './model';

/**
 * Fabricated app logo — the showcase purl (`pkg:github/you/booking-page`)
 * points at a non-existent GitHub owner, so without this the declaration card
 * falls back to a default avatar. Inline SVG: an indigo calendar page.
 */
const SCHEDULING_LOGO =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
      `<rect width="32" height="32" rx="8" fill="#6366f1"/>` +
      `<rect x="6" y="8" width="20" height="18" rx="3" fill="#ffffff"/>` +
      `<path d="M6 14v-3a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v3z" fill="#c7d2fe"/>` +
      `<rect x="10" y="5.5" width="2.5" height="5" rx="1.25" fill="#eef2ff"/>` +
      `<rect x="19.5" y="5.5" width="2.5" height="5" rx="1.25" fill="#eef2ff"/>` +
      `<rect x="10" y="17" width="5" height="4" rx="1.2" fill="#6366f1"/>` +
      `<rect x="17" y="17" width="5" height="4" rx="1.2" fill="#e0e7ff"/>` +
      `<rect x="10" y="22.5" width="5" height="2.2" rx="1.1" fill="#e0e7ff"/>` +
      `<rect x="17" y="22.5" width="5" height="2.2" rx="1.1" fill="#e0e7ff"/>` +
      `</svg>`,
  );

export const bookingPageCase = {
  meta,
  model: {
    ...model,
    components: model.components.map((c) =>
      c.purl.startsWith('pkg:github/') ? { ...c, logo: SCHEDULING_LOGO } : c,
    ),
  },
  caseDir: meta.id,
} as const;

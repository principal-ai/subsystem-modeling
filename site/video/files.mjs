import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The real source tree backing the booking-page showcase model, read from disk
 * at render time. The walkthrough hops in the model file pin each step to a
 * file:line; showing the bytes actually on disk (rather than an inlined copy)
 * means the video can never drift from the repo.
 */
const ROOT = resolve(HERE, '..', 'showcase', 'booking-page');

const PATHS = [
  'app/book/page.tsx',
  'app/book/actions.ts',
  'lib/listSlots.ts',
  'lib/createBooking.ts',
  'lib/cancelBooking.ts',
  'lib/captureEvent.ts',
];

export function loadFiles() {
  const out = {};
  for (const p of PATHS) {
    const lines = readFileSync(join(ROOT, p), 'utf8').split('\n');
    // drop a single trailing blank line from the final newline
    if (lines[lines.length - 1] === '') lines.pop();
    out[p] = lines;
  }
  return out;
}

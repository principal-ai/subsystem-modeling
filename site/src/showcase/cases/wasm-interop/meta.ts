import type { ShowcaseCaseMeta } from '../types';

export const meta: ShowcaseCaseMeta = {
  id: 'wasm-interop',
  shortTitle: 'Host ↔ WASM pipeline',
  blurb: 'browser/host orchestrates; wasm/guest normalize+checksum with host_trace callbacks.',
  stack: 'TS + Rust/WASM',
  axes: ['stack', 'insight', 'shape'],
  complexity: 'medium',
  storyTitle: 'WASM/Host guest pipeline',
};

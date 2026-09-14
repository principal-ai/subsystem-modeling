import type { ShowcaseCaseMeta } from '../types';

export const meta: ShowcaseCaseMeta = {
  id: 'wasm-interop',
  shortTitle: 'Browser main ↔ WASM worker',
  blurb: 'browser/main orchestrates; wasm/worker normalize+checksum with host_trace callbacks.',
  stack: 'TS + Rust/WASM',
  axes: ['stack', 'insight', 'shape'],
  complexity: 'medium',
  storyTitle: 'WASM/Browser main worker pipeline',
};

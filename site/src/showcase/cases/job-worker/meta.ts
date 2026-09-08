import type { ShowcaseCaseMeta } from '../types';

export const meta: ShowcaseCaseMeta = {
  id: 'job-worker',
  shortTitle: 'Tokio job worker',
  blurb: 'Async Rust worker: dequeue, handle, ack/nack against Redis.',
  stack: 'Rust',
  axes: ['job', 'stack', 'shape'],
  complexity: 'medium',
  storyTitle: 'Rust/Tokio job worker',
};

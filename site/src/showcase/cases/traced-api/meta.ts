import type { ShowcaseCaseMeta } from '../types';

export const meta: ShowcaseCaseMeta = {
  id: 'traced-api',
  shortTitle: 'Traced HTTP API',
  blurb:
    'FastAPI orders-api + payments-api with OpenTelemetry across the trace.',
  stack: 'Python',
  axes: ['stack', 'insight'],
  complexity: 'medium',
  storyTitle: 'Python/Traced HTTP API',
};

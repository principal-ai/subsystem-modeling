import type { ShowcaseCaseMeta } from '../types';

export const meta: ShowcaseCaseMeta = {
  id: 'traced-api',
  shortTitle: 'Traced HTTP API',
  blurb: 'Python FastAPI service with OpenTelemetry spans and OTLP export.',
  stack: 'Python',
  axes: ['stack', 'insight'],
  complexity: 'medium',
  storyTitle: 'Python/Traced HTTP API',
};

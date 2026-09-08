import type { ShowcaseCaseMeta } from '../types';

export const meta: ShowcaseCaseMeta = {
  id: 'dbt-orders',
  shortTitle: 'dbt orders models',
  blurb: 'Staging → mart SQL models with schema tests in a warehouse.',
  stack: 'SQL/dbt',
  axes: ['job', 'stack', 'insight'],
  complexity: 'medium',
  storyTitle: 'SQL/dbt orders models',
};

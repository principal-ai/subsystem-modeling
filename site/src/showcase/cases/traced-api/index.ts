import { meta } from './meta';
import * as model from './model';

export const tracedApiCase = {
  meta,
  model,
  caseDir: meta.id,
} as const;

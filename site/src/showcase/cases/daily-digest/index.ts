import { meta } from './meta';
import * as model from './model';

export const dailyDigestCase = {
  meta,
  model,
  caseDir: meta.id,
} as const;

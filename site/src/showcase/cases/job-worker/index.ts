import { meta } from './meta';
import * as model from './model';

export const jobWorkerCase = {
  meta,
  model,
  caseDir: meta.id,
} as const;

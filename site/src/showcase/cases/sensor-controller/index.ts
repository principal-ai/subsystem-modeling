import { meta } from './meta';
import * as model from './model';

export const sensorControllerCase = {
  meta,
  model,
  caseDir: meta.id,
} as const;

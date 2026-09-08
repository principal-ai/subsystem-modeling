import { meta } from './meta';
import * as model from './model';

export const bookingPageCase = {
  meta,
  model,
  caseDir: meta.id,
} as const;

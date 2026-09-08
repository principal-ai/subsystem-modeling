import { meta } from './meta';
import * as model from './model';

export const androidNotesCase = {
  meta,
  model,
  caseDir: meta.id,
} as const;

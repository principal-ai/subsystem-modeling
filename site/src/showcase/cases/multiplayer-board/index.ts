import { meta } from './meta';
import * as model from './model';

export const multiplayerBoardCase = {
  meta,
  model,
  caseDir: meta.id,
} as const;

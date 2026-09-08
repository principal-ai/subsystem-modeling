import { meta } from './meta';
import * as model from './model';
export const terraformSiteCase = { meta, model, caseDir: meta.id } as const;

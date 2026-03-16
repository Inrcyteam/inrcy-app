import { financeTemplates } from './common';
import { createJobTemplates } from '../shared';
import { expert_comptable_financeJobTemplates } from './expert_comptable_finance';
import { courtier_creditJobTemplates } from './courtier_credit';
import { gestion_patrimoineJobTemplates } from './gestion_patrimoine';
import { daf_externaliseJobTemplates } from './daf_externalise';

export { financeTemplates };

export function buildFinanceJobTemplates() {
  return [expert_comptable_financeJobTemplates, courtier_creditJobTemplates, gestion_patrimoineJobTemplates, daf_externaliseJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

import { services_entreprisesTemplates } from './common';
import { createJobTemplates } from '../shared';
import { consultantJobTemplates } from './consultant';
import { agence_marketingJobTemplates } from './agence_marketing';
import { organisme_formationJobTemplates } from './organisme_formation';
import { informatiqueJobTemplates } from './informatique';
import { expert_comptableJobTemplates } from './expert_comptable';
import { juridiqueJobTemplates } from './juridique';

export { services_entreprisesTemplates };

export function buildServicesEntreprisesJobTemplates() {
  return [consultantJobTemplates, agence_marketingJobTemplates, organisme_formationJobTemplates, informatiqueJobTemplates, expert_comptableJobTemplates, juridiqueJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

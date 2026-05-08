import { services_entreprisesTemplates } from './common';
import { createJobTemplates } from '../shared';
import { agence_marketingJobTemplates } from './agence_marketing';
import { consultantJobTemplates } from './consultant';
import { expert_comptableJobTemplates } from './expert_comptable';
import { informatiqueJobTemplates } from './informatique';
import { juridiqueJobTemplates } from './juridique';
import { organisme_formationJobTemplates } from './organisme_formation';
import { recrutementJobTemplates } from './recrutement';
import { secretariat_externaliseJobTemplates } from './secretariat_externalise';

export { services_entreprisesTemplates };

export function buildServicesEntreprisesJobTemplates() {
  return [agence_marketingJobTemplates, consultantJobTemplates, expert_comptableJobTemplates, informatiqueJobTemplates, juridiqueJobTemplates, organisme_formationJobTemplates, recrutementJobTemplates, secretariat_externaliseJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

import { assuranceTemplates } from './common';
import { createJobTemplates } from '../shared';
import { assureurJobTemplates } from './assureur';
import { agent_general_assuranceJobTemplates } from './agent_general_assurance';
import { courtier_assuranceJobTemplates } from './courtier_assurance';
import { conseiller_assurancesJobTemplates } from './conseiller_assurances';
import { cabinet_assuranceJobTemplates } from './cabinet_assurance';

export { assuranceTemplates };

export function buildAssuranceJobTemplates() {
  return [assureurJobTemplates, agent_general_assuranceJobTemplates, courtier_assuranceJobTemplates, conseiller_assurancesJobTemplates, cabinet_assuranceJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

import { education_enfanceTemplates } from './common';
import { createJobTemplates } from '../shared';
import { crecheJobTemplates } from './creche';
import { soutien_scolaireJobTemplates } from './soutien_scolaire';
import { ecole_priveeJobTemplates } from './ecole_privee';
import { coach_scolaireJobTemplates } from './coach_scolaire';
import { centre_loisirsJobTemplates } from './centre_loisirs';

export { education_enfanceTemplates };

export function buildEducationEnfanceJobTemplates() {
  return [crecheJobTemplates, soutien_scolaireJobTemplates, ecole_priveeJobTemplates, coach_scolaireJobTemplates, centre_loisirsJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

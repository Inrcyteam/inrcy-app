import { immobilierTemplates } from './common';
import { createJobTemplates } from '../shared';
import { agence_immobiliereJobTemplates } from './agence_immobiliere';
import { courtierJobTemplates } from './courtier';
import { gestion_locativeJobTemplates } from './gestion_locative';
import { syndicJobTemplates } from './syndic';
import { home_stagingJobTemplates } from './home_staging';

export { immobilierTemplates };

export function buildImmobilierJobTemplates() {
  return [agence_immobiliereJobTemplates, courtierJobTemplates, gestion_locativeJobTemplates, syndicJobTemplates, home_stagingJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

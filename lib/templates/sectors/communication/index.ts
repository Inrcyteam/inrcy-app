import { communicationTemplates } from './common';
import { createJobTemplates } from '../shared';
import { photographe_proJobTemplates } from './photographe_pro';
import { enseignisteJobTemplates } from './enseigniste';
import { imprimeurJobTemplates } from './imprimeur';
import { createur_sites_internetJobTemplates } from './createur_sites_internet';
import { agence_communicationJobTemplates } from './agence_communication';
import { community_managerJobTemplates } from './community_manager';
import { redacteur_webJobTemplates } from './redacteur_web';
import { graphisteJobTemplates } from './graphiste';
import { agence_seoJobTemplates } from './agence_seo';

export { communicationTemplates };

export function buildCommunicationJobTemplates() {
  return [agence_communicationJobTemplates, community_managerJobTemplates, redacteur_webJobTemplates, graphisteJobTemplates, agence_seoJobTemplates, createur_sites_internetJobTemplates, imprimeurJobTemplates, enseignisteJobTemplates, photographe_proJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

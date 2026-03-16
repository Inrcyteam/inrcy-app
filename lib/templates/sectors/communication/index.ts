import { communicationTemplates } from './common';
import { createJobTemplates } from '../shared';
import { agence_communicationJobTemplates } from './agence_communication';
import { community_managerJobTemplates } from './community_manager';
import { redacteur_webJobTemplates } from './redacteur_web';
import { graphisteJobTemplates } from './graphiste';
import { agence_seoJobTemplates } from './agence_seo';

export { communicationTemplates };

export function buildCommunicationJobTemplates() {
  return [agence_communicationJobTemplates, community_managerJobTemplates, redacteur_webJobTemplates, graphisteJobTemplates, agence_seoJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

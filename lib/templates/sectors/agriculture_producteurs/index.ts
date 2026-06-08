import { agriculture_producteursTemplates } from './common';
import { createJobTemplates } from '../shared';
import { ferme_producteur_localJobTemplates } from './ferme_producteur_local';
import { maraicherJobTemplates } from './maraicher';
import { apiculteurJobTemplates } from './apiculteur';
import { pepinieristeJobTemplates } from './pepinieriste';
import { viticulteur_domaineJobTemplates } from './viticulteur_domaine';

export { agriculture_producteursTemplates };

export function buildAgricultureProducteursJobTemplates() {
  return [ferme_producteur_localJobTemplates, maraicherJobTemplates, apiculteurJobTemplates, pepinieristeJobTemplates, viticulteur_domaineJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

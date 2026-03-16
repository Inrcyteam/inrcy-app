import { juridiqueTemplates } from './common';
import { createJobTemplates } from '../shared';
import { avocatJobTemplates } from './avocat';
import { notaireJobTemplates } from './notaire';
import { juriste_entrepriseJobTemplates } from './juriste_entreprise';
import { huissierJobTemplates } from './huissier';

export { juridiqueTemplates };

export function buildJuridiqueJobTemplates() {
  return [avocatJobTemplates, notaireJobTemplates, juriste_entrepriseJobTemplates, huissierJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

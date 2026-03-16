import { santeTemplates } from './common';
import { createJobTemplates } from '../shared';
import { medecin_generalisteJobTemplates } from './medecin_generaliste';
import { dentisteJobTemplates } from './dentiste';
import { kineJobTemplates } from './kine';
import { osteopatheJobTemplates } from './osteopathe';
import { pharmacieJobTemplates } from './pharmacie';
import { infirmierJobTemplates } from './infirmier';

export { santeTemplates };

export function buildSanteJobTemplates() {
  return [medecin_generalisteJobTemplates, dentisteJobTemplates, kineJobTemplates, osteopatheJobTemplates, pharmacieJobTemplates, infirmierJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

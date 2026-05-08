import { exterieur_jardinTemplates } from './common';
import { createJobTemplates } from '../shared';
import { arrosage_automatiqueJobTemplates } from './arrosage_automatique';
import { cloture_portailJobTemplates } from './cloture_portail';
import { elagueurJobTemplates } from './elagueur';
import { entretien_jardinJobTemplates } from './entretien_jardin';
import { paysagisteJobTemplates } from './paysagiste';
import { piscinisteJobTemplates } from './pisciniste';
import { terrassement_paysagerJobTemplates } from './terrassement_paysager';

export { exterieur_jardinTemplates };

export function buildExterieurJardinJobTemplates() {
  return [arrosage_automatiqueJobTemplates, cloture_portailJobTemplates, elagueurJobTemplates, entretien_jardinJobTemplates, paysagisteJobTemplates, piscinisteJobTemplates, terrassement_paysagerJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

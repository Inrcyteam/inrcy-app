import { metiers_artTemplates } from './common';
import { createJobTemplates } from '../shared';
import { ebenisteJobTemplates } from './ebeniste';
import { ferronnier_artJobTemplates } from './ferronnier_art';
import { ceramisteJobTemplates } from './ceramiste';
import { couturier_retouchesJobTemplates } from './couturier_retouches';
import { tapissier_decorateurJobTemplates } from './tapissier_decorateur';

export { metiers_artTemplates };

export function buildMetiersArtJobTemplates() {
  return [ebenisteJobTemplates, ferronnier_artJobTemplates, ceramisteJobTemplates, couturier_retouchesJobTemplates, tapissier_decorateurJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

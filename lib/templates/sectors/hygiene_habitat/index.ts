import { hygiene_habitatTemplates } from './common';
import { createJobTemplates } from '../shared';
import { assainissementJobTemplates } from './assainissement';
import { debarrasJobTemplates } from './debarras';
import { deratiseurJobTemplates } from './deratiseur';
import { desinsectisationJobTemplates } from './desinsectisation';
import { nettoyageJobTemplates } from './nettoyage';
import { ramonageJobTemplates } from './ramonage';
import { traitement_humiditeJobTemplates } from './traitement_humidite';
import { vitrierJobTemplates } from './vitrier';

export { hygiene_habitatTemplates };

export function buildHygieneHabitatJobTemplates() {
  return [
    assainissementJobTemplates,
    debarrasJobTemplates,
    deratiseurJobTemplates,
    desinsectisationJobTemplates,
    nettoyageJobTemplates,
    ramonageJobTemplates,
    traitement_humiditeJobTemplates,
    vitrierJobTemplates,
  ].flatMap((definition) => createJobTemplates(definition));
}

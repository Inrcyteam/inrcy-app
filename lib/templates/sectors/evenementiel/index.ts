import { evenementielTemplates } from './common';
import { createJobTemplates } from '../shared';
import { decorateur_evenementielJobTemplates } from './decorateur_evenementiel';
import { djJobTemplates } from './dj';
import { location_materielJobTemplates } from './location_materiel';
import { magicienJobTemplates } from './magicien';
import { photographeJobTemplates } from './photographe';
import { salle_receptionJobTemplates } from './salle_reception';
import { traiteur_evenementielJobTemplates } from './traiteur_evenementiel';
import { videasteJobTemplates } from './videaste';
import { wedding_plannerJobTemplates } from './wedding_planner';

export { evenementielTemplates };

export function buildEvenementielJobTemplates() {
  return [decorateur_evenementielJobTemplates, djJobTemplates, location_materielJobTemplates, magicienJobTemplates, photographeJobTemplates, salle_receptionJobTemplates, traiteur_evenementielJobTemplates, videasteJobTemplates, wedding_plannerJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

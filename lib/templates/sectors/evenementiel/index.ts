import { evenementielTemplates } from './common';
import { createJobTemplates } from '../shared';
import { djJobTemplates } from './dj';
import { photographeJobTemplates } from './photographe';
import { wedding_plannerJobTemplates } from './wedding_planner';
import { location_materielJobTemplates } from './location_materiel';
import { traiteur_evenementielJobTemplates } from './traiteur_evenementiel';
import { decorateur_evenementielJobTemplates } from './decorateur_evenementiel';

export { evenementielTemplates };

export function buildEvenementielJobTemplates() {
  return [djJobTemplates, photographeJobTemplates, wedding_plannerJobTemplates, location_materielJobTemplates, traiteur_evenementielJobTemplates, decorateur_evenementielJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

import { loisirs_sportTemplates } from './common';
import { createJobTemplates } from '../shared';
import { salle_sportJobTemplates } from './salle_sport';
import { club_sportJobTemplates } from './club_sport';
import { escape_gameJobTemplates } from './escape_game';
import { parc_loisirsJobTemplates } from './parc_loisirs';
import { activites_nautiquesJobTemplates } from './activites_nautiques';
import { professeur_danse_yogaJobTemplates } from './professeur_danse_yoga';

export { loisirs_sportTemplates };

export function buildLoisirsSportJobTemplates() {
  return [salle_sportJobTemplates, club_sportJobTemplates, escape_gameJobTemplates, parc_loisirsJobTemplates, activites_nautiquesJobTemplates, professeur_danse_yogaJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

import { beaute_bien_etreTemplates } from './common';
import { createJobTemplates } from '../shared';
import { coach_sportifJobTemplates } from './coach_sportif';
import { coiffeurJobTemplates } from './coiffeur';
import { estheticienneJobTemplates } from './estheticienne';
import { masseurJobTemplates } from './masseur';
import { nutritionnisteJobTemplates } from './nutritionniste';
import { onglerieJobTemplates } from './onglerie';
import { spaJobTemplates } from './spa';
import { tatoueurJobTemplates } from './tatoueur';

export { beaute_bien_etreTemplates };

export function buildBeauteBienEtreJobTemplates() {
  return [coach_sportifJobTemplates, coiffeurJobTemplates, estheticienneJobTemplates, masseurJobTemplates, nutritionnisteJobTemplates, onglerieJobTemplates, spaJobTemplates, tatoueurJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

import { beaute_bien_etreTemplates } from './common';
import { createJobTemplates } from '../shared';
import { coiffeurJobTemplates } from './coiffeur';
import { estheticienneJobTemplates } from './estheticienne';
import { spaJobTemplates } from './spa';
import { onglerieJobTemplates } from './onglerie';
import { masseurJobTemplates } from './masseur';
import { tatoueurJobTemplates } from './tatoueur';

export { beaute_bien_etreTemplates };

export function buildBeauteBienEtreJobTemplates() {
  return [coiffeurJobTemplates, estheticienneJobTemplates, spaJobTemplates, onglerieJobTemplates, masseurJobTemplates, tatoueurJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

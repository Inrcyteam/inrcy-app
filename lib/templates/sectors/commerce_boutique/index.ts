import { commerce_boutiqueTemplates } from './common';
import { createJobTemplates } from '../shared';
import { boutique_modeJobTemplates } from './boutique_mode';
import { fleuristeJobTemplates } from './fleuriste';
import { boulangerieJobTemplates } from './boulangerie';
import { opticienJobTemplates } from './opticien';
import { epicerieJobTemplates } from './epicerie';
import { librairieJobTemplates } from './librairie';

export { commerce_boutiqueTemplates };

export function buildCommerceBoutiqueJobTemplates() {
  return [boutique_modeJobTemplates, fleuristeJobTemplates, boulangerieJobTemplates, opticienJobTemplates, epicerieJobTemplates, librairieJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

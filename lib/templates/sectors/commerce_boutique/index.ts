import { commerce_boutiqueTemplates } from './common';
import { createJobTemplates } from '../shared';
import { bijouterieJobTemplates } from './bijouterie';
import { boulangerieJobTemplates } from './boulangerie';
import { boutique_modeJobTemplates } from './boutique_mode';
import { cavisteJobTemplates } from './caviste';
import { epicerieJobTemplates } from './epicerie';
import { fleuristeJobTemplates } from './fleuriste';
import { librairieJobTemplates } from './librairie';
import { magasin_meublesJobTemplates } from './magasin_meubles';
import { opticienJobTemplates } from './opticien';

export { commerce_boutiqueTemplates };

export function buildCommerceBoutiqueJobTemplates() {
  return [bijouterieJobTemplates, boulangerieJobTemplates, boutique_modeJobTemplates, cavisteJobTemplates, epicerieJobTemplates, fleuristeJobTemplates, librairieJobTemplates, magasin_meublesJobTemplates, opticienJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

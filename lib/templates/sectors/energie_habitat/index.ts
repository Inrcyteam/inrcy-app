import { energie_habitatTemplates } from './common';
import { createJobTemplates } from '../shared';
import { installateur_panneaux_solairesJobTemplates } from './installateur_panneaux_solaires';
import { pompe_chaleurJobTemplates } from './pompe_chaleur';
import { domotiqueJobTemplates } from './domotique';
import { poele_chemineeJobTemplates } from './poele_cheminee';
import { bornes_rechargeJobTemplates } from './bornes_recharge';

export { energie_habitatTemplates };

export function buildEnergieHabitatJobTemplates() {
  return [installateur_panneaux_solairesJobTemplates, pompe_chaleurJobTemplates, domotiqueJobTemplates, poele_chemineeJobTemplates, bornes_rechargeJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

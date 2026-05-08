import { automobileTemplates } from './common';
import { createJobTemplates } from '../shared';
import { carrosserieJobTemplates } from './carrosserie';
import { centre_autoJobTemplates } from './centre_auto';
import { controle_techniqueJobTemplates } from './controle_technique';
import { depannage_autoJobTemplates } from './depannage_auto';
import { garage_autoJobTemplates } from './garage_auto';
import { garage_motoJobTemplates } from './garage_moto';
import { lavage_autoJobTemplates } from './lavage_auto';
import { location_vehiculesJobTemplates } from './location_vehicules';
import { pare_briseJobTemplates } from './pare_brise';

export { automobileTemplates };

export function buildAutomobileJobTemplates() {
  return [carrosserieJobTemplates, centre_autoJobTemplates, controle_techniqueJobTemplates, depannage_autoJobTemplates, garage_autoJobTemplates, garage_motoJobTemplates, lavage_autoJobTemplates, location_vehiculesJobTemplates, pare_briseJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

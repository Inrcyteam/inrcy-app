import { automobileTemplates } from './common';
import { createJobTemplates } from '../shared';
import { garage_autoJobTemplates } from './garage_auto';
import { carrosserieJobTemplates } from './carrosserie';
import { centre_autoJobTemplates } from './centre_auto';
import { garage_motoJobTemplates } from './garage_moto';
import { lavage_autoJobTemplates } from './lavage_auto';
import { depannage_autoJobTemplates } from './depannage_auto';

export { automobileTemplates };

export function buildAutomobileJobTemplates() {
  return [garage_autoJobTemplates, carrosserieJobTemplates, centre_autoJobTemplates, garage_motoJobTemplates, lavage_autoJobTemplates, depannage_autoJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

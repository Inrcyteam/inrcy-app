import { funeraireTemplates } from './common';
import { createJobTemplates } from '../shared';
import { pompes_funebresJobTemplates } from './pompes_funebres';
import { marbrerie_funeraireJobTemplates } from './marbrerie_funeraire';
import { fleurissement_sepultureJobTemplates } from './fleurissement_sepulture';

export { funeraireTemplates };

export function buildFuneraireJobTemplates() {
  return [pompes_funebresJobTemplates, marbrerie_funeraireJobTemplates, fleurissement_sepultureJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

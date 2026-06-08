import { bois_foretTemplates } from './common';
import { createJobTemplates } from '../shared';
import { bois_chauffageJobTemplates } from './bois_chauffage';
import { exploitant_forestierJobTemplates } from './exploitant_forestier';
import { travaux_forestiersJobTemplates } from './travaux_forestiers';
import { scierieJobTemplates } from './scierie';
import { negoce_boisJobTemplates } from './negoce_bois';

export { bois_foretTemplates };

export function buildBoisForetJobTemplates() {
  return [bois_chauffageJobTemplates, exploitant_forestierJobTemplates, travaux_forestiersJobTemplates, scierieJobTemplates, negoce_boisJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

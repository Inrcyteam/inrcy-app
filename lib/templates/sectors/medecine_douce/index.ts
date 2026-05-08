import { medecine_douceTemplates } from './common';
import { createJobTemplates } from '../shared';
import { energeticienJobTemplates } from './energeticien';
import { hypnotherapeuteJobTemplates } from './hypnotherapeute';
import { magnetiseurJobTemplates } from './magnetiseur';
import { naturopatheJobTemplates } from './naturopathe';
import { reflexologueJobTemplates } from './reflexologue';
import { reikiJobTemplates } from './reiki';
import { shiatsuJobTemplates } from './shiatsu';
import { sophrologueJobTemplates } from './sophrologue';

export { medecine_douceTemplates };

export function buildMedecineDouceJobTemplates() {
  return [energeticienJobTemplates, hypnotherapeuteJobTemplates, magnetiseurJobTemplates, naturopatheJobTemplates, reflexologueJobTemplates, reikiJobTemplates, shiatsuJobTemplates, sophrologueJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

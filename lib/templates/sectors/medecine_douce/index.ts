import { medecine_douceTemplates } from './common';
import { createJobTemplates } from '../shared';
import { naturopatheJobTemplates } from './naturopathe';
import { sophrologueJobTemplates } from './sophrologue';
import { reflexologueJobTemplates } from './reflexologue';
import { hypnotherapeuteJobTemplates } from './hypnotherapeute';
import { energeticienJobTemplates } from './energeticien';
import { shiatsuJobTemplates } from './shiatsu';

export { medecine_douceTemplates };

export function buildMedecineDouceJobTemplates() {
  return [naturopatheJobTemplates, sophrologueJobTemplates, reflexologueJobTemplates, hypnotherapeuteJobTemplates, energeticienJobTemplates, shiatsuJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

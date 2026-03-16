import { autreTemplates } from './common';
import { createJobTemplates } from '../shared';
import { autre_activiteJobTemplates } from './autre_activite';

export { autreTemplates };

export function buildAutreJobTemplates() {
  return [autre_activiteJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

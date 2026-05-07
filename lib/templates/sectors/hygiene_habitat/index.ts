import { hygiene_habitatTemplates } from './common';
import { createJobTemplates } from '../shared';
import { hygiene_habitat_activiteJobTemplates } from './hygiene_habitat_activite';

export { hygiene_habitatTemplates };

export function buildHygieneHabitatJobTemplates() {
  return [hygiene_habitat_activiteJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

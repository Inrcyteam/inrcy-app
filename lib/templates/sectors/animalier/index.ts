import { animalierTemplates } from './common';
import { createJobTemplates } from '../shared';
import { veterinaireJobTemplates } from './veterinaire';
import { toilettageJobTemplates } from './toilettage';
import { pension_animaliereJobTemplates } from './pension_animaliere';
import { ecurieJobTemplates } from './ecurie';
import { educateur_caninJobTemplates } from './educateur_canin';
import { pet_sitterJobTemplates } from './pet_sitter';

export { animalierTemplates };

export function buildAnimalierJobTemplates() {
  return [veterinaireJobTemplates, toilettageJobTemplates, pension_animaliereJobTemplates, ecurieJobTemplates, educateur_caninJobTemplates, pet_sitterJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

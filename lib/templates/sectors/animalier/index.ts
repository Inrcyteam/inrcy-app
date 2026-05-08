import { animalierTemplates } from './common';
import { createJobTemplates } from '../shared';
import { ecurieJobTemplates } from './ecurie';
import { educateur_caninJobTemplates } from './educateur_canin';
import { eleveurJobTemplates } from './eleveur';
import { pension_animaliereJobTemplates } from './pension_animaliere';
import { pet_sitterJobTemplates } from './pet_sitter';
import { toilettageJobTemplates } from './toilettage';
import { veterinaireJobTemplates } from './veterinaire';

export { animalierTemplates };

export function buildAnimalierJobTemplates() {
  return [ecurieJobTemplates, educateur_caninJobTemplates, eleveurJobTemplates, pension_animaliereJobTemplates, pet_sitterJobTemplates, toilettageJobTemplates, veterinaireJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

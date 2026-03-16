import { hotel_restaurantTemplates } from './common';
import { createJobTemplates } from '../shared';
import { restaurantJobTemplates } from './restaurant';
import { hotelJobTemplates } from './hotel';
import { barJobTemplates } from './bar';
import { snackJobTemplates } from './snack';
import { traiteurJobTemplates } from './traiteur';
import { chambre_hotesJobTemplates } from './chambre_hotes';

export { hotel_restaurantTemplates };

export function buildHotelRestaurantJobTemplates() {
  return [restaurantJobTemplates, hotelJobTemplates, barJobTemplates, snackJobTemplates, traiteurJobTemplates, chambre_hotesJobTemplates].flatMap((definition) => createJobTemplates(definition));
}

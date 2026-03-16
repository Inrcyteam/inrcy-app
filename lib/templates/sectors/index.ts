import { ACTIVITY_SECTOR_OPTIONS } from '@/lib/activitySectors';
import type { TemplateDef } from '@/lib/messageTemplates';
import { createSectorTemplates, type SectorTemplateDefinition } from './shared';
import { artisan_btpTemplates, buildArtisanBtpJobTemplates } from './artisan_btp';
import { automobileTemplates, buildAutomobileJobTemplates } from './automobile';
import { commerce_boutiqueTemplates, buildCommerceBoutiqueJobTemplates } from './commerce_boutique';
import { hotel_restaurantTemplates, buildHotelRestaurantJobTemplates } from './hotel_restaurant';
import { beaute_bien_etreTemplates, buildBeauteBienEtreJobTemplates } from './beaute_bien_etre';
import { santeTemplates, buildSanteJobTemplates } from './sante';
import { medecine_douceTemplates, buildMedecineDouceJobTemplates } from './medecine_douce';
import { immobilierTemplates, buildImmobilierJobTemplates } from './immobilier';
import { services_particuliersTemplates, buildServicesParticuliersJobTemplates } from './services_particuliers';
import { services_entreprisesTemplates, buildServicesEntreprisesJobTemplates } from './services_entreprises';
import { communicationTemplates, buildCommunicationJobTemplates } from './communication';
import { juridiqueTemplates, buildJuridiqueJobTemplates } from './juridique';
import { financeTemplates, buildFinanceJobTemplates } from './finance';
import { evenementielTemplates, buildEvenementielJobTemplates } from './evenementiel';
import { animalierTemplates, buildAnimalierJobTemplates } from './animalier';
import { transportTemplates, buildTransportJobTemplates } from './transport';
import { autreTemplates, buildAutreJobTemplates } from './autre';

export const SECTOR_TEMPLATE_DEFINITIONS: Record<string, SectorTemplateDefinition> = {
  artisan_btp: artisan_btpTemplates,
  automobile: automobileTemplates,
  commerce_boutique: commerce_boutiqueTemplates,
  hotel_restaurant: hotel_restaurantTemplates,
  beaute_bien_etre: beaute_bien_etreTemplates,
  sante: santeTemplates,
  medecine_douce: medecine_douceTemplates,
  immobilier: immobilierTemplates,
  services_particuliers: services_particuliersTemplates,
  services_entreprises: services_entreprisesTemplates,
  communication: communicationTemplates,
  juridique: juridiqueTemplates,
  finance: financeTemplates,
  evenementiel: evenementielTemplates,
  animalier: animalierTemplates,
  transport: transportTemplates,
  autre: autreTemplates,
};

export function buildSectorTemplates(): TemplateDef[] {
  const out: TemplateDef[] = [];
  for (const option of ACTIVITY_SECTOR_OPTIONS) {
    const definition = SECTOR_TEMPLATE_DEFINITIONS[option.value];
    if (definition) out.push(...createSectorTemplates(definition));
    switch (option.value) {
      case 'artisan_btp':
        out.push(...buildArtisanBtpJobTemplates());
        break;
      case 'automobile':
        out.push(...buildAutomobileJobTemplates());
        break;
      case 'commerce_boutique':
        out.push(...buildCommerceBoutiqueJobTemplates());
        break;
      case 'hotel_restaurant':
        out.push(...buildHotelRestaurantJobTemplates());
        break;
      case 'beaute_bien_etre':
        out.push(...buildBeauteBienEtreJobTemplates());
        break;
      case 'sante':
        out.push(...buildSanteJobTemplates());
        break;
      case 'medecine_douce':
        out.push(...buildMedecineDouceJobTemplates());
        break;
      case 'immobilier':
        out.push(...buildImmobilierJobTemplates());
        break;
      case 'services_particuliers':
        out.push(...buildServicesParticuliersJobTemplates());
        break;
      case 'services_entreprises':
        out.push(...buildServicesEntreprisesJobTemplates());
        break;
      case 'communication':
        out.push(...buildCommunicationJobTemplates());
        break;
      case 'juridique':
        out.push(...buildJuridiqueJobTemplates());
        break;
      case 'finance':
        out.push(...buildFinanceJobTemplates());
        break;
      case 'evenementiel':
        out.push(...buildEvenementielJobTemplates());
        break;
      case 'animalier':
        out.push(...buildAnimalierJobTemplates());
        break;
      case 'transport':
        out.push(...buildTransportJobTemplates());
        break;
      case 'autre':
        out.push(...buildAutreJobTemplates());
        break;
      default:
        break;
    }
  }
  return out;
}

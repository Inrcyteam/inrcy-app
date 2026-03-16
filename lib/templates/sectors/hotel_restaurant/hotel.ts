import type { JobTemplateDefinition } from '../shared';

export const hotelJobTemplates: JobTemplateDefinition = {
  sector: 'hotel_restaurant',
  professionKey: 'hotel',
  professionLabel: 'Hôtel',
  pack: {
    label: 'Hôtel',
    signature: 'apporter un service clair, fiable et rassurant en hôtel',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en hôtel',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de hôtel',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à hôtel',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en hôtel',
    seasonal: 'offre de saison dédiée à hôtel',
    loyalty: 'avantage réservé aux clients fidèles en hôtel',
    maintenance: 'un rappel utile pour garder un bon niveau de service en hôtel',
    localHook: 'hôtel au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en hôtel',
  },
};

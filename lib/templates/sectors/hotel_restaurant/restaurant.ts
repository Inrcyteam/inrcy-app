import type { JobTemplateDefinition } from '../shared';

export const restaurantJobTemplates: JobTemplateDefinition = {
  sector: 'hotel_restaurant',
  professionKey: 'restaurant',
  professionLabel: 'Restaurant',
  pack: {
    label: 'Restaurant',
    signature: 'apporter un service clair, fiable et rassurant en restaurant',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en restaurant',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de restaurant',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à restaurant',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en restaurant',
    seasonal: 'offre de saison dédiée à restaurant',
    loyalty: 'avantage réservé aux clients fidèles en restaurant',
    maintenance: 'un rappel utile pour garder un bon niveau de service en restaurant',
    localHook: 'restaurant au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en restaurant',
  },
};

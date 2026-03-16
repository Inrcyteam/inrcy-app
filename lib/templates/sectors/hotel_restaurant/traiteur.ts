import type { JobTemplateDefinition } from '../shared';

export const traiteurJobTemplates: JobTemplateDefinition = {
  sector: 'hotel_restaurant',
  professionKey: 'traiteur',
  professionLabel: 'Traiteur',
  pack: {
    label: 'Traiteur',
    signature: 'apporter un service clair, fiable et rassurant en traiteur',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en traiteur',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de traiteur',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à traiteur',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en traiteur',
    seasonal: 'offre de saison dédiée à traiteur',
    loyalty: 'avantage réservé aux clients fidèles en traiteur',
    maintenance: 'un rappel utile pour garder un bon niveau de service en traiteur',
    localHook: 'traiteur au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en traiteur',
  },
};

import type { JobTemplateDefinition } from '../shared';

export const electricienJobTemplates: JobTemplateDefinition = {
  sector: 'artisan_btp',
  professionKey: 'electricien',
  professionLabel: 'Électricien',
  pack: {
    label: 'Électricien',
    signature: 'apporter un service clair, fiable et rassurant en électricien',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en électricien',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de électricien',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à électricien',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en électricien',
    seasonal: 'offre de saison dédiée à électricien',
    loyalty: 'avantage réservé aux clients fidèles en électricien',
    maintenance: 'un rappel utile pour garder un bon niveau de service en électricien',
    localHook: 'électricien au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en électricien',
  },
};

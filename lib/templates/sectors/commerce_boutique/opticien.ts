import type { JobTemplateDefinition } from '../shared';

export const opticienJobTemplates: JobTemplateDefinition = {
  sector: 'commerce_boutique',
  professionKey: 'opticien',
  professionLabel: 'Opticien',
  pack: {
    label: 'Opticien',
    signature: 'apporter un service clair, fiable et rassurant en opticien',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en opticien',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de opticien',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à opticien',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en opticien',
    seasonal: 'offre de saison dédiée à opticien',
    loyalty: 'avantage réservé aux clients fidèles en opticien',
    maintenance: 'un rappel utile pour garder un bon niveau de service en opticien',
    localHook: 'opticien au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en opticien',
  },
};

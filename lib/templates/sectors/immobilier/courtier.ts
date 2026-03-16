import type { JobTemplateDefinition } from '../shared';

export const courtierJobTemplates: JobTemplateDefinition = {
  sector: 'immobilier',
  professionKey: 'courtier',
  professionLabel: 'Courtier',
  pack: {
    label: 'Courtier',
    signature: 'apporter un service clair, fiable et rassurant en courtier',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en courtier',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de courtier',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à courtier',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en courtier',
    seasonal: 'offre de saison dédiée à courtier',
    loyalty: 'avantage réservé aux clients fidèles en courtier',
    maintenance: 'un rappel utile pour garder un bon niveau de service en courtier',
    localHook: 'courtier au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en courtier',
  },
};

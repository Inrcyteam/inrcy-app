import type { JobTemplateDefinition } from '../shared';

export const taxiJobTemplates: JobTemplateDefinition = {
  sector: 'transport',
  professionKey: 'taxi',
  professionLabel: 'Taxi',
  pack: {
    label: 'Taxi',
    signature: 'apporter un service clair, fiable et rassurant en taxi',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en taxi',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de taxi',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à taxi',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en taxi',
    seasonal: 'offre de saison dédiée à taxi',
    loyalty: 'avantage réservé aux clients fidèles en taxi',
    maintenance: 'un rappel utile pour garder un bon niveau de service en taxi',
    localHook: 'taxi au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en taxi',
  },
};

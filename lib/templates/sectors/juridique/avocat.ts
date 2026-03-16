import type { JobTemplateDefinition } from '../shared';

export const avocatJobTemplates: JobTemplateDefinition = {
  sector: 'juridique',
  professionKey: 'avocat',
  professionLabel: 'Avocat',
  pack: {
    label: 'Avocat',
    signature: 'apporter un service clair, fiable et rassurant en avocat',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en avocat',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de avocat',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à avocat',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en avocat',
    seasonal: 'offre de saison dédiée à avocat',
    loyalty: 'avantage réservé aux clients fidèles en avocat',
    maintenance: 'un rappel utile pour garder un bon niveau de service en avocat',
    localHook: 'avocat au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en avocat',
  },
};

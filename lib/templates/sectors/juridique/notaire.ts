import type { JobTemplateDefinition } from '../shared';

export const notaireJobTemplates: JobTemplateDefinition = {
  sector: 'juridique',
  professionKey: 'notaire',
  professionLabel: 'Notaire',
  pack: {
    label: 'Notaire',
    signature: 'apporter un service clair, fiable et rassurant en notaire',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en notaire',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de notaire',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à notaire',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en notaire',
    seasonal: 'offre de saison dédiée à notaire',
    loyalty: 'avantage réservé aux clients fidèles en notaire',
    maintenance: 'un rappel utile pour garder un bon niveau de service en notaire',
    localHook: 'notaire au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en notaire',
  },
};

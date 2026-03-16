import type { JobTemplateDefinition } from '../shared';

export const demenagementJobTemplates: JobTemplateDefinition = {
  sector: 'transport',
  professionKey: 'demenagement',
  professionLabel: 'Déménagement',
  pack: {
    label: 'Déménagement',
    signature: 'apporter un service clair, fiable et rassurant en déménagement',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en déménagement',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de déménagement',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à déménagement',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en déménagement',
    seasonal: 'offre de saison dédiée à déménagement',
    loyalty: 'avantage réservé aux clients fidèles en déménagement',
    maintenance: 'un rappel utile pour garder un bon niveau de service en déménagement',
    localHook: 'déménagement au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en déménagement',
  },
};

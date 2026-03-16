import type { JobTemplateDefinition } from '../shared';

export const ambulanceJobTemplates: JobTemplateDefinition = {
  sector: 'transport',
  professionKey: 'ambulance',
  professionLabel: 'Transport médical',
  pack: {
    label: 'Transport médical',
    signature: 'apporter un service clair, fiable et rassurant en transport médical',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en transport médical',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de transport médical',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à transport médical',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en transport médical',
    seasonal: 'offre de saison dédiée à transport médical',
    loyalty: 'avantage réservé aux clients fidèles en transport médical',
    maintenance: 'un rappel utile pour garder un bon niveau de service en transport médical',
    localHook: 'transport médical au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en transport médical',
  },
};

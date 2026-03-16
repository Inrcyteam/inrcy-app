import type { JobTemplateDefinition } from '../shared';

export const fleuristeJobTemplates: JobTemplateDefinition = {
  sector: 'commerce_boutique',
  professionKey: 'fleuriste',
  professionLabel: 'Fleuriste',
  pack: {
    label: 'Fleuriste',
    signature: 'apporter un service clair, fiable et rassurant en fleuriste',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en fleuriste',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de fleuriste',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à fleuriste',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en fleuriste',
    seasonal: 'offre de saison dédiée à fleuriste',
    loyalty: 'avantage réservé aux clients fidèles en fleuriste',
    maintenance: 'un rappel utile pour garder un bon niveau de service en fleuriste',
    localHook: 'fleuriste au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en fleuriste',
  },
};

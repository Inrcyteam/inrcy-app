import type { JobTemplateDefinition } from '../shared';

export const vtcJobTemplates: JobTemplateDefinition = {
  sector: 'transport',
  professionKey: 'vtc',
  professionLabel: 'VTC',
  pack: {
    label: 'VTC',
    signature: 'apporter un service clair, fiable et rassurant en vtc',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en vtc',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de vtc',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à vtc',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en vtc',
    seasonal: 'offre de saison dédiée à vtc',
    loyalty: 'avantage réservé aux clients fidèles en vtc',
    maintenance: 'un rappel utile pour garder un bon niveau de service en vtc',
    localHook: 'vtc au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en vtc',
  },
};

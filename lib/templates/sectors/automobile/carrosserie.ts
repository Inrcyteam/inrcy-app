import type { JobTemplateDefinition } from '../shared';

export const carrosserieJobTemplates: JobTemplateDefinition = {
  sector: 'automobile',
  professionKey: 'carrosserie',
  professionLabel: 'Carrosserie',
  pack: {
    label: 'Carrosserie',
    signature: 'apporter un service clair, fiable et rassurant en carrosserie',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en carrosserie',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de carrosserie',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à carrosserie',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en carrosserie',
    seasonal: 'offre de saison dédiée à carrosserie',
    loyalty: 'avantage réservé aux clients fidèles en carrosserie',
    maintenance: 'un rappel utile pour garder un bon niveau de service en carrosserie',
    localHook: 'carrosserie au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en carrosserie',
  },
};

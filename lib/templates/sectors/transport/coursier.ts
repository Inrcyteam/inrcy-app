import type { JobTemplateDefinition } from '../shared';

export const coursierJobTemplates: JobTemplateDefinition = {
  sector: 'transport',
  professionKey: 'coursier',
  professionLabel: 'Coursier / Livraison',
  pack: {
    label: 'Coursier / Livraison',
    signature: 'apporter un service clair, fiable et rassurant en coursier / livraison',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en coursier / livraison',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de coursier / livraison',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à coursier / livraison',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en coursier / livraison',
    seasonal: 'offre de saison dédiée à coursier / livraison',
    loyalty: 'avantage réservé aux clients fidèles en coursier / livraison',
    maintenance: 'un rappel utile pour garder un bon niveau de service en coursier / livraison',
    localHook: 'coursier / livraison au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en coursier / livraison',
  },
};

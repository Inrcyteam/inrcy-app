import type { JobTemplateDefinition } from '../shared';

export const pharmacieJobTemplates: JobTemplateDefinition = {
  sector: 'sante',
  professionKey: 'pharmacie',
  professionLabel: 'Pharmacie',
  pack: {
    label: 'Pharmacie',
    signature: 'apporter un service clair, fiable et rassurant en pharmacie',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en pharmacie',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de pharmacie',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à pharmacie',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en pharmacie',
    seasonal: 'offre de saison dédiée à pharmacie',
    loyalty: 'avantage réservé aux clients fidèles en pharmacie',
    maintenance: 'un rappel utile pour garder un bon niveau de service en pharmacie',
    localHook: 'pharmacie au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en pharmacie',
  },
};

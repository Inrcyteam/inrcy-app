import type { JobTemplateDefinition } from '../shared';

export const infirmierJobTemplates: JobTemplateDefinition = {
  sector: 'sante',
  professionKey: 'infirmier',
  professionLabel: 'Infirmier / Infirmière',
  pack: {
    label: 'Infirmier / Infirmière',
    signature: 'apporter un service clair, fiable et rassurant en infirmier / infirmière',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en infirmier / infirmière',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de infirmier / infirmière',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à infirmier / infirmière',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en infirmier / infirmière',
    seasonal: 'offre de saison dédiée à infirmier / infirmière',
    loyalty: 'avantage réservé aux clients fidèles en infirmier / infirmière',
    maintenance: 'un rappel utile pour garder un bon niveau de service en infirmier / infirmière',
    localHook: 'infirmier / infirmière au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en infirmier / infirmière',
  },
};

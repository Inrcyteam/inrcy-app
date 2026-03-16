import type { JobTemplateDefinition } from '../shared';

export const consultantJobTemplates: JobTemplateDefinition = {
  sector: 'services_entreprises',
  professionKey: 'consultant',
  professionLabel: 'Consultant',
  pack: {
    label: 'Consultant',
    signature: 'apporter un service clair, fiable et rassurant en consultant',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en consultant',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de consultant',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à consultant',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en consultant',
    seasonal: 'offre de saison dédiée à consultant',
    loyalty: 'avantage réservé aux clients fidèles en consultant',
    maintenance: 'un rappel utile pour garder un bon niveau de service en consultant',
    localHook: 'consultant au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en consultant',
  },
};

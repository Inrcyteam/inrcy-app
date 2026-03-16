import type { JobTemplateDefinition } from '../shared';

export const aide_domicileJobTemplates: JobTemplateDefinition = {
  sector: 'services_particuliers',
  professionKey: 'aide_domicile',
  professionLabel: 'Aide à domicile',
  pack: {
    label: 'Aide à domicile',
    signature: 'apporter un service clair, fiable et rassurant en aide à domicile',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en aide à domicile',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de aide à domicile',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à aide à domicile',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en aide à domicile',
    seasonal: 'offre de saison dédiée à aide à domicile',
    loyalty: 'avantage réservé aux clients fidèles en aide à domicile',
    maintenance: 'un rappel utile pour garder un bon niveau de service en aide à domicile',
    localHook: 'aide à domicile au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en aide à domicile',
  },
};

import type { JobTemplateDefinition } from '../shared';

export const jardinageJobTemplates: JobTemplateDefinition = {
  sector: 'services_particuliers',
  professionKey: 'jardinage',
  professionLabel: 'Jardinage',
  pack: {
    label: 'Jardinage',
    signature: 'apporter un service clair, fiable et rassurant en jardinage',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en jardinage',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de jardinage',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à jardinage',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en jardinage',
    seasonal: 'offre de saison dédiée à jardinage',
    loyalty: 'avantage réservé aux clients fidèles en jardinage',
    maintenance: 'un rappel utile pour garder un bon niveau de service en jardinage',
    localHook: 'jardinage au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en jardinage',
  },
};

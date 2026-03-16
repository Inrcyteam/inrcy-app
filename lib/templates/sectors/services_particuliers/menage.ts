import type { JobTemplateDefinition } from '../shared';

export const menageJobTemplates: JobTemplateDefinition = {
  sector: 'services_particuliers',
  professionKey: 'menage',
  professionLabel: 'Ménage / Entretien',
  pack: {
    label: 'Ménage / Entretien',
    signature: 'apporter un service clair, fiable et rassurant en ménage / entretien',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en ménage / entretien',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de ménage / entretien',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à ménage / entretien',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en ménage / entretien',
    seasonal: 'offre de saison dédiée à ménage / entretien',
    loyalty: 'avantage réservé aux clients fidèles en ménage / entretien',
    maintenance: 'un rappel utile pour garder un bon niveau de service en ménage / entretien',
    localHook: 'ménage / entretien au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en ménage / entretien',
  },
};

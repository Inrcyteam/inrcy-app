import type { JobTemplateDefinition } from '../shared';

export const organisme_formationJobTemplates: JobTemplateDefinition = {
  sector: 'services_entreprises',
  professionKey: 'organisme_formation',
  professionLabel: 'Formation',
  pack: {
    label: 'Formation',
    signature: 'apporter un service clair, fiable et rassurant en formation',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en formation',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de formation',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à formation',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en formation',
    seasonal: 'offre de saison dédiée à formation',
    loyalty: 'avantage réservé aux clients fidèles en formation',
    maintenance: 'un rappel utile pour garder un bon niveau de service en formation',
    localHook: 'formation au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en formation',
  },
};

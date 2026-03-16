import type { JobTemplateDefinition } from '../shared';

export const osteopatheJobTemplates: JobTemplateDefinition = {
  sector: 'sante',
  professionKey: 'osteopathe',
  professionLabel: 'Ostéopathe',
  pack: {
    label: 'Ostéopathe',
    signature: 'apporter un service clair, fiable et rassurant en ostéopathe',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en ostéopathe',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de ostéopathe',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à ostéopathe',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en ostéopathe',
    seasonal: 'offre de saison dédiée à ostéopathe',
    loyalty: 'avantage réservé aux clients fidèles en ostéopathe',
    maintenance: 'un rappel utile pour garder un bon niveau de service en ostéopathe',
    localHook: 'ostéopathe au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en ostéopathe',
  },
};

import type { JobTemplateDefinition } from '../shared';

export const veterinaireJobTemplates: JobTemplateDefinition = {
  sector: 'animalier',
  professionKey: 'veterinaire',
  professionLabel: 'Vétérinaire',
  pack: {
    label: 'Vétérinaire',
    signature: 'apporter un service clair, fiable et rassurant en vétérinaire',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en vétérinaire',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de vétérinaire',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à vétérinaire',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en vétérinaire',
    seasonal: 'offre de saison dédiée à vétérinaire',
    loyalty: 'avantage réservé aux clients fidèles en vétérinaire',
    maintenance: 'un rappel utile pour garder un bon niveau de service en vétérinaire',
    localHook: 'vétérinaire au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en vétérinaire',
  },
};

import type { JobTemplateDefinition } from '../shared';

export const conciergerieJobTemplates: JobTemplateDefinition = {
  sector: 'services_particuliers',
  professionKey: 'conciergerie',
  professionLabel: 'Conciergerie',
  pack: {
    label: 'Conciergerie',
    signature: 'apporter un service clair, fiable et rassurant en conciergerie',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en conciergerie',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de conciergerie',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à conciergerie',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en conciergerie',
    seasonal: 'offre de saison dédiée à conciergerie',
    loyalty: 'avantage réservé aux clients fidèles en conciergerie',
    maintenance: 'un rappel utile pour garder un bon niveau de service en conciergerie',
    localHook: 'conciergerie au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en conciergerie',
  },
};

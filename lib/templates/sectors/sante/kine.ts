import type { JobTemplateDefinition } from '../shared';

export const kineJobTemplates: JobTemplateDefinition = {
  sector: 'sante',
  professionKey: 'kine',
  professionLabel: 'Kinésithérapeute',
  pack: {
    label: 'Kinésithérapeute',
    signature: 'apporter un service clair, fiable et rassurant en kinésithérapeute',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en kinésithérapeute',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de kinésithérapeute',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à kinésithérapeute',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en kinésithérapeute',
    seasonal: 'offre de saison dédiée à kinésithérapeute',
    loyalty: 'avantage réservé aux clients fidèles en kinésithérapeute',
    maintenance: 'un rappel utile pour garder un bon niveau de service en kinésithérapeute',
    localHook: 'kinésithérapeute au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en kinésithérapeute',
  },
};

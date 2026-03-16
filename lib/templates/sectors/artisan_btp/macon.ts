import type { JobTemplateDefinition } from '../shared';

export const maconJobTemplates: JobTemplateDefinition = {
  sector: 'artisan_btp',
  professionKey: 'macon',
  professionLabel: 'Maçon',
  pack: {
    label: 'Maçon',
    signature: 'apporter un service clair, fiable et rassurant en maçon',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en maçon',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de maçon',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à maçon',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en maçon',
    seasonal: 'offre de saison dédiée à maçon',
    loyalty: 'avantage réservé aux clients fidèles en maçon',
    maintenance: 'un rappel utile pour garder un bon niveau de service en maçon',
    localHook: 'maçon au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en maçon',
  },
};

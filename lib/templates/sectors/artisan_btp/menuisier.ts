import type { JobTemplateDefinition } from '../shared';

export const menuisierJobTemplates: JobTemplateDefinition = {
  sector: 'artisan_btp',
  professionKey: 'menuisier',
  professionLabel: 'Menuisier',
  pack: {
    label: 'Menuisier',
    signature: 'apporter un service clair, fiable et rassurant en menuisier',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en menuisier',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de menuisier',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à menuisier',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en menuisier',
    seasonal: 'offre de saison dédiée à menuisier',
    loyalty: 'avantage réservé aux clients fidèles en menuisier',
    maintenance: 'un rappel utile pour garder un bon niveau de service en menuisier',
    localHook: 'menuisier au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en menuisier',
  },
};

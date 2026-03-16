import type { JobTemplateDefinition } from '../shared';

export const peintreJobTemplates: JobTemplateDefinition = {
  sector: 'artisan_btp',
  professionKey: 'peintre',
  professionLabel: 'Peintre',
  pack: {
    label: 'Peintre',
    signature: 'apporter un service clair, fiable et rassurant en peintre',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en peintre',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de peintre',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à peintre',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en peintre',
    seasonal: 'offre de saison dédiée à peintre',
    loyalty: 'avantage réservé aux clients fidèles en peintre',
    maintenance: 'un rappel utile pour garder un bon niveau de service en peintre',
    localHook: 'peintre au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en peintre',
  },
};

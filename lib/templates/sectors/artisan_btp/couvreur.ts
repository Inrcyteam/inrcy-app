import type { JobTemplateDefinition } from '../shared';

export const couvreurJobTemplates: JobTemplateDefinition = {
  sector: 'artisan_btp',
  professionKey: 'couvreur',
  professionLabel: 'Couvreur',
  pack: {
    label: 'Couvreur',
    signature: 'apporter un service clair, fiable et rassurant en couvreur',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en couvreur',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de couvreur',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à couvreur',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en couvreur',
    seasonal: 'offre de saison dédiée à couvreur',
    loyalty: 'avantage réservé aux clients fidèles en couvreur',
    maintenance: 'un rappel utile pour garder un bon niveau de service en couvreur',
    localHook: 'couvreur au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en couvreur',
  },
};

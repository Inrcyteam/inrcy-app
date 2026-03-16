import type { JobTemplateDefinition } from '../shared';

export const chauffagisteJobTemplates: JobTemplateDefinition = {
  sector: 'artisan_btp',
  professionKey: 'chauffagiste',
  professionLabel: 'Chauffagiste',
  pack: {
    label: 'Chauffagiste',
    signature: 'apporter un service clair, fiable et rassurant en chauffagiste',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en chauffagiste',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de chauffagiste',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à chauffagiste',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en chauffagiste',
    seasonal: 'offre de saison dédiée à chauffagiste',
    loyalty: 'avantage réservé aux clients fidèles en chauffagiste',
    maintenance: 'un rappel utile pour garder un bon niveau de service en chauffagiste',
    localHook: 'chauffagiste au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en chauffagiste',
  },
};

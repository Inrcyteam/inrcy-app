import type { JobTemplateDefinition } from '../shared';

export const dentisteJobTemplates: JobTemplateDefinition = {
  sector: 'sante',
  professionKey: 'dentiste',
  professionLabel: 'Dentiste',
  pack: {
    label: 'Dentiste',
    signature: 'apporter un service clair, fiable et rassurant en dentiste',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en dentiste',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de dentiste',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à dentiste',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en dentiste',
    seasonal: 'offre de saison dédiée à dentiste',
    loyalty: 'avantage réservé aux clients fidèles en dentiste',
    maintenance: 'un rappel utile pour garder un bon niveau de service en dentiste',
    localHook: 'dentiste au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en dentiste',
  },
};

import type { JobTemplateDefinition } from '../shared';

export const barJobTemplates: JobTemplateDefinition = {
  sector: 'hotel_restaurant',
  professionKey: 'bar',
  professionLabel: 'Bar / Café',
  pack: {
    label: 'Bar / Café',
    signature: 'apporter un service clair, fiable et rassurant en bar / café',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en bar / café',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de bar / café',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à bar / café',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en bar / café',
    seasonal: 'offre de saison dédiée à bar / café',
    loyalty: 'avantage réservé aux clients fidèles en bar / café',
    maintenance: 'un rappel utile pour garder un bon niveau de service en bar / café',
    localHook: 'bar / café au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en bar / café',
  },
};

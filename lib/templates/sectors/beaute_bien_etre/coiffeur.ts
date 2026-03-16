import type { JobTemplateDefinition } from '../shared';

export const coiffeurJobTemplates: JobTemplateDefinition = {
  sector: 'beaute_bien_etre',
  professionKey: 'coiffeur',
  professionLabel: 'Coiffeur / Barber',
  pack: {
    label: 'Coiffeur / Barber',
    signature: 'apporter un service clair, fiable et rassurant en coiffeur / barber',
    promoLead: 'proposer une offre concrète, un accompagnement utile ou un créneau disponible en coiffeur / barber',
    infoLead: 'partager des conseils, nouveautés et informations pratiques autour de coiffeur / barber',
    followLead: 'suivre les demandes, dossiers, rendez-vous ou projets liés à coiffeur / barber',
    surveyLead: 'mieux comprendre les attentes et besoins concrets en coiffeur / barber',
    seasonal: 'offre de saison dédiée à coiffeur / barber',
    loyalty: 'avantage réservé aux clients fidèles en coiffeur / barber',
    maintenance: 'un rappel utile pour garder un bon niveau de service en coiffeur / barber',
    localHook: 'coiffeur / barber au quotidien',
    audience: 'personnes et entreprises ayant besoin d’un professionnel en coiffeur / barber',
  },
};

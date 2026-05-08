import type { JobTemplateDefinition } from '../shared';

export const restaurantJobTemplates: JobTemplateDefinition = {
  sector: 'hotel_restaurant',
  professionKey: 'restaurant',
  professionLabel: 'Restaurant',
  pack: {
    label: 'Restaurant',
    signature: 'proposer une expérience claire, professionnelle et rassurante autour de l’activité Restaurant',
    promoLead: 'mettre en avant une offre, un rendez-vous, une disponibilité ou un service lié à Restaurant',
    infoLead: 'partager des conseils utiles, nouveautés et informations pratiques autour de Restaurant',
    followLead: 'suivre les demandes, rendez-vous, devis ou dossiers liés à Restaurant',
    surveyLead: 'mieux comprendre les besoins, attentes et priorités des clients intéressés par Restaurant',
    seasonal: 'offre de saison adaptée à l’activité Restaurant',
    loyalty: 'avantage réservé aux clients fidèles de l’activité Restaurant',
    maintenance: 'un rappel utile pour organiser un suivi, un contrôle ou une prochaine prise de contact',
    localHook: 'Restaurant de proximité',
    audience: 'clients ayant besoin d’un professionnel pour Restaurant',
  },
};

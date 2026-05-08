import type { JobTemplateDefinition } from '../shared';

export const hotelJobTemplates: JobTemplateDefinition = {
  sector: 'hotel_restaurant',
  professionKey: 'hotel',
  professionLabel: 'Hôtel',
  pack: {
    label: 'Hôtel',
    signature: 'proposer une expérience claire, professionnelle et rassurante autour de l’activité Hôtel',
    promoLead: 'mettre en avant une offre, un rendez-vous, une disponibilité ou un service lié à Hôtel',
    infoLead: 'partager des conseils utiles, nouveautés et informations pratiques autour de Hôtel',
    followLead: 'suivre les demandes, rendez-vous, devis ou dossiers liés à Hôtel',
    surveyLead: 'mieux comprendre les besoins, attentes et priorités des clients intéressés par Hôtel',
    seasonal: 'offre de saison adaptée à l’activité Hôtel',
    loyalty: 'avantage réservé aux clients fidèles de l’activité Hôtel',
    maintenance: 'un rappel utile pour organiser un suivi, un contrôle ou une prochaine prise de contact',
    localHook: 'Hôtel de proximité',
    audience: 'clients ayant besoin d’un professionnel pour Hôtel',
  },
};

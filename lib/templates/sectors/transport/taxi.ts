import type { JobTemplateDefinition } from '../shared';

export const taxiJobTemplates: JobTemplateDefinition = {
  sector: 'transport',
  professionKey: 'taxi',
  professionLabel: 'Taxi',
  pack: {
    label: 'Taxi',
    signature: 'proposer une expérience claire, professionnelle et rassurante autour de l’activité Taxi',
    promoLead: 'mettre en avant une offre, un rendez-vous, une disponibilité ou un service lié à Taxi',
    infoLead: 'partager des conseils utiles, nouveautés et informations pratiques autour de Taxi',
    followLead: 'suivre les demandes, rendez-vous, devis ou dossiers liés à Taxi',
    surveyLead: 'mieux comprendre les besoins, attentes et priorités des clients intéressés par Taxi',
    seasonal: 'offre de saison adaptée à l’activité Taxi',
    loyalty: 'avantage réservé aux clients fidèles de l’activité Taxi',
    maintenance: 'un rappel utile pour organiser un suivi, un contrôle ou une prochaine prise de contact',
    localHook: 'Taxi de proximité',
    audience: 'clients ayant besoin d’un professionnel pour Taxi',
  },
};

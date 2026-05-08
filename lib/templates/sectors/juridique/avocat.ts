import type { JobTemplateDefinition } from '../shared';

export const avocatJobTemplates: JobTemplateDefinition = {
  sector: 'juridique',
  professionKey: 'avocat',
  professionLabel: 'Avocat',
  pack: {
    label: 'Avocat',
    signature: 'proposer une expérience claire, professionnelle et rassurante autour de l’activité Avocat',
    promoLead: 'mettre en avant une offre, un rendez-vous, une disponibilité ou un service lié à Avocat',
    infoLead: 'partager des conseils utiles, nouveautés et informations pratiques autour de Avocat',
    followLead: 'suivre les demandes, rendez-vous, devis ou dossiers liés à Avocat',
    surveyLead: 'mieux comprendre les besoins, attentes et priorités des clients intéressés par Avocat',
    seasonal: 'offre de saison adaptée à l’activité Avocat',
    loyalty: 'avantage réservé aux clients fidèles de l’activité Avocat',
    maintenance: 'un rappel utile pour organiser un suivi, un contrôle ou une prochaine prise de contact',
    localHook: 'Avocat de proximité',
    audience: 'clients ayant besoin d’un professionnel pour Avocat',
  },
};

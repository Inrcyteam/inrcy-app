import type { JobTemplateDefinition } from '../shared';

export const conciergerieJobTemplates: JobTemplateDefinition = {
  sector: 'services_particuliers',
  professionKey: 'conciergerie',
  professionLabel: 'Conciergerie',
  pack: {
    label: 'Conciergerie',
    signature: 'proposer une expérience claire, professionnelle et rassurante autour de l’activité Conciergerie',
    promoLead: 'mettre en avant une offre, un rendez-vous, une disponibilité ou un service lié à Conciergerie',
    infoLead: 'partager des conseils utiles, nouveautés et informations pratiques autour de Conciergerie',
    followLead: 'suivre les demandes, rendez-vous, devis ou dossiers liés à Conciergerie',
    surveyLead: 'mieux comprendre les besoins, attentes et priorités des clients intéressés par Conciergerie',
    seasonal: 'offre de saison adaptée à l’activité Conciergerie',
    loyalty: 'avantage réservé aux clients fidèles de l’activité Conciergerie',
    maintenance: 'un rappel utile pour organiser un suivi, un contrôle ou une prochaine prise de contact',
    localHook: 'Conciergerie de proximité',
    audience: 'clients ayant besoin d’un professionnel pour Conciergerie',
  },
};

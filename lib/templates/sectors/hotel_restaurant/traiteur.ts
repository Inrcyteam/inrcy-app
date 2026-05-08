import type { JobTemplateDefinition } from '../shared';

export const traiteurJobTemplates: JobTemplateDefinition = {
  sector: 'hotel_restaurant',
  professionKey: 'traiteur',
  professionLabel: 'Traiteur',
  pack: {
    label: 'Traiteur',
    signature: 'proposer une expérience claire, professionnelle et rassurante autour de l’activité Traiteur',
    promoLead: 'mettre en avant une offre, un rendez-vous, une disponibilité ou un service lié à Traiteur',
    infoLead: 'partager des conseils utiles, nouveautés et informations pratiques autour de Traiteur',
    followLead: 'suivre les demandes, rendez-vous, devis ou dossiers liés à Traiteur',
    surveyLead: 'mieux comprendre les besoins, attentes et priorités des clients intéressés par Traiteur',
    seasonal: 'offre de saison adaptée à l’activité Traiteur',
    loyalty: 'avantage réservé aux clients fidèles de l’activité Traiteur',
    maintenance: 'un rappel utile pour organiser un suivi, un contrôle ou une prochaine prise de contact',
    localHook: 'Traiteur de proximité',
    audience: 'clients ayant besoin d’un professionnel pour Traiteur',
  },
};

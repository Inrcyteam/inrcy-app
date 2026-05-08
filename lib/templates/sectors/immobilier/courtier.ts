import type { JobTemplateDefinition } from '../shared';

export const courtierJobTemplates: JobTemplateDefinition = {
  sector: 'immobilier',
  professionKey: 'courtier',
  professionLabel: 'Courtier',
  pack: {
    label: 'Courtier',
    signature: 'proposer une expérience claire, professionnelle et rassurante autour de l’activité Courtier',
    promoLead: 'mettre en avant une offre, un rendez-vous, une disponibilité ou un service lié à Courtier',
    infoLead: 'partager des conseils utiles, nouveautés et informations pratiques autour de Courtier',
    followLead: 'suivre les demandes, rendez-vous, devis ou dossiers liés à Courtier',
    surveyLead: 'mieux comprendre les besoins, attentes et priorités des clients intéressés par Courtier',
    seasonal: 'offre de saison adaptée à l’activité Courtier',
    loyalty: 'avantage réservé aux clients fidèles de l’activité Courtier',
    maintenance: 'un rappel utile pour organiser un suivi, un contrôle ou une prochaine prise de contact',
    localHook: 'Courtier de proximité',
    audience: 'clients ayant besoin d’un professionnel pour Courtier',
  },
};

import type { JobTemplateDefinition } from '../shared';

export const dentisteJobTemplates: JobTemplateDefinition = {
  sector: 'sante',
  professionKey: 'dentiste',
  professionLabel: 'Dentiste',
  pack: {
    label: 'Dentiste',
    signature: 'proposer une expérience claire, professionnelle et rassurante autour de l’activité Dentiste',
    promoLead: 'mettre en avant une offre, un rendez-vous, une disponibilité ou un service lié à Dentiste',
    infoLead: 'partager des conseils utiles, nouveautés et informations pratiques autour de Dentiste',
    followLead: 'suivre les demandes, rendez-vous, devis ou dossiers liés à Dentiste',
    surveyLead: 'mieux comprendre les besoins, attentes et priorités des clients intéressés par Dentiste',
    seasonal: 'offre de saison adaptée à l’activité Dentiste',
    loyalty: 'avantage réservé aux clients fidèles de l’activité Dentiste',
    maintenance: 'un rappel utile pour organiser un suivi, un contrôle ou une prochaine prise de contact',
    localHook: 'Dentiste de proximité',
    audience: 'clients ayant besoin d’un professionnel pour Dentiste',
  },
};

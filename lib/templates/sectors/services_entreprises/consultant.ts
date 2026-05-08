import type { JobTemplateDefinition } from '../shared';

export const consultantJobTemplates: JobTemplateDefinition = {
  sector: 'services_entreprises',
  professionKey: 'consultant',
  professionLabel: 'Consultant',
  pack: {
    label: 'Consultant',
    signature: 'proposer une expérience claire, professionnelle et rassurante autour de l’activité Consultant',
    promoLead: 'mettre en avant une offre, un rendez-vous, une disponibilité ou un service lié à Consultant',
    infoLead: 'partager des conseils utiles, nouveautés et informations pratiques autour de Consultant',
    followLead: 'suivre les demandes, rendez-vous, devis ou dossiers liés à Consultant',
    surveyLead: 'mieux comprendre les besoins, attentes et priorités des clients intéressés par Consultant',
    seasonal: 'offre de saison adaptée à l’activité Consultant',
    loyalty: 'avantage réservé aux clients fidèles de l’activité Consultant',
    maintenance: 'un rappel utile pour organiser un suivi, un contrôle ou une prochaine prise de contact',
    localHook: 'Consultant de proximité',
    audience: 'clients ayant besoin d’un professionnel pour Consultant',
  },
};

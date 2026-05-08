import type { JobTemplateDefinition } from '../shared';

export const pharmacieJobTemplates: JobTemplateDefinition = {
  sector: 'sante',
  professionKey: 'pharmacie',
  professionLabel: 'Pharmacie',
  pack: {
    label: 'Pharmacie',
    signature: 'proposer une expérience claire, professionnelle et rassurante autour de l’activité Pharmacie',
    promoLead: 'mettre en avant une offre, un rendez-vous, une disponibilité ou un service lié à Pharmacie',
    infoLead: 'partager des conseils utiles, nouveautés et informations pratiques autour de Pharmacie',
    followLead: 'suivre les demandes, rendez-vous, devis ou dossiers liés à Pharmacie',
    surveyLead: 'mieux comprendre les besoins, attentes et priorités des clients intéressés par Pharmacie',
    seasonal: 'offre de saison adaptée à l’activité Pharmacie',
    loyalty: 'avantage réservé aux clients fidèles de l’activité Pharmacie',
    maintenance: 'un rappel utile pour organiser un suivi, un contrôle ou une prochaine prise de contact',
    localHook: 'Pharmacie de proximité',
    audience: 'clients ayant besoin d’un professionnel pour Pharmacie',
  },
};

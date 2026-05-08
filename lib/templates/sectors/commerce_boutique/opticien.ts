import type { JobTemplateDefinition } from '../shared';

export const opticienJobTemplates: JobTemplateDefinition = {
  sector: 'commerce_boutique',
  professionKey: 'opticien',
  professionLabel: 'Opticien',
  pack: {
    label: 'Opticien',
    signature: 'proposer une expérience claire, professionnelle et rassurante autour de l’activité Opticien',
    promoLead: 'mettre en avant une offre, un rendez-vous, une disponibilité ou un service lié à Opticien',
    infoLead: 'partager des conseils utiles, nouveautés et informations pratiques autour de Opticien',
    followLead: 'suivre les demandes, rendez-vous, devis ou dossiers liés à Opticien',
    surveyLead: 'mieux comprendre les besoins, attentes et priorités des clients intéressés par Opticien',
    seasonal: 'offre de saison adaptée à l’activité Opticien',
    loyalty: 'avantage réservé aux clients fidèles de l’activité Opticien',
    maintenance: 'un rappel utile pour organiser un suivi, un contrôle ou une prochaine prise de contact',
    localHook: 'Opticien de proximité',
    audience: 'clients ayant besoin d’un professionnel pour Opticien',
  },
};

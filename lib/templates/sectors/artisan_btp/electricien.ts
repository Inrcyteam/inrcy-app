import type { JobTemplateDefinition } from '../shared';

export const electricienJobTemplates: JobTemplateDefinition = {
  sector: 'artisan_btp',
  professionKey: 'electricien',
  professionLabel: 'Électricien',
  pack: {
    label: 'Électricien',
    signature: 'proposer une expérience claire, professionnelle et rassurante autour de l’activité Électricien',
    promoLead: 'mettre en avant une offre, un rendez-vous, une disponibilité ou un service lié à Électricien',
    infoLead: 'partager des conseils utiles, nouveautés et informations pratiques autour de Électricien',
    followLead: 'suivre les demandes, rendez-vous, devis ou dossiers liés à Électricien',
    surveyLead: 'mieux comprendre les besoins, attentes et priorités des clients intéressés par Électricien',
    seasonal: 'offre de saison adaptée à l’activité Électricien',
    loyalty: 'avantage réservé aux clients fidèles de l’activité Électricien',
    maintenance: 'un rappel utile pour organiser un suivi, un contrôle ou une prochaine prise de contact',
    localHook: 'Électricien de proximité',
    audience: 'clients ayant besoin d’un professionnel pour Électricien',
  },
};

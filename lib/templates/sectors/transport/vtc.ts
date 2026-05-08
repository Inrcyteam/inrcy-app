import type { JobTemplateDefinition } from '../shared';

export const vtcJobTemplates: JobTemplateDefinition = {
  sector: 'transport',
  professionKey: 'vtc',
  professionLabel: 'VTC',
  pack: {
    label: 'VTC',
    signature: 'proposer une expérience claire, professionnelle et rassurante autour de l’activité VTC',
    promoLead: 'mettre en avant une offre, un rendez-vous, une disponibilité ou un service lié à VTC',
    infoLead: 'partager des conseils utiles, nouveautés et informations pratiques autour de VTC',
    followLead: 'suivre les demandes, rendez-vous, devis ou dossiers liés à VTC',
    surveyLead: 'mieux comprendre les besoins, attentes et priorités des clients intéressés par VTC',
    seasonal: 'offre de saison adaptée à l’activité VTC',
    loyalty: 'avantage réservé aux clients fidèles de l’activité VTC',
    maintenance: 'un rappel utile pour organiser un suivi, un contrôle ou une prochaine prise de contact',
    localHook: 'VTC de proximité',
    audience: 'clients ayant besoin d’un professionnel pour VTC',
  },
};

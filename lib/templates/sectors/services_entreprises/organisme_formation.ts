import type { JobTemplateDefinition } from '../shared';

export const organisme_formationJobTemplates: JobTemplateDefinition = {
  sector: 'services_entreprises',
  professionKey: 'organisme_formation',
  professionLabel: 'Formation',
  pack: {
    label: 'Formation',
    signature: 'proposer une expérience claire, professionnelle et rassurante autour de l’activité Formation',
    promoLead: 'mettre en avant une offre, un rendez-vous, une disponibilité ou un service lié à Formation',
    infoLead: 'partager des conseils utiles, nouveautés et informations pratiques autour de Formation',
    followLead: 'suivre les demandes, rendez-vous, devis ou dossiers liés à Formation',
    surveyLead: 'mieux comprendre les besoins, attentes et priorités des clients intéressés par Formation',
    seasonal: 'offre de saison adaptée à l’activité Formation',
    loyalty: 'avantage réservé aux clients fidèles de l’activité Formation',
    maintenance: 'un rappel utile pour organiser un suivi, un contrôle ou une prochaine prise de contact',
    localHook: 'Formation de proximité',
    audience: 'clients ayant besoin d’un professionnel pour Formation',
  },
};

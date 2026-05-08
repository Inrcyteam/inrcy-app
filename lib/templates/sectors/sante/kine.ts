import type { JobTemplateDefinition } from '../shared';

export const kineJobTemplates: JobTemplateDefinition = {
  sector: 'sante',
  professionKey: 'kine',
  professionLabel: 'Kinésithérapeute',
  pack: {
    label: 'Kinésithérapeute',
    signature: 'proposer une expérience claire, professionnelle et rassurante autour de l’activité Kinésithérapeute',
    promoLead: 'mettre en avant une offre, un rendez-vous, une disponibilité ou un service lié à Kinésithérapeute',
    infoLead: 'partager des conseils utiles, nouveautés et informations pratiques autour de Kinésithérapeute',
    followLead: 'suivre les demandes, rendez-vous, devis ou dossiers liés à Kinésithérapeute',
    surveyLead: 'mieux comprendre les besoins, attentes et priorités des clients intéressés par Kinésithérapeute',
    seasonal: 'offre de saison adaptée à l’activité Kinésithérapeute',
    loyalty: 'avantage réservé aux clients fidèles de l’activité Kinésithérapeute',
    maintenance: 'un rappel utile pour organiser un suivi, un contrôle ou une prochaine prise de contact',
    localHook: 'Kinésithérapeute de proximité',
    audience: 'clients ayant besoin d’un professionnel pour Kinésithérapeute',
  },
};

import type { JobTemplateDefinition } from '../shared';

export const aide_domicileJobTemplates: JobTemplateDefinition = {
  sector: 'services_particuliers',
  professionKey: 'aide_domicile',
  professionLabel: 'Aide à domicile',
  pack: {
    label: 'Aide à domicile',
    signature: 'proposer une expérience claire, professionnelle et rassurante autour de l’activité Aide à domicile',
    promoLead: 'mettre en avant une offre, un rendez-vous, une disponibilité ou un service lié à Aide à domicile',
    infoLead: 'partager des conseils utiles, nouveautés et informations pratiques autour de Aide à domicile',
    followLead: 'suivre les demandes, rendez-vous, devis ou dossiers liés à Aide à domicile',
    surveyLead: 'mieux comprendre les besoins, attentes et priorités des clients intéressés par Aide à domicile',
    seasonal: 'offre de saison adaptée à l’activité Aide à domicile',
    loyalty: 'avantage réservé aux clients fidèles de l’activité Aide à domicile',
    maintenance: 'un rappel utile pour organiser un suivi, un contrôle ou une prochaine prise de contact',
    localHook: 'Aide à domicile de proximité',
    audience: 'clients ayant besoin d’un professionnel pour Aide à domicile',
  },
};

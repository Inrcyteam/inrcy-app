import type { JobTemplateDefinition } from '../shared';

export const securite_incendieJobTemplates: JobTemplateDefinition = {
  sector: 'securite',
  professionKey: 'securite_incendie',
  professionLabel: 'Sécurité incendie',
  pack: {
    label: 'Sécurité incendie',
    signature: 'prévenir les risques incendie avec des contrôles, consignes et interventions bien cadrés',
    promoLead: 'mettre en avant une mission SSIAP, une vérification, une sensibilisation ou une présence incendie',
    infoLead: 'partager des informations sur les consignes, évacuations, équipements et obligations incendie',
    followLead: 'suivre les contrôles, missions, exercices, rapports et échéances de sécurité incendie',
    surveyLead: 'comprendre le type de site, la fréquentation, les équipements et les obligations',
    seasonal: 'offre de saison pour contrôler ou renforcer la sécurité incendie',
    loyalty: 'avantage réservé aux sites suivis régulièrement',
    maintenance: 'un rappel utile pour vérifier équipements, consignes et échéances incendie',
    localHook: 'sécurité incendie des établissements',
    audience: 'ERP, entreprises et sites recevant du public ayant besoin de sécurité incendie',
  },
};

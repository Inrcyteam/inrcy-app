import type { JobTemplateDefinition } from '../shared';

export const telesurveillanceJobTemplates: JobTemplateDefinition = {
  sector: 'securite',
  professionKey: 'telesurveillance',
  professionLabel: 'Télésurveillance',
  pack: {
    label: 'Télésurveillance',
    signature: 'surveiller les sites à distance avec réactivité, continuité et procédures claires',
    promoLead: 'proposer une solution de télésurveillance, abonnement, raccordement ou audit sécurité',
    infoLead: 'expliquer le fonctionnement, les alertes, la levée de doute et les options de surveillance',
    followLead: 'suivre les demandes, installations, contrats, essais et mises à jour de consignes',
    surveyLead: 'identifier le site, les zones à surveiller, les horaires sensibles et les contacts d’alerte',
    seasonal: 'offre de saison pour renforcer la surveillance à distance',
    loyalty: 'avantage réservé aux clients équipés ou sous contrat',
    maintenance: 'un rappel utile pour vérifier contacts, consignes et fonctionnement du système',
    localHook: 'télésurveillance et protection de sites',
    audience: 'particuliers et professionnels souhaitant surveiller un site à distance',
  },
};

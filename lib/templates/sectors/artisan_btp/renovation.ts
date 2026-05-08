import type { JobTemplateDefinition } from '../shared';

export const renovationJobTemplates: JobTemplateDefinition = {
  sector: 'artisan_btp',
  professionKey: 'renovation',
  professionLabel: 'Rénovation',
  pack: {
    label: 'Rénovation',
    signature: 'transformer un logement ou un local avec des travaux coordonnés, propres et bien expliqués',
    promoLead: 'proposer une solution claire pour rénover, moderniser ou remettre en état un espace',
    infoLead: 'donner des conseils pratiques sur la rénovation, les priorités de travaux, les finitions et l’organisation du chantier',
    followLead: 'relancer les devis, visites, choix de matériaux et étapes de rénovation',
    surveyLead: 'comprendre les pièces à rénover, le niveau de finition attendu et les contraintes du client',
    seasonal: 'offre de saison pour anticiper des travaux de rénovation',
    loyalty: 'avantage réservé aux clients qui poursuivent leurs travaux pièce par pièce',
    maintenance: 'un rappel utile pour contrôler les finitions, les reprises ou les conseils d’entretien',
    localHook: 'rénovation de logements et locaux',
    audience: 'propriétaires, bailleurs et professionnels avec un projet de rénovation',
  },
};

import type { JobTemplateDefinition } from '../shared';

export const traitement_humiditeJobTemplates: JobTemplateDefinition = {
  sector: 'hygiene_habitat',
  professionKey: 'traitement_humidite',
  professionLabel: 'Traitement humidité',
  pack: {
    label: 'Traitement humidité',
    signature: 'diagnostiquer l’humidité et proposer des solutions adaptées pour protéger le logement',
    promoLead: 'mettre en avant un diagnostic humidité, un traitement des murs ou une solution de ventilation',
    infoLead: 'expliquer les causes possibles : remontées capillaires, condensation, infiltrations ou ventilation insuffisante',
    followLead: 'suivre les diagnostics, devis, traitements et contrôles après intervention',
    surveyLead: 'comprendre les signes visibles, les pièces touchées, l’ancienneté du problème et les attentes',
    seasonal: 'offre de saison pour prévenir moisissures et dégradations liées à l’humidité',
    loyalty: 'avantage réservé aux clients qui font contrôler leur logement dans la durée',
    maintenance: 'un rappel utile pour vérifier murs, ventilation et évolution des traces d’humidité',
    localHook: 'traitement de l’humidité dans l’habitat',
    audience: 'propriétaires, bailleurs et occupants confrontés à l’humidité',
  },
};

import type { JobTemplateDefinition } from '../shared';

export const debarrasJobTemplates: JobTemplateDefinition = {
  sector: 'hygiene_habitat',
  professionKey: 'debarras',
  professionLabel: 'Débarras',
  pack: {
    label: 'Débarras',
    signature: 'un débarras organisé, rapide et soigné',
    promoLead: 'proposer une intervention de débarras claire et planifiée',
    infoLead: 'expliquer les étapes d’un débarras sans stress',
    followLead: 'relancer une demande de débarras ou de devis',
    surveyLead: 'mieux qualifier le volume et les contraintes du débarras',
    seasonal: 'créneau débarras saisonnier maison cave grenier',
    loyalty: 'avantage fidélité prévention et intervention',
    maintenance: 'rappel tri évacuation et remise en état',
    localHook: 'débarras local avec devis clair',
    audience: 'particuliers, familles, bailleurs et professionnels',
  },
};

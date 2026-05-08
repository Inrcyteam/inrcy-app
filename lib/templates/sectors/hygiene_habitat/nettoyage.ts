import type { JobTemplateDefinition } from '../shared';

export const nettoyageJobTemplates: JobTemplateDefinition = {
  sector: 'hygiene_habitat',
  professionKey: 'nettoyage',
  professionLabel: 'Nettoyage',
  pack: {
    label: 'Nettoyage',
    signature: 'un service de nettoyage propre, fiable et régulier',
    promoLead: 'proposer une remise en état ou un contrat d’entretien',
    infoLead: 'partager des conseils pour garder des locaux propres',
    followLead: 'relancer un devis ou une intervention de nettoyage',
    surveyLead: 'mieux comprendre les fréquences et zones à entretenir',
    seasonal: 'grand nettoyage saisonnier bureaux logements chantiers',
    loyalty: 'avantage fidélité prévention et intervention',
    maintenance: 'rappel entretien régulier et remise en état',
    localHook: 'nettoyage local ponctuel ou récurrent',
    audience: 'particuliers, entreprises, commerces et copropriétés',
  },
};

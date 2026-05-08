import type { JobTemplateDefinition } from '../shared';

export const vitrierJobTemplates: JobTemplateDefinition = {
  sector: 'hygiene_habitat',
  professionKey: 'vitrier',
  professionLabel: 'Vitrier',
  pack: {
    label: 'Vitrier',
    signature: 'un dépannage vitrage rapide et propre',
    promoLead: 'proposer une intervention vitrage ou remplacement rapide',
    infoLead: 'expliquer les solutions vitrage, sécurité et isolation',
    followLead: 'suivre une demande de remplacement ou dépannage',
    surveyLead: 'identifier le type de vitrage et l’urgence client',
    seasonal: 'sécurisation vitrage après intempéries ou casse',
    loyalty: 'avantage fidélité prévention et intervention',
    maintenance: 'rappel vérification vitrines fenêtres et joints',
    localHook: 'vitrier local pour dépannage et pose',
    audience: 'particuliers, commerces, agences et professionnels',
  },
};

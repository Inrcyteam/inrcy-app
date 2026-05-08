import type { JobTemplateDefinition } from '../shared';

export const ramonageJobTemplates: JobTemplateDefinition = {
  sector: 'hygiene_habitat',
  professionKey: 'ramonage',
  professionLabel: 'Ramonage',
  pack: {
    label: 'Ramonage',
    signature: 'un ramonage sérieux, sécurisé et conforme',
    promoLead: 'mettre en avant un créneau de ramonage disponible',
    infoLead: 'rappeler les bonnes pratiques avant la saison de chauffe',
    followLead: 'relancer un rendez-vous ou un certificat de ramonage',
    surveyLead: 'connaître les équipements et fréquences d’entretien',
    seasonal: 'rappel ramonage avant hiver et saison de chauffe',
    loyalty: 'avantage fidélité prévention et intervention',
    maintenance: 'rappel annuel ramonage conduit poêle cheminée',
    localHook: 'ramonage local avec certificat',
    audience: 'particuliers équipés de cheminée, poêle ou chaudière',
  },
};

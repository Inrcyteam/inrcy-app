import type { JobTemplateDefinition } from '../shared';

export const deratiseurJobTemplates: JobTemplateDefinition = {
  sector: 'hygiene_habitat',
  professionKey: 'deratiseur',
  professionLabel: 'Dératiseur',
  pack: {
    label: 'Dératiseur',
    signature: 'une intervention anti-nuisibles réactive et rassurante',
    promoLead: 'mettre en avant une intervention de dératisation rapide',
    infoLead: 'partager des conseils de prévention contre les rongeurs',
    followLead: 'suivre une demande de traitement ou de contrôle',
    surveyLead: 'identifier les signes d’infestation et les besoins urgents',
    seasonal: 'prévention nuisibles avant les périodes sensibles',
    loyalty: 'avantage fidélité prévention et intervention',
    maintenance: 'rappel contrôle, rebouchage et prévention rongeurs',
    localHook: 'dératisation locale avec diagnostic précis',
    audience: 'particuliers, commerces, syndics et entreprises',
  },
};

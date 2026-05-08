import type { JobTemplateDefinition } from '../shared';

export const psychologueJobTemplates: JobTemplateDefinition = {
  sector: 'sante',
  professionKey: 'psychologue',
  professionLabel: 'Psychologue',
  pack: {
    label: 'Psychologue',
    signature: 'proposer un accompagnement psychologique sérieux, confidentiel et adapté au rythme du patient',
    promoLead: 'présenter un premier rendez-vous, un suivi ou une disponibilité de consultation',
    infoLead: 'expliquer les motifs de consultation, le déroulement des séances et les modalités de rendez-vous',
    followLead: 'suivre les demandes de rendez-vous, reports, suivis et informations pratiques',
    surveyLead: 'comprendre le besoin d’accompagnement, les disponibilités et le cadre souhaité',
    seasonal: 'créneau de consultation disponible pour prendre soin de son équilibre',
    loyalty: 'suivi régulier et attention portée à la continuité de l’accompagnement',
    maintenance: 'un rappel utile pour confirmer un rendez-vous ou reprendre contact si besoin',
    localHook: 'accompagnement psychologique de proximité',
    audience: 'personnes cherchant un psychologue pour un accompagnement personnel ou familial',
  },
};

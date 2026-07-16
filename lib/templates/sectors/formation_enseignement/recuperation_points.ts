import type { JobTemplateDefinition } from '../shared';

export const recuperation_pointsJobTemplates: JobTemplateDefinition = {
  sector: 'formation_enseignement',
  professionKey: 'recuperation_points',
  professionLabel: 'Stage de récupération de points',
  pack: {
    label: 'Stage de récupération de points',
    signature: 'accueillir les conducteurs dans un cadre clair, agréé et pédagogique pour les sensibiliser à la sécurité routière',
    promoLead: 'mettre en avant une date de stage, des places disponibles ou une inscription rapide',
    infoLead: 'partager des informations fiables sur les points, les délais, les conditions d’inscription et le déroulement du stage',
    followLead: 'suivre les inscriptions, justificatifs, paiements, présences et attestations de stage',
    surveyLead: 'comprendre la situation du permis, le type de stage nécessaire, les délais et les disponibilités du conducteur',
    seasonal: 'session de récupération de points disponible prochainement dans un centre agréé',
    loyalty: 'avantage ou information prioritaire réservé aux conducteurs déjà accompagnés',
    maintenance: 'un rappel utile avant le stage pour vérifier les documents, les horaires et les conditions de présence',
    localHook: 'stage de sensibilisation à la sécurité routière dans un centre agréé de proximité',
    audience: 'conducteurs qui souhaitent récupérer des points ou effectuer un stage obligatoire dans les délais',
  },
};

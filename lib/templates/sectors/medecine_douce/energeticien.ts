import type { JobTemplateDefinition } from '../shared';

export const energeticienJobTemplates: JobTemplateDefinition = {
  sector: 'medecine_douce',
  professionKey: 'energeticien',
  professionLabel: 'Praticien énergétique',
  pack: {
    label: 'Praticien énergétique',
    signature: 'accompagner le rééquilibrage énergétique avec une approche douce, claire et personnalisée',
    promoLead: 'proposer une séance énergétique adaptée au stress, à la fatigue ou au besoin de recentrage',
    infoLead: 'partager des conseils sur l’ancrage, l’équilibre émotionnel et le déroulement des séances',
    followLead: 'suivre les demandes, les ressentis après séance et les parcours d’accompagnement',
    surveyLead: 'cerner l’état du moment, les attentes et la fréquence d’accompagnement souhaitée',
    seasonal: 'offre de saison pour relancer l’énergie et retrouver de l’équilibre',
    loyalty: 'avantage réservé aux personnes accompagnées dans la durée',
    maintenance: 'un rappel utile pour faire le point sur l’énergie, les ressentis et les besoins de suivi',
    localHook: 'soins énergétiques et bien-être',
    audience: 'personnes cherchant un accompagnement énergétique doux et personnalisé',
  },
};

import type { JobTemplateDefinition } from '../shared';

export const nutritionnisteJobTemplates: JobTemplateDefinition = {
  sector: 'beaute_bien_etre',
  professionKey: 'nutritionniste',
  professionLabel: 'Nutritionniste',
  pack: {
    label: 'Nutritionniste',
    signature: 'accompagner l’équilibre alimentaire avec des conseils personnalisés, réalistes et durables',
    promoLead: 'mettre en avant un bilan nutritionnel, un suivi ou un programme d’accompagnement',
    infoLead: 'partager des conseils sur l’alimentation, les habitudes, l’organisation des repas et le suivi',
    followLead: 'suivre les bilans, objectifs, plans alimentaires et rendez-vous de contrôle',
    surveyLead: 'comprendre les objectifs, habitudes, contraintes et attentes du client',
    seasonal: 'offre de saison pour reprendre de bonnes habitudes alimentaires',
    loyalty: 'avantage réservé aux clients engagés dans un suivi nutritionnel',
    maintenance: 'un rappel utile pour faire le point sur les résultats et ajuster les conseils',
    localHook: 'accompagnement nutritionnel personnalisé',
    audience: 'personnes souhaitant améliorer leur alimentation avec un suivi professionnel',
  },
};

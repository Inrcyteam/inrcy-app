import type { JobTemplateDefinition } from '../shared';

export const promoteur_immobilierJobTemplates: JobTemplateDefinition = {
  sector: 'immobilier',
  professionKey: 'promoteur_immobilier',
  professionLabel: 'Promoteur immobilier',
  pack: {
    label: 'Promoteur immobilier',
    signature: 'présenter des programmes immobiliers avec clarté, projection et accompagnement acquéreur',
    promoLead: 'mettre en avant un programme neuf, une disponibilité, un lancement commercial ou un rendez-vous',
    infoLead: 'informer sur les lots, plans, financement, calendrier de livraison et étapes d’achat',
    followLead: 'suivre les demandes d’informations, réservations, rendez-vous et avancement programme',
    surveyLead: 'comprendre le projet d’achat, le budget, le type de bien et l’objectif d’investissement',
    seasonal: 'offre ou lancement de saison pour découvrir un programme immobilier',
    loyalty: 'attention réservée aux investisseurs, partenaires et acquéreurs suivis',
    maintenance: 'un rappel utile sur les étapes, documents ou échéances du programme',
    localHook: 'programmes immobiliers neufs',
    audience: 'acquéreurs, investisseurs et prescripteurs intéressés par un programme immobilier',
  },
};

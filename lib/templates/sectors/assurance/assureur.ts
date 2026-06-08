import type { JobTemplateDefinition } from '../shared';

export const assureurJobTemplates: JobTemplateDefinition = {
  sector: 'assurance',
  professionKey: 'assureur',
  professionLabel: 'Assureur',
  pack: {
    label: 'Assureur',
    signature: 'proposer un conseil clair, rassurant et adapté autour de l’activité Assureur',
    promoLead: 'mettre en avant une offre, un rendez-vous, une disponibilité ou un service lié à Assureur',
    infoLead: 'partager des conseils utiles, rappels et informations pratiques autour de Assureur',
    followLead: 'suivre les demandes, rendez-vous, devis, contrats ou dossiers liés à Assureur',
    surveyLead: 'mieux comprendre les besoins, garanties et priorités des clients intéressés par Assureur',
    seasonal: 'offre de saison adaptée à l’activité Assureur',
    loyalty: 'avantage réservé aux clients fidèles de l’activité Assureur',
    maintenance: 'un rappel utile pour vérifier ses garanties ou faire évoluer un contrat',
    localHook: 'Assureur de proximité',
    audience: 'clients ayant besoin d’un professionnel pour Assureur',
  },
};

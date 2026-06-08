import type { JobTemplateDefinition } from '../shared';

export const campingJobTemplates: JobTemplateDefinition = {
  sector: 'tourisme',
  professionKey: 'camping',
  professionLabel: 'Camping',
  pack: {
    label: 'Camping',
    signature: 'proposer un accompagnement clair, utile et adapté autour de l’activité Camping',
    promoLead: 'mettre en avant une offre, une disponibilité ou un service lié à Camping',
    infoLead: 'partager des conseils, informations pratiques et nouveautés autour de Camping',
    followLead: 'suivre les demandes, réservations, projets ou dossiers liés à Camping',
    surveyLead: 'mieux comprendre les besoins et attentes des clients intéressés par Camping',
    seasonal: 'offre de saison adaptée à l’activité Camping',
    loyalty: 'avantage réservé aux clients fidèles de l’activité Camping',
    maintenance: 'un rappel utile pour refaire le point ou planifier une prochaine action liée à Camping',
    localHook: 'Camping de proximité',
    audience: 'clients ayant besoin d’un professionnel pour Camping',
  },
};

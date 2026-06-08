import type { JobTemplateDefinition } from '../shared';

export const maraicherJobTemplates: JobTemplateDefinition = {
  sector: 'agriculture_producteurs',
  professionKey: 'maraicher',
  professionLabel: 'Maraîcher',
  pack: {
    label: 'Maraîcher',
    signature: 'proposer un accompagnement clair, utile et adapté autour de l’activité Maraîcher',
    promoLead: 'mettre en avant une offre, une disponibilité ou un service lié à Maraîcher',
    infoLead: 'partager des conseils, informations pratiques et nouveautés autour de Maraîcher',
    followLead: 'suivre les demandes, réservations, projets ou dossiers liés à Maraîcher',
    surveyLead: 'mieux comprendre les besoins et attentes des clients intéressés par Maraîcher',
    seasonal: 'offre de saison adaptée à l’activité Maraîcher',
    loyalty: 'avantage réservé aux clients fidèles de l’activité Maraîcher',
    maintenance: 'un rappel utile pour refaire le point ou planifier une prochaine action liée à ce métier',
    localHook: 'Maraîcher de proximité',
    audience: 'clients ayant besoin d’un professionnel pour Maraîcher',
  },
};

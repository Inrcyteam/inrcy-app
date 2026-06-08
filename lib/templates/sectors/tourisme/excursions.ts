import type { JobTemplateDefinition } from '../shared';

export const excursionsJobTemplates: JobTemplateDefinition = {
  sector: 'tourisme',
  professionKey: 'excursions',
  professionLabel: 'Excursions',
  pack: {
    label: 'Excursions',
    signature: 'proposer un accompagnement clair, utile et adapté autour de l’activité Excursions',
    promoLead: 'mettre en avant une offre, une disponibilité ou un service lié à Excursions',
    infoLead: 'partager des conseils, informations pratiques et nouveautés autour de Excursions',
    followLead: 'suivre les demandes, réservations, projets ou dossiers liés à Excursions',
    surveyLead: 'mieux comprendre les besoins et attentes des clients intéressés par Excursions',
    seasonal: 'offre de saison adaptée à l’activité Excursions',
    loyalty: 'avantage réservé aux clients fidèles de l’activité Excursions',
    maintenance: 'un rappel utile pour refaire le point ou planifier une prochaine action liée à Excursions',
    localHook: 'Excursions de proximité',
    audience: 'clients ayant besoin d’un professionnel pour Excursions',
  },
};

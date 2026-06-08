import type { JobTemplateDefinition } from '../shared';

export const agenceurJobTemplates: JobTemplateDefinition = {
  sector: 'artisan_btp',
  professionKey: 'agenceur',
  professionLabel: 'Agenceur',
  pack: {
    label: 'Agenceur',
    signature: 'proposer un accompagnement clair, utile et adapté autour de l’activité Agenceur',
    promoLead: 'mettre en avant une offre, une disponibilité ou un service lié à Agenceur',
    infoLead: 'partager des conseils, informations pratiques et nouveautés autour de Agenceur',
    followLead: 'suivre les demandes, réservations, projets ou dossiers liés à Agenceur',
    surveyLead: 'mieux comprendre les besoins et attentes des clients intéressés par Agenceur',
    seasonal: 'offre de saison adaptée à l’activité Agenceur',
    loyalty: 'avantage réservé aux clients fidèles de l’activité Agenceur',
    maintenance: 'un rappel utile pour refaire le point ou planifier une prochaine action liée à Agenceur',
    localHook: 'Agenceur de proximité',
    audience: 'clients ayant besoin d’un professionnel pour Agenceur',
  },
};

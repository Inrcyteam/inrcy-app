import type { JobTemplateDefinition } from '../shared';

export const apiculteurJobTemplates: JobTemplateDefinition = {
  sector: 'agriculture_producteurs',
  professionKey: 'apiculteur',
  professionLabel: 'Apiculteur',
  pack: {
    label: 'Apiculteur',
    signature: 'proposer un accompagnement clair, utile et adapté autour de l’activité Apiculteur',
    promoLead: 'mettre en avant une offre, une disponibilité ou un service lié à Apiculteur',
    infoLead: 'partager des conseils, informations pratiques et nouveautés autour de Apiculteur',
    followLead: 'suivre les demandes, réservations, projets ou dossiers liés à Apiculteur',
    surveyLead: 'mieux comprendre les besoins et attentes des clients intéressés par Apiculteur',
    seasonal: 'offre de saison adaptée à l’activité Apiculteur',
    loyalty: 'avantage réservé aux clients fidèles de l’activité Apiculteur',
    maintenance: 'un rappel utile pour refaire le point ou planifier une prochaine action liée à ce métier',
    localHook: 'Apiculteur de proximité',
    audience: 'clients ayant besoin d’un professionnel pour Apiculteur',
  },
};

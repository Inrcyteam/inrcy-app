import type { JobTemplateDefinition } from '../shared';

export const salle_receptionJobTemplates: JobTemplateDefinition = {
  sector: 'evenementiel',
  professionKey: 'salle_reception',
  professionLabel: 'Salle de réception',
  pack: {
    label: 'Salle de réception',
    signature: 'accueillir les événements dans un lieu adapté, bien présenté et facile à organiser',
    promoLead: 'mettre en avant une disponibilité, une visite, une formule ou une réservation de salle',
    infoLead: 'informer sur les capacités, équipements, options, accès et conseils d’organisation',
    followLead: 'suivre les demandes de dates, visites, devis, options et réservations',
    surveyLead: 'comprendre le type d’événement, la date, le nombre d’invités et les besoins techniques',
    seasonal: 'offre de saison pour réserver une salle de réception',
    loyalty: 'avantage réservé aux organisateurs ou clients réguliers',
    maintenance: 'un rappel utile avant visite, validation d’options ou échéance de réservation',
    localHook: 'salle de réception et événements locaux',
    audience: 'particuliers, associations et entreprises cherchant une salle pour leur événement',
  },
};

import type { JobTemplateDefinition } from '../shared';

export const ambulanceJobTemplates: JobTemplateDefinition = {
  sector: 'transport',
  professionKey: 'ambulance',
  professionLabel: 'Ambulancier',
  pack: {
    label: 'Ambulancier',
    signature: 'organiser le transport sanitaire avec ponctualité, écoute et respect du patient',
    promoLead: 'présenter une prise en charge, une disponibilité ou une information de transport sanitaire',
    infoLead: 'informer sur les trajets médicaux, documents nécessaires, rendez-vous et conditions de transport',
    followLead: 'suivre les demandes de transport, confirmations, rendez-vous médicaux et retours',
    surveyLead: 'identifier le trajet, le rendez-vous, le niveau d’accompagnement et les documents nécessaires',
    seasonal: 'information utile pour organiser les transports médicaux à venir',
    loyalty: 'suivi attentif réservé aux patients et établissements réguliers',
    maintenance: 'un rappel utile pour confirmer un trajet ou anticiper un rendez-vous médical',
    localHook: 'transport sanitaire local',
    audience: 'patients, familles et établissements ayant besoin d’un transport sanitaire',
  },
};

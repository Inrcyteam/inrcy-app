import type { JobTemplateDefinition } from '../shared';

export const orthophonisteJobTemplates: JobTemplateDefinition = {
  sector: 'sante',
  professionKey: 'orthophoniste',
  professionLabel: 'Orthophoniste',
  pack: {
    label: 'Orthophoniste',
    signature: 'accompagner les troubles du langage et de la communication avec un suivi structuré et bienveillant',
    promoLead: 'proposer un bilan orthophonique, un suivi ou une information sur les disponibilités',
    infoLead: 'informer sur le bilan, la rééducation, le suivi enfant/adulte et les démarches pratiques',
    followLead: 'suivre les bilans, séances, rendez-vous et échanges avec les familles',
    surveyLead: 'comprendre l’âge, la demande, l’orientation, les disponibilités et les priorités de suivi',
    seasonal: 'créneau ou information utile pour organiser un suivi orthophonique',
    loyalty: 'continuité de suivi pour les patients déjà accompagnés',
    maintenance: 'un rappel utile pour confirmer une séance, transmettre une information ou faire le point',
    localHook: 'suivi orthophonique de proximité',
    audience: 'patients et familles cherchant un orthophoniste pour un bilan ou une rééducation',
  },
};

import type { SectorTemplateDefinition } from '../shared';

export const santeTemplates: SectorTemplateDefinition = {
  sector: 'sante',
  pack: {
    label: 'Santé',
    signature: 'faciliter l’information et le suivi des patients avec une communication claire et rassurante',
    promoLead: 'mettre en avant une disponibilité, une information de cabinet ou un rendez-vous utile',
    infoLead: 'partager des informations pratiques sur le cabinet, les consultations et le suivi',
    followLead: 'suivre les rendez-vous, rappels, demandes et informations patient',
    surveyLead: 'comprendre les besoins de rendez-vous, disponibilités et attentes pratiques',
    seasonal: 'information utile pour organiser un rendez-vous ou un suivi',
    loyalty: 'continuité de suivi pour les patients déjà accompagnés',
    maintenance: 'un rappel utile pour confirmer un rendez-vous ou organiser un suivi',
    localHook: 'soins et accompagnement de proximité',
    audience: 'patients cherchant un professionnel de santé',
  },
};

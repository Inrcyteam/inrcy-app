import type { JobTemplateDefinition } from '../shared';

export const reikiJobTemplates: JobTemplateDefinition = {
  sector: 'medecine_douce',
  professionKey: 'reiki',
  professionLabel: 'Reiki',
  pack: {
    label: 'Reiki',
    signature: 'favoriser détente, harmonisation et recentrage grâce à des séances Reiki accessibles et rassurantes',
    promoLead: 'proposer une séance Reiki découverte, un suivi ou une harmonisation énergétique',
    infoLead: 'expliquer simplement le Reiki, le déroulement d’une séance et les bénéfices recherchés',
    followLead: 'suivre les prises de rendez-vous, les retours de séance et les parcours réguliers',
    surveyLead: 'comprendre l’objectif de la personne, son niveau de stress et son besoin d’accompagnement',
    seasonal: 'offre de saison pour s’accorder une pause Reiki et retrouver de l’apaisement',
    loyalty: 'attention réservée aux personnes qui reviennent pour un suivi Reiki',
    maintenance: 'un rappel bienveillant pour prendre des nouvelles après une séance Reiki',
    localHook: 'séances Reiki de proximité',
    audience: 'personnes souhaitant découvrir ou poursuivre un accompagnement Reiki',
  },
};

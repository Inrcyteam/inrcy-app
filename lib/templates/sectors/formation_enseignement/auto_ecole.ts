import type { JobTemplateDefinition } from '../shared';

export const auto_ecoleJobTemplates: JobTemplateDefinition = {
  sector: 'formation_enseignement',
  professionKey: 'auto_ecole',
  professionLabel: 'Auto-école',
  pack: {
    label: 'Auto-école',
    signature: 'faire progresser chaque élève avec une pédagogie adaptée, un suivi clair et une préparation sérieuse au permis',
    promoLead: 'mettre en avant une formule permis, une inscription, une place disponible ou une offre de conduite',
    infoLead: 'partager des conseils sur le Code de la route, la conduite, les examens et les démarches du permis',
    followLead: 'suivre les inscriptions, heures de conduite, évaluations, dossiers et dates d’examen',
    surveyLead: 'comprendre le niveau, les disponibilités, le type de boîte et l’objectif permis de chaque élève',
    seasonal: 'offre permis ou inscription adaptée aux vacances, à la rentrée ou aux disponibilités d’examen',
    loyalty: 'avantage réservé aux élèves déjà inscrits ou aux familles qui recommandent l’auto-école',
    maintenance: 'un rappel utile pour réserver une leçon, compléter le dossier ou préparer l’examen',
    localHook: 'auto-école et apprentissage de la conduite de proximité',
    audience: 'élèves, jeunes conducteurs et adultes qui souhaitent obtenir ou reprendre leur permis de conduire',
  },
};

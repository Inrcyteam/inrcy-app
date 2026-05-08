import type { JobTemplateDefinition } from '../shared';

export const coach_sportifJobTemplates: JobTemplateDefinition = {
  sector: 'beaute_bien_etre',
  professionKey: 'coach_sportif',
  professionLabel: 'Coach sportif',
  pack: {
    label: 'Coach sportif',
    signature: 'aider chaque client à progresser avec un programme clair, motivant et adapté à son niveau',
    promoLead: 'proposer une séance découverte, un bilan forme ou un programme personnalisé',
    infoLead: 'partager des conseils simples sur l’entraînement, la récupération, la régularité et les objectifs sportifs',
    followLead: 'suivre les bilans, programmes, progrès et prochaines séances',
    surveyLead: 'identifier l’objectif, le niveau, les contraintes et la motivation du client',
    seasonal: 'offre de saison pour reprendre le sport ou préparer un objectif',
    loyalty: 'avantage réservé aux clients suivis régulièrement',
    maintenance: 'un rappel utile pour faire le point sur les progrès et ajuster le programme',
    localHook: 'coaching sportif personnalisé',
    audience: 'personnes souhaitant reprendre le sport, progresser ou être accompagnées sérieusement',
  },
};

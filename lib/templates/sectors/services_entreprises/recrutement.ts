import type { JobTemplateDefinition } from '../shared';

export const recrutementJobTemplates: JobTemplateDefinition = {
  sector: 'services_entreprises',
  professionKey: 'recrutement',
  professionLabel: 'Recrutement',
  pack: {
    label: 'Recrutement',
    signature: 'aider les entreprises à recruter avec méthode, clarté et suivi candidat',
    promoLead: 'proposer un accompagnement recrutement, une mission, un audit ou une recherche de profil',
    infoLead: 'partager des conseils sur les besoins RH, fiches de poste, entretiens et intégration',
    followLead: 'suivre les missions, candidats, entretiens, retours clients et décisions',
    surveyLead: 'comprendre le poste, les compétences, le contexte, l’urgence et le budget',
    seasonal: 'offre de saison pour préparer les recrutements clés',
    loyalty: 'avantage réservé aux entreprises accompagnées régulièrement',
    maintenance: 'un rappel utile pour faire le point sur les besoins RH ou les recrutements en cours',
    localHook: 'recrutement et accompagnement RH',
    audience: 'entreprises ayant besoin de recruter ou structurer leur démarche RH',
  },
};

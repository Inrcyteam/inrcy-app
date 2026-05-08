import type { JobTemplateDefinition } from '../shared';

export const assainissementJobTemplates: JobTemplateDefinition = {
  sector: 'hygiene_habitat',
  professionKey: 'assainissement',
  professionLabel: 'Assainissement',
  pack: {
    label: 'Assainissement',
    signature: 'intervenir sur les réseaux et installations avec réactivité, diagnostic clair et solutions durables',
    promoLead: 'proposer une intervention d’assainissement, débouchage, curage ou mise aux normes',
    infoLead: 'informer sur l’entretien des canalisations, fosses, réseaux et signes d’alerte',
    followLead: 'suivre les demandes urgentes, devis, diagnostics et interventions programmées',
    surveyLead: 'qualifier le problème, l’installation, l’urgence et l’accès au chantier',
    seasonal: 'offre de saison pour contrôler ou entretenir les installations d’assainissement',
    loyalty: 'avantage réservé aux clients avec entretien régulier ou contrat de suivi',
    maintenance: 'un rappel utile pour éviter bouchons, odeurs ou débordements',
    localHook: 'assainissement et réseaux locaux',
    audience: 'particuliers, entreprises et collectivités ayant besoin d’un professionnel de l’assainissement',
  },
};

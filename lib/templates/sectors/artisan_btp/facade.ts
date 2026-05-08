import type { JobTemplateDefinition } from '../shared';

export const facadeJobTemplates: JobTemplateDefinition = {
  sector: 'artisan_btp',
  professionKey: 'facade',
  professionLabel: 'Façade',
  pack: {
    label: 'Façade',
    signature: 'redonner de la valeur aux façades avec un diagnostic clair et une finition soignée',
    promoLead: 'proposer une solution pour nettoyer, rénover, protéger ou embellir une façade',
    infoLead: 'partager des conseils sur l’état des murs extérieurs, les fissures, les enduits et l’entretien de façade',
    followLead: 'suivre les devis, diagnostics, choix de teintes et plannings de chantier façade',
    surveyLead: 'comprendre l’état de la façade, le support, les attentes esthétiques et les contraintes d’accès',
    seasonal: 'offre de saison pour préparer un ravalement ou un traitement de façade',
    loyalty: 'avantage réservé aux clients qui entretiennent régulièrement leurs extérieurs',
    maintenance: 'un rappel utile pour surveiller fissures, humidité ou salissures de façade',
    localHook: 'façades et ravalements locaux',
    audience: 'propriétaires et professionnels souhaitant rénover ou entretenir une façade',
  },
};

import type { JobTemplateDefinition } from '../shared';

export const constructionJobTemplates: JobTemplateDefinition = {
  sector: 'artisan_btp',
  professionKey: 'construction',
  professionLabel: 'Construction',
  pack: {
    label: 'Construction',
    signature: 'accompagner des projets de construction avec un suivi clair, des délais maîtrisés et un chantier bien cadré',
    promoLead: 'présenter une solution concrète pour lancer, chiffrer ou planifier un projet de construction',
    infoLead: 'partager des conseils utiles sur les étapes d’un chantier, les matériaux, les délais et la préparation du projet',
    followLead: 'suivre les demandes de devis, visites techniques, validations et avancées de chantier',
    surveyLead: 'identifier le type de projet, le budget, les priorités et les contraintes du futur chantier',
    seasonal: 'offre de saison pour préparer un projet de construction dans de bonnes conditions',
    loyalty: 'avantage réservé aux clients qui confient plusieurs travaux ou recommandent l’entreprise',
    maintenance: 'un rappel utile pour vérifier l’avancement, les garanties ou les points de finition après chantier',
    localHook: 'projets de construction locaux',
    audience: 'particuliers, professionnels et porteurs de projet cherchant une entreprise de construction',
  },
};

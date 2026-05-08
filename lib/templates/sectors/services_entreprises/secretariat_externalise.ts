import type { JobTemplateDefinition } from '../shared';

export const secretariat_externaliseJobTemplates: JobTemplateDefinition = {
  sector: 'services_entreprises',
  professionKey: 'secretariat_externalise',
  professionLabel: 'Secrétariat externalisé',
  pack: {
    label: 'Secrétariat externalisé',
    signature: 'soulager les dirigeants avec une gestion administrative claire, organisée et flexible',
    promoLead: 'mettre en avant une formule de secrétariat, gestion administrative ou assistance externalisée',
    infoLead: 'partager des conseils sur l’organisation, les relances, les documents et le suivi administratif',
    followLead: 'suivre les demandes, dossiers, tâches, échéances et prestations récurrentes',
    surveyLead: 'identifier le volume, les tâches à déléguer, les outils et le rythme souhaité',
    seasonal: 'offre de saison pour remettre l’administratif à plat',
    loyalty: 'avantage réservé aux clients suivis chaque mois',
    maintenance: 'un rappel utile pour anticiper échéances, relances ou documents à traiter',
    localHook: 'secrétariat externalisé pour professionnels',
    audience: 'indépendants, TPE et dirigeants souhaitant déléguer leur administratif',
  },
};

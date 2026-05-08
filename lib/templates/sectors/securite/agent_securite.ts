import type { JobTemplateDefinition } from '../shared';

export const agent_securiteJobTemplates: JobTemplateDefinition = {
  sector: 'securite',
  professionKey: 'agent_securite',
  professionLabel: 'Agent de sécurité',
  pack: {
    label: 'Agent de sécurité',
    signature: 'assurer une présence dissuasive, professionnelle et adaptée aux risques du site',
    promoLead: 'proposer une mission d’agent de sécurité, surveillance, filtrage ou présence événementielle',
    infoLead: 'expliquer les missions possibles, les horaires, les consignes, le filtrage et la prévention',
    followLead: 'suivre les demandes de mission, devis, plannings, consignes et rapports d’intervention',
    surveyLead: 'identifier le site, les horaires, les flux, les risques et les consignes attendues',
    seasonal: 'offre de saison pour sécuriser un site, un commerce ou un événement',
    loyalty: 'avantage réservé aux clients avec missions régulières',
    maintenance: 'un rappel utile pour mettre à jour les consignes ou préparer une nouvelle mission',
    localHook: 'agents de sécurité et surveillance locale',
    audience: 'professionnels et organisateurs ayant besoin d’une présence sécurité',
  },
};

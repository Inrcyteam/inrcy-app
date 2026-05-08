import type { JobTemplateDefinition } from '../shared';

export const controle_techniqueJobTemplates: JobTemplateDefinition = {
  sector: 'automobile',
  professionKey: 'controle_technique',
  professionLabel: 'Contrôle technique',
  pack: {
    label: 'Contrôle technique',
    signature: 'aider les automobilistes à passer leur contrôle technique simplement, dans les délais et avec les bonnes informations',
    promoLead: 'proposer un rendez-vous rapide, une contre-visite ou un rappel d’échéance',
    infoLead: 'informer sur les points contrôlés, les délais, la contre-visite et la préparation du véhicule',
    followLead: 'suivre les rendez-vous, échéances, contre-visites et rappels clients',
    surveyLead: 'identifier le véhicule, l’échéance, le besoin de contre-visite et les disponibilités',
    seasonal: 'offre de saison pour anticiper le contrôle technique',
    loyalty: 'avantage réservé aux clients qui reviennent pour leurs prochains contrôles',
    maintenance: 'un rappel utile avant l’échéance du contrôle technique',
    localHook: 'contrôle technique de proximité',
    audience: 'automobilistes ayant un contrôle technique ou une contre-visite à prévoir',
  },
};

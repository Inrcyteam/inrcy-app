import type { JobTemplateDefinition } from '../shared';

export const eleveurJobTemplates: JobTemplateDefinition = {
  sector: 'animalier',
  professionKey: 'eleveur',
  professionLabel: 'Éleveur',
  pack: {
    label: 'Éleveur',
    signature: 'présenter un élevage sérieux avec transparence, conseils et suivi des futurs propriétaires',
    promoLead: 'mettre en avant une portée, une disponibilité, une visite ou un accompagnement adoption',
    infoLead: 'partager des conseils sur la race, la santé, la socialisation et l’arrivée de l’animal',
    followLead: 'suivre les demandes, réservations, visites, documents et nouvelles des portées',
    surveyLead: 'comprendre le projet d’adoption, le foyer, les attentes et les disponibilités',
    seasonal: 'information de saison sur les disponibilités ou visites d’élevage',
    loyalty: 'attention réservée aux familles déjà accompagnées ou recommandées',
    maintenance: 'un rappel utile pour prendre des nouvelles après adoption',
    localHook: 'élevage et accompagnement animalier',
    audience: 'familles et passionnés recherchant un animal auprès d’un éleveur sérieux',
  },
};

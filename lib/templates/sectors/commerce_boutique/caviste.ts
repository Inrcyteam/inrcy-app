import type { JobTemplateDefinition } from '../shared';

export const cavisteJobTemplates: JobTemplateDefinition = {
  sector: 'commerce_boutique',
  professionKey: 'caviste',
  professionLabel: 'Caviste',
  pack: {
    label: 'Caviste',
    signature: 'conseiller les clients avec goût, pédagogie et sélections adaptées à chaque occasion',
    promoLead: 'mettre en avant une sélection, une dégustation, un coffret ou une offre événement',
    infoLead: 'partager des conseils d’accords, nouveautés, arrivages et idées cadeaux',
    followLead: 'suivre les réservations, commandes, coffrets, dégustations et demandes professionnelles',
    surveyLead: 'identifier l’occasion, les goûts, le budget et le nombre de personnes',
    seasonal: 'sélection de saison pour repas, cadeaux ou événements',
    loyalty: 'avantage réservé aux clients réguliers et amateurs de belles sélections',
    maintenance: 'un rappel utile pour renouveler une sélection ou préparer un événement',
    localHook: 'cave, conseils et dégustations',
    audience: 'clients cherchant vins, spiritueux, coffrets ou conseils personnalisés',
  },
};

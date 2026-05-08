import type { JobTemplateDefinition } from '../shared';

export const bijouterieJobTemplates: JobTemplateDefinition = {
  sector: 'commerce_boutique',
  professionKey: 'bijouterie',
  professionLabel: 'Bijouterie',
  pack: {
    label: 'Bijouterie',
    signature: 'valoriser les bijoux, conseils et occasions avec une communication élégante et rassurante',
    promoLead: 'présenter une collection, une création, une réparation ou une offre cadeau',
    infoLead: 'partager des conseils sur l’entretien, le choix d’un bijou, les tailles et les occasions',
    followLead: 'suivre les demandes, commandes, réparations, mises à taille et réservations',
    surveyLead: 'comprendre le style recherché, le budget, l’occasion et le délai',
    seasonal: 'offre de saison pour cadeaux, événements ou nouvelles collections',
    loyalty: 'attention réservée aux clients fidèles de la bijouterie',
    maintenance: 'un rappel utile pour entretien, nettoyage ou contrôle d’un bijou',
    localHook: 'bijouterie et conseils cadeaux',
    audience: 'clients recherchant un bijou, une réparation ou un conseil personnalisé',
  },
};

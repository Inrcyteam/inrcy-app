import type { JobTemplateDefinition } from '../shared';

export const magasin_meublesJobTemplates: JobTemplateDefinition = {
  sector: 'commerce_boutique',
  professionKey: 'magasin_meubles',
  professionLabel: 'Magasin de meubles',
  pack: {
    label: 'Magasin de meubles',
    signature: 'aider les clients à meubler leur intérieur avec des conseils pratiques, esthétiques et adaptés',
    promoLead: 'présenter une collection, une offre salon, literie, rangement ou aménagement',
    infoLead: 'partager des conseils d’aménagement, dimensions, matières, livraison et entretien',
    followLead: 'suivre les commandes, devis, livraisons, réservations et demandes de conseil',
    surveyLead: 'comprendre la pièce, le style, les dimensions, le budget et le délai',
    seasonal: 'offre de saison pour aménager ou renouveler son intérieur',
    loyalty: 'avantage réservé aux clients qui équipent plusieurs pièces',
    maintenance: 'un rappel utile pour suivi de commande, entretien ou garantie mobilier',
    localHook: 'meubles et aménagement intérieur',
    audience: 'clients souhaitant meubler, décorer ou optimiser leur intérieur',
  },
};

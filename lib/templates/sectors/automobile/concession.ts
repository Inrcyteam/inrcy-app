import type { JobTemplateDefinition } from '../shared';

export const concessionJobTemplates: JobTemplateDefinition = {
  sector: 'automobile',
  professionKey: 'concession',
  professionLabel: 'Concession',
  pack: {
    label: 'Concession',
    signature: 'accompagner chaque projet de véhicule avec un conseil clair, un choix adapté et un suivi professionnel avant comme après la vente',
    promoLead: 'mettre en avant une arrivée en stock, une offre, une reprise, un financement ou une opportunité sur un véhicule',
    infoLead: 'partager des conseils utiles sur le choix d’un véhicule, le financement, la reprise, l’entretien et les nouveautés de la concession',
    followLead: 'suivre les demandes, essais, reprises, financements, commandes, livraisons et besoins après-vente',
    surveyLead: 'mieux comprendre le type de véhicule recherché, l’usage, le budget, le mode de financement et le calendrier du client',
    seasonal: 'offre de saison ou sélection de véhicules adaptée aux usages et projets du moment',
    loyalty: 'avantage réservé aux clients fidèles pour leur prochain véhicule, leur entretien ou leurs accessoires',
    maintenance: 'un rappel utile pour l’entretien, le suivi après-vente ou le renouvellement du véhicule',
    localHook: 'concession et véhicules disponibles à proximité',
    audience: 'particuliers et professionnels recherchant un véhicule neuf ou d’occasion, une reprise, un financement ou un accompagnement après-vente',
  },
};

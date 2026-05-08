import type { SectorTemplateDefinition } from '../shared';

export const automobileTemplates: SectorTemplateDefinition = {
  sector: 'automobile',
  pack: {
    label: 'Automobile',
    signature: 'accompagner les conducteurs avec des services clairs, rapides et utiles pour leur véhicule',
    promoLead: 'mettre en avant une intervention, un rendez-vous, une offre entretien ou une disponibilité véhicule',
    infoLead: 'partager des conseils sur l’entretien, la sécurité, les échéances et les bons réflexes auto',
    followLead: 'suivre les demandes, devis, rendez-vous, réparations et rappels véhicule',
    surveyLead: 'comprendre le véhicule, le besoin, l’urgence et les disponibilités du client',
    seasonal: 'offre de saison pour préparer ou entretenir son véhicule',
    loyalty: 'avantage réservé aux clients qui entretiennent leur véhicule régulièrement',
    maintenance: 'un rappel utile pour anticiper entretien, contrôle ou réparation',
    localHook: 'services automobiles locaux',
    audience: 'conducteurs et professionnels ayant besoin d’un service automobile',
  },
};

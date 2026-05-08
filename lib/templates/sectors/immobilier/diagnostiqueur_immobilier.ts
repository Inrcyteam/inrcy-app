import type { JobTemplateDefinition } from '../shared';

export const diagnostiqueur_immobilierJobTemplates: JobTemplateDefinition = {
  sector: 'immobilier',
  professionKey: 'diagnostiqueur_immobilier',
  professionLabel: 'Diagnostiqueur immobilier',
  pack: {
    label: 'Diagnostiqueur immobilier',
    signature: 'sécuriser ventes et locations avec des diagnostics fiables, clairs et remis dans les délais',
    promoLead: 'proposer un pack diagnostics, un DPE ou une intervention rapide avant vente/location',
    infoLead: 'expliquer les diagnostics obligatoires, les délais, la préparation du logement et les documents utiles',
    followLead: 'suivre les devis, rendez-vous, rapports, urgences vente/location et relances',
    surveyLead: 'identifier le bien, la transaction, la surface, l’année et les diagnostics nécessaires',
    seasonal: 'offre de saison pour anticiper les diagnostics avant mise en vente ou location',
    loyalty: 'avantage réservé aux agences, bailleurs et clients réguliers',
    maintenance: 'un rappel utile avant expiration ou mise à jour d’un diagnostic',
    localHook: 'diagnostics immobiliers locaux',
    audience: 'propriétaires, bailleurs, agences et notaires ayant besoin de diagnostics',
  },
};

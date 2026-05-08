import type { JobTemplateDefinition } from '../shared';

export const terrassementJobTemplates: JobTemplateDefinition = {
  sector: 'artisan_btp',
  professionKey: 'terrassement',
  professionLabel: 'Terrassement',
  pack: {
    label: 'Terrassement',
    signature: 'préparer les terrains avec précision pour des chantiers solides et bien organisés',
    promoLead: 'présenter une intervention de terrassement, nivellement, accès ou préparation de chantier',
    infoLead: 'expliquer les étapes avant terrassement, l’évacuation, les accès et les contraintes du terrain',
    followLead: 'suivre les visites terrain, devis, autorisations, planning et démarrage des travaux',
    surveyLead: 'qualifier le terrain, les volumes, l’accès chantier et le type de projet prévu',
    seasonal: 'offre de saison pour préparer un terrain avant construction ou aménagement',
    loyalty: 'avantage réservé aux clients qui enchaînent terrassement, aménagement ou réseaux',
    maintenance: 'un rappel utile pour vérifier les accès, écoulements ou reprises après intervention',
    localHook: 'terrassements et préparations de terrain',
    audience: 'clients ayant un projet de construction, d’accès, de cour ou d’aménagement extérieur',
  },
};

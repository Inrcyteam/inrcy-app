import type { JobTemplateDefinition } from '../shared';

export const videosurveillanceJobTemplates: JobTemplateDefinition = {
  sector: 'securite',
  professionKey: 'videosurveillance',
  professionLabel: 'Vidéosurveillance',
  pack: {
    label: 'Vidéosurveillance',
    signature: 'installer ou optimiser des systèmes vidéo fiables pour surveiller les zones sensibles',
    promoLead: 'mettre en avant une installation, modernisation, audit ou maintenance de vidéosurveillance',
    infoLead: 'partager des conseils sur caméras, zones à couvrir, stockage, accès distant et réglementation',
    followLead: 'suivre les devis, visites techniques, installations, réglages et maintenances',
    surveyLead: 'comprendre les zones à couvrir, le nombre d’accès, l’usage attendu et les contraintes techniques',
    seasonal: 'offre de saison pour moderniser ou contrôler la vidéosurveillance',
    loyalty: 'avantage réservé aux clients équipés sur plusieurs zones ou sites',
    maintenance: 'un rappel utile pour vérifier caméras, enregistreur, accès distant et qualité d’image',
    localHook: 'vidéosurveillance de locaux et habitations',
    audience: 'commerces, entreprises et particuliers souhaitant équiper ou améliorer leur vidéosurveillance',
  },
};

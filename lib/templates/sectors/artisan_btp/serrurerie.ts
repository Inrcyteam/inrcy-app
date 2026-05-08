import type { JobTemplateDefinition } from '../shared';

export const serrurerieJobTemplates: JobTemplateDefinition = {
  sector: 'artisan_btp',
  professionKey: 'serrurerie',
  professionLabel: 'Serrurerie',
  pack: {
    label: 'Serrurerie',
    signature: 'sécuriser les accès avec des interventions rapides, propres et rassurantes',
    promoLead: 'proposer une solution pour dépannage, remplacement, sécurisation ou installation de serrure',
    infoLead: 'partager des conseils sur la sécurité des portes, cylindres, verrous et accès sensibles',
    followLead: 'suivre les demandes d’intervention, devis de sécurisation et installations programmées',
    surveyLead: 'identifier le type d’accès, l’urgence, le niveau de sécurité attendu et les contraintes de pose',
    seasonal: 'offre de saison pour renforcer la sécurité des accès',
    loyalty: 'avantage réservé aux clients qui sécurisent plusieurs portes ou sites',
    maintenance: 'un rappel utile pour contrôler serrures, clés, accès et points de fermeture',
    localHook: 'sécurisation des accès',
    audience: 'particuliers, commerces et entreprises ayant besoin d’un serrurier',
  },
};

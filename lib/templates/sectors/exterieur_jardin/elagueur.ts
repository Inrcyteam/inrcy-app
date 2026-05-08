import type { JobTemplateDefinition } from '../shared';

export const elagueurJobTemplates: JobTemplateDefinition = {
  sector: 'exterieur_jardin',
  professionKey: 'elagueur',
  professionLabel: 'Élagueur',
  pack: {
    label: 'Élagueur',
    signature: 'entretenir les arbres avec des interventions sécurisées, raisonnées et respectueuses du végétal',
    promoLead: 'mettre en avant une intervention d’élagage, abattage, taille ou diagnostic arbre',
    infoLead: 'partager des conseils utiles, informations pratiques et points de vigilance autour de Élagueur',
    followLead: 'suivre les demandes, devis, interventions, rendez-vous ou projets liés à Élagueur',
    surveyLead: 'identifier les besoins, contraintes, délais et priorités des clients intéressés par Élagueur',
    seasonal: 'offre de saison pour sécuriser les arbres avant intempéries ou préparer une taille adaptée',
    loyalty: 'avantage réservé aux clients réguliers de l’activité Élagueur',
    maintenance: 'un rappel utile pour organiser un entretien, un contrôle, une intervention ou une prochaine prise de contact',
    localHook: 'Élagueur de proximité',
    audience: 'clients ayant besoin d’un professionnel pour Élagueur',
  },
};

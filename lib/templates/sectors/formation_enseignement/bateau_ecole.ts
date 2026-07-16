import type { JobTemplateDefinition } from '../shared';

export const bateau_ecoleJobTemplates: JobTemplateDefinition = {
  sector: 'formation_enseignement',
  professionKey: 'bateau_ecole',
  professionLabel: 'Bateau-école',
  pack: {
    label: 'Bateau-école',
    signature: 'préparer les candidats à naviguer avec autonomie, maîtrise des règles et bons réflexes de sécurité',
    promoLead: 'mettre en avant une session permis bateau, une place disponible ou une formule de préparation',
    infoLead: 'partager des conseils sur la réglementation, le balisage, la météo, la navigation et les examens',
    followLead: 'suivre les inscriptions, dossiers, cours théoriques, séances pratiques et convocations',
    surveyLead: 'comprendre le permis visé, l’expérience nautique, les disponibilités et le projet de navigation',
    seasonal: 'session permis bateau adaptée à la saison nautique et aux prochaines dates d’examen',
    loyalty: 'avantage réservé aux anciens candidats pour une extension ou une formation complémentaire',
    maintenance: 'un rappel utile pour réviser, compléter le dossier ou planifier la pratique',
    localHook: 'formation au permis bateau et à la navigation de proximité',
    audience: 'plaisanciers et futurs navigateurs qui souhaitent obtenir un permis côtier, fluvial ou hauturier',
  },
};

import type { JobTemplateDefinition } from '../shared';

export const moto_ecoleJobTemplates: JobTemplateDefinition = {
  sector: 'formation_enseignement',
  professionKey: 'moto_ecole',
  professionLabel: 'Moto-école',
  pack: {
    label: 'Moto-école',
    signature: 'former des motards autonomes et responsables grâce à un apprentissage progressif du plateau, de la circulation et de la sécurité',
    promoLead: 'mettre en avant une formule moto, une passerelle, une session ou une disponibilité de formation',
    infoLead: 'partager des conseils sur l’équipement, le plateau, la circulation, les catégories de permis et la sécurité à moto',
    followLead: 'suivre les inscriptions, séances plateau, heures de circulation, dossiers et dates d’examen',
    surveyLead: 'comprendre l’expérience, la catégorie de permis visée, les disponibilités et les besoins de chaque élève',
    seasonal: 'offre ou session moto adaptée à la saison et aux prochaines dates d’examen',
    loyalty: 'avantage réservé aux anciens élèves pour une passerelle ou une formation complémentaire',
    maintenance: 'un rappel utile pour réserver une séance, préparer le plateau ou finaliser le dossier',
    localHook: 'formation moto et sécurité deux-roues de proximité',
    audience: 'débutants, conducteurs de scooter et motards qui préparent un permis ou une passerelle',
  },
};

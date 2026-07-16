import type { JobTemplateDefinition } from '../shared';

export const formation_code_routeJobTemplates: JobTemplateDefinition = {
  sector: 'formation_enseignement',
  professionKey: 'formation_code_route',
  professionLabel: 'Centre de formation au Code de la route',
  pack: {
    label: 'Centre de formation au Code de la route',
    signature: 'aider chaque candidat à comprendre les règles, progresser régulièrement et arriver confiant à l’examen',
    promoLead: 'mettre en avant une formule de Code, un accès en ligne, une session intensive ou une inscription',
    infoLead: 'partager des conseils de révision, des explications réglementaires, des pièges fréquents et des informations sur l’examen',
    followLead: 'suivre les inscriptions, résultats aux séries, progression, examens blancs et dates d’épreuve',
    surveyLead: 'comprendre le niveau, le rythme de révision, les difficultés et la date d’examen visée',
    seasonal: 'formule de préparation au Code adaptée aux vacances, à la rentrée ou à un examen proche',
    loyalty: 'avantage réservé aux candidats déjà inscrits pour prolonger ou renforcer leur préparation',
    maintenance: 'un rappel utile pour réviser, effectuer une série, participer à un cours ou réserver l’examen',
    localHook: 'préparation au Code de la route en salle et en ligne',
    audience: 'candidats au permis auto, moto ou professionnel qui souhaitent réussir l’épreuve théorique',
  },
};

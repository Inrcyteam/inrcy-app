import type { JobTemplateDefinition } from '../shared';

export const podologueJobTemplates: JobTemplateDefinition = {
  sector: 'sante',
  professionKey: 'podologue',
  professionLabel: 'Podologue',
  pack: {
    label: 'Podologue',
    signature: 'prendre soin des pieds, de la posture et du confort de marche avec un accompagnement précis',
    promoLead: 'proposer un bilan podologique, des semelles, un soin ou un rendez-vous de contrôle',
    infoLead: 'partager des conseils sur douleurs, posture, chaussures, semelles et suivi podologique',
    followLead: 'suivre les rendez-vous, bilans, renouvellements et contrôles de semelles',
    surveyLead: 'identifier les douleurs, l’activité, les chaussures, les antécédents et l’objectif du patient',
    seasonal: 'offre ou rappel de saison pour contrôler confort, posture et appuis',
    loyalty: 'attention réservée aux patients suivis régulièrement',
    maintenance: 'un rappel utile pour renouveler, ajuster ou contrôler les semelles',
    localHook: 'podologie et confort de marche',
    audience: 'patients ayant besoin d’un bilan, de soins ou de semelles podologiques',
  },
};

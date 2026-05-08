import type { JobTemplateDefinition } from '../shared';

export const magnetiseurJobTemplates: JobTemplateDefinition = {
  sector: 'medecine_douce',
  professionKey: 'magnetiseur',
  professionLabel: 'Magnétiseur',
  pack: {
    label: 'Magnétiseur',
    signature: 'proposer un accompagnement énergétique apaisant, humain et respectueux du rythme de chacun',
    promoLead: 'présenter une séance de magnétisme ou un accompagnement énergétique adapté au besoin du moment',
    infoLead: 'expliquer le déroulement d’une séance, les ressentis possibles et les situations où un accompagnement peut aider',
    followLead: 'suivre les demandes de séance, les retours après rendez-vous et les accompagnements réguliers',
    surveyLead: 'comprendre les attentes, le niveau de stress, les inconforts ressentis et les objectifs de la personne',
    seasonal: 'offre de saison pour retrouver équilibre, détente et énergie',
    loyalty: 'attention réservée aux personnes suivies régulièrement',
    maintenance: 'un rappel doux pour prendre des nouvelles après une séance et proposer un suivi si besoin',
    localHook: 'accompagnement énergétique de proximité',
    audience: 'personnes cherchant un magnétiseur pour un mieux-être, une détente ou un accompagnement complémentaire',
  },
};

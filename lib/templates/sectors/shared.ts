import type { TemplateAction, TemplateDef } from '@/lib/messageTemplates';
import { buildTemplateMetadata } from '@/lib/templates/intelligentContext';
import type { ActivitySectorCategory } from '@/lib/activitySectors';

export type SectorPack = {
  label: string;
  signature: string;
  promoLead: string;
  infoLead: string;
  followLead: string;
  surveyLead: string;
  seasonal: string;
  loyalty: string;
  maintenance: string;
  localHook: string;
  audience: string;
};

export type VariantSeed = {
  slug: string;
  title: string;
  subject: string;
  body: (_pack: SectorPack) => string;
  ctaLabel?: string;
};

export type SectorTemplateDefinition = {
  sector: ActivitySectorCategory;
  pack: SectorPack;
  extraTemplates?: Partial<Record<Extract<TemplateAction, 'valoriser' | 'avis' | 'offres' | 'informations' | 'suivis' | 'enquetes'>, TemplateDef[]>>;
};

export type JobTemplateDefinition = {
  sector: ActivitySectorCategory;
  professionKey: string;
  professionLabel: string;
  pack: SectorPack;
  extraTemplates?: Partial<Record<Extract<TemplateAction, 'valoriser' | 'avis' | 'offres' | 'informations' | 'suivis' | 'enquetes'>, TemplateDef[]>>;
};

const boosterValoriserSeeds: VariantSeed[] = [
  {
    slug: 'realisation',
    title: 'Réalisation récente',
    subject: 'Une réalisation concrète signée {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Nous mettons en avant une réalisation récente dans notre univers ${pack.label.toLowerCase()}.\n\n` +
      '🏁 Contexte\n' +
      `• besoin lié à ${pack.localHook}\n` +
      '• intervention / prestation : {{services}}\n' +
      `• objectif : ${pack.signature}\n\n` +
      '📍 Zone : {{zones}}\n' +
      '👉 Vous avez un besoin similaire ? {{cta_url}}\n\n' +
      'À bientôt,\n{{prenom}} — {{nom_entreprise}}',
    ctaLabel: '{{cta_label}}',
  },
  {
    slug: 'savoir_faire',
    title: 'Savoir-faire métier',
    subject: 'Notre savoir-faire chez {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Dans notre métier {{metier}}, notre valeur repose sur une approche claire : ${pack.signature}.\n\n` +
      '🧠 Notre méthode\n' +
      '• écoute du besoin\n' +
      `• conseil adapté à ${pack.audience}\n` +
      '• réalisation avec soin\n' +
      '• suivi si nécessaire\n\n' +
      'Nos prestations : {{services}}\n' +
      '📍 Zone : {{zones}}\n\n' +
      'Contact : {{telephone}} ou {{cta_url}}',
    ctaLabel: '{{cta_label}}',
  },
  {
    slug: 'pourquoi_nous',
    title: 'Pourquoi nous choisir',
    subject: 'Pourquoi choisir {{nom_entreprise}} ?',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Avant de choisir un professionnel, il faut être rassuré. Chez {{nom_entreprise}}, nous mettons l’accent sur ${pack.signature}.\n\n` +
      '✅ Ce qui fait la différence\n' +
      `• une réponse adaptée à ${pack.audience}\n` +
      `• une présence locale : ${pack.localHook}\n` +
      '• des prestations claires : {{services}}\n' +
      '• nos points forts : {{forces}}\n\n' +
      '👉 Discuter de votre besoin : {{cta_url}}',
    ctaLabel: '{{cta_label}}',
  },
  {
    slug: 'cas_client',
    title: 'Cas client / problème résolu',
    subject: 'Un problème résolu par {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Voici un exemple de situation dans laquelle notre accompagnement peut faire la différence pour ${pack.audience}.\n\n` +
      '🔎 Problème de départ : [situation]\n' +
      '🛠️ Solution mise en place : [intervention]\n' +
      '✅ Résultat : [bénéfice obtenu]\n\n' +
      `Ce type d’action illustre notre engagement : ${pack.signature}.\n\n` +
      'Contact : {{telephone}} ou {{cta_url}}',
    ctaLabel: 'Parler de mon besoin',
  },
  {
    slug: 'preuve_locale',
    title: 'Preuve locale',
    subject: '{{nom_entreprise}} intervient près de chez vous',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Nous accompagnons régulièrement nos clients sur {{zones}} pour ${pack.localHook}.\n\n` +
      '📍 Exemple local\n' +
      '• secteur : [ville / quartier]\n' +
      '• besoin : [besoin traité]\n' +
      '• solution : {{services}}\n\n' +
      'Cette proximité nous permet de proposer une réponse plus réactive et adaptée.\n\n' +
      '👉 Nous contacter : {{cta_url}}',
    ctaLabel: '{{cta_label}}',
  },
  {
    slug: 'coulisses',
    title: 'Coulisses rassurantes',
    subject: 'Dans les coulisses de {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Aujourd’hui, nous partageons un aperçu de notre manière de travailler pour ${pack.signature}.\n\n` +
      '🔍 En pratique\n' +
      '• préparation sérieuse\n' +
      `• attention portée à ${pack.localHook}\n` +
      '• intervention claire et soignée\n' +
      '• conseil après prestation si nécessaire\n\n' +
      'Merci pour votre confiance,\n{{prenom}} — {{nom_entreprise}}',
  },
  {
    slug: 'faq_rassurante',
    title: 'FAQ rassurante',
    subject: '3 réponses utiles avant de choisir {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      'Voici 3 réponses aux questions fréquentes avant de faire appel à nous.\n\n' +
      `1) Quand faut-il agir sur ${pack.localHook} ?\n` +
      '2) Quelle prestation est la plus adaptée ?\n' +
      '3) Comment se déroule la prise en charge ?\n\n' +
      `Notre objectif : ${pack.signature}.\n\n` +
      'Pour une réponse adaptée : {{telephone}} ou {{cta_url}}',
    ctaLabel: 'Poser une question',
  },
  {
    slug: 'engagements',
    title: 'Méthode / engagements',
    subject: 'Nos engagements chez {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Dans notre activité {{metier}}, nos engagements sont simples : ${pack.signature}.\n\n` +
      '✅ Notre cadre\n' +
      '• écoute du besoin\n' +
      '• explication claire\n' +
      '• intervention adaptée\n' +
      '• disponibilité après échange ou prestation\n\n' +
      'Nos prestations : {{services}}\n' +
      'Zone : {{zones}}\n\n' +
      'Contact : {{cta_url}}',
    ctaLabel: '{{cta_label}}',
  },
];


const boosterAvisSeeds: VariantSeed[] = [
  {
    slug: 'apres_prestation',
    title: 'Demande d’avis après prestation',
    subject: 'Votre avis compte pour {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Merci encore pour votre confiance. Dans notre univers ${pack.label.toLowerCase()}, les retours clients sont essentiels pour rassurer les prochaines personnes qui nous découvrent.\n\n` +
      'Si vous avez 1 minute, votre avis nous aiderait beaucoup.\n\n' +
      '🧩 Prestation / sujet : {{services}}\n' +
      '📍 Zone : {{zones}}\n\n' +
      '👉 Laisser un avis : {{avis_url}}\n\n' +
      'Merci beaucoup,\n{{prenom}} — {{nom_entreprise}}',
    ctaLabel: 'Laisser un avis',
  },
  {
    slug: 'experience_client',
    title: 'Retour d’expérience client',
    subject: 'Comment s’est passée votre expérience ?',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Nous espérons que votre expérience avec {{nom_entreprise}} a été positive. Notre objectif reste simple : ${pack.signature}.\n\n` +
      'Votre retour nous aide à progresser et à mieux accompagner nos prochains clients.\n\n' +
      '👉 Vous pouvez laisser un avis ici : {{avis_url}}\n\n' +
      'Vous pouvez aussi répondre directement à ce mail si vous préférez.\n\n' +
      'Bien à vous,\n{{nom_entreprise}}',
    ctaLabel: 'Partager mon retour',
  },
  {
    slug: 'preuve_locale',
    title: 'Avis pour renforcer la confiance locale',
    subject: 'Votre avis aide {{nom_entreprise}} localement',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Votre avis peut aider d’autres personnes proches de {{zones}} à choisir un professionnel de confiance pour ${pack.localHook}.\n\n` +
      'Quelques mots suffisent : ce que vous avez apprécié, le service rendu, ou la qualité de l’échange.\n\n' +
      '👉 Laisser un avis : {{avis_url}}\n\n' +
      'Merci pour votre aide,\n{{prenom}} — {{nom_entreprise}}',
    ctaLabel: 'Laisser un avis',
  },
  {
    slug: 'recommandation',
    title: 'Avis + recommandation',
    subject: 'Une recommandation pour {{nom_entreprise}} ?',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Si notre accompagnement vous a été utile, votre recommandation peut faire la différence auprès de ${pack.audience}.\n\n` +
      'Vous pouvez nous aider de deux façons simples :\n' +
      '• laisser un avis en ligne\n' +
      '• parler de {{nom_entreprise}} à une personne qui pourrait avoir besoin de {{services}}\n\n' +
      '👉 Lien avis : {{avis_url}}\n\n' +
      'Merci pour votre confiance,\n{{nom_entreprise}}',
    ctaLabel: 'Recommander',
  },
];

const boosterOffresSeeds: VariantSeed[] = [
  {
    slug: 'decouverte',
    title: 'Offre découverte',
    subject: 'Offre découverte {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Nous lançons une offre découverte pensée pour {{metier}}. L’objectif : ${pack.promoLead}.\n\n` +
      '✅ Ce que comprend l’offre\n' +
      `• Une première approche adaptée à ${pack.audience}\n` +
      `• Un bénéfice clair : ${pack.signature}\n` +
      '• Prestations concernées : {{services}}\n' +
      '• Zone : {{zones}}\n\n' +
      '👉 Demander les détails / réserver : {{cta_url}}\n\n' +
      'À bientôt,\n{{prenom}} — {{nom_entreprise}}',
    ctaLabel: '{{cta_label}}',
  },
  {
    slug: 'saison',
    title: 'Offre du moment',
    subject: 'Notre offre du moment — {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Chez {{nom_entreprise}}, nous proposons actuellement une ${pack.seasonal}.\n\n` +
      '🔎 Idéal pour\n' +
      `• ${pack.audience}\n` +
      `• ${pack.localHook}\n` +
      `• ${pack.signature}\n\n` +
      '📍 Nous intervenons sur {{zones}}.\n' +
      '📞 Contact direct : {{telephone}}\n\n' +
      'Bien à vous,\n{{nom_entreprise}}',
    ctaLabel: '{{cta_label}}',
  },
  {
    slug: 'flash',
    title: 'Offre flash',
    subject: 'Offre flash cette semaine — {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      'Nous avons ouvert quelques créneaux / disponibilités et nous en profitons pour proposer une offre flash.\n\n' +
      '⚡ Offre limitée\n' +
      '• créneau ou avantage prioritaire selon vos disponibilités\n' +
      `• priorité aux demandes liées à ${pack.localHook}\n` +
      '• sur : {{services}}\n\n' +
      '👉 Réserver / demander un devis : {{cta_url}}\n\n' +
      'À bientôt,\n{{prenom}} — {{nom_entreprise}}',
    ctaLabel: '{{cta_label}}',
  },
  {
    slug: 'fidelite',
    title: 'Avantage clients réguliers',
    subject: 'Merci pour votre fidélité — {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Pour remercier nos clients réguliers, nous mettons en place un ${pack.loyalty}.\n\n` +
      '🎁 Avantage fidélité\n' +
      `• un suivi ou avantage adapté aux clients qui reviennent pour ${pack.localHook}\n` +
      '• valable sur : {{services}}\n' +
      '• contact : {{telephone}}\n\n' +
      'Merci pour votre confiance,\n{{prenom}} — {{nom_entreprise}}',
    ctaLabel: 'En profiter',
  },
  {
    slug: 'nouveau_client',
    title: 'Offre de bienvenue',
    subject: 'Bienvenue chez {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      'Si c’est votre première prise de contact avec {{nom_entreprise}}, nous avons prévu une offre de bienvenue.\n\n' +
      '🎁 Offre nouveau client\n' +
      `• un premier échange pour cadrer votre besoin en ${pack.label.toLowerCase()}\n` +
      '• applicable sur : {{services}}\n' +
      '• zone : {{zones}}\n\n' +
      '👉 Démarrer : {{cta_url}}\n\n' +
      'À bientôt,\n{{prenom}} — {{nom_entreprise}}',
    ctaLabel: 'Découvrir',
  },
  {
    slug: 'pack',
    title: 'Offre pack / formule',
    subject: 'Pack utile du moment — {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      'Nous avons réuni plusieurs prestations complémentaires dans une formule simple et avantageuse.\n\n' +
      '📦 Le pack comprend\n' +
      '• plusieurs prestations complémentaires : {{services}}\n' +
      `• une approche cohérente pour ${pack.audience}\n` +
      `• un suivi pensé pour ${pack.signature}\n\n` +
      `Parfait pour : ${pack.localHook}\n` +
      '👉 Plus d’infos : {{cta_url}}\n\n' +
      'Bien à vous,\n{{nom_entreprise}}',
    ctaLabel: '{{cta_label}}',
  },
  {
    slug: 'disponibilite',
    title: 'Créneaux disponibles',
    subject: 'Des créneaux sont disponibles — {{nom_entreprise}}',
    body: () =>
      'Bonjour,\n\n' +
      'Bonne nouvelle : nous avons ouvert des créneaux disponibles prochainement sur {{zones}}.\n\n' +
      '🗓️ Cela peut être utile si vous cherchez :\n' +
      '• une intervention rapide\n' +
      '• un rendez-vous prioritaire\n' +
      '• un devis / échange dans les prochains jours\n\n' +
      '👉 Réserver : {{cta_url}}\n\n' +
      'À bientôt,\n{{prenom}} — {{nom_entreprise}}',
    ctaLabel: 'Réserver',
  },
  {
    slug: 'lancement',
    title: 'Lancement d’offre',
    subject: 'Nouvelle offre {{metier}} chez {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Nous lançons une nouvelle formule liée à notre activité {{metier}} pour ${pack.promoLead}.\n\n` +
      '🚀 Ce lancement comprend\n' +
      `• une formule dédiée à ${pack.label.toLowerCase()}\n` +
      `• un bénéfice concret : ${pack.signature}\n` +
      '• une prise de contact simple pour adapter la solution\n\n' +
      '📍 Disponible sur : {{zones}}\n' +
      '👉 En profiter : {{cta_url}}\n\n' +
      'Bien à vous,\n{{nom_entreprise}}',
    ctaLabel: '{{cta_label}}',
  },
  {
    slug: 'urgent',
    title: 'Offre intervention rapide',
    subject: 'Besoin rapide ? Nous avons une solution',
    body: () =>
      'Bonjour,\n\n' +
      'Pour les demandes urgentes ou prioritaires, nous avons prévu une formule réactive adaptée à {{metier}}.\n\n' +
      '⏱️ Cette offre peut inclure\n' +
      '• un délai plus court\n' +
      '• une réponse plus rapide\n' +
      '• une prise de rendez-vous simplifiée\n\n' +
      '📞 Contactez-nous : {{telephone}}\n' +
      '👉 Ou laissez votre demande ici : {{cta_url}}\n\n' +
      'À bientôt,\n{{prenom}} — {{nom_entreprise}}',
    ctaLabel: 'Demander un rappel',
  },
  {
    slug: 'reactivation',
    title: 'Offre retour client',
    subject: 'Une offre pensée pour votre retour',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Comme nous accompagnons souvent nos clients dans la durée, nous avons préparé une offre de reprise de contact pour ${pack.loyalty}.\n\n` +
      '💬 Cette offre peut vous convenir si vous avez de nouveau besoin de :\n' +
      '• {{services}}\n' +
      '• un conseil rapide\n' +
      '• une mise à jour / relance de projet\n\n' +
      '👉 Voir l’offre : {{cta_url}}\n\n' +
      'Bien cordialement,\n{{nom_entreprise}}',
    ctaLabel: '{{cta_label}}',
  },
];

const fideliserInformationsSeeds: VariantSeed[] = [
  {
    slug: 'nouveaute',
    title: 'Nouvelle prestation',
    subject: 'Nouveau chez {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Nous faisons évoluer notre activité {{metier}} pour ${pack.infoLead}.\n\n` +
      '🆕 Nouveauté\n' +
      `• une évolution utile autour de ${pack.localHook}\n` +
      `• pour : ${pack.audience}\n` +
      `• bénéfice : ${pack.signature}\n\n` +
      '👉 Plus d’infos : {{cta_url}}\n\n' +
      'Cordialement,\n{{nom_entreprise}}',
    ctaLabel: '{{cta_label}}',
  },
  {
    slug: 'infos_pratiques',
    title: 'Infos pratiques',
    subject: 'Infos pratiques {{nom_entreprise}}',
    body: () =>
      'Bonjour,\n\n' +
      'Voici un point utile concernant notre activité.\n\n' +
      '📍 Zone : {{zones}}\n' +
      '🕒 Horaires : {{jours_ouverture}} — {{horaires_ouverture}}\n' +
      '🧩 Prestations : {{services}}\n\n' +
      'Si vous avez une question : {{telephone}}\n\n' +
      'Bien à vous,\n{{prenom}} — {{nom_entreprise}}',
  },
  {
    slug: 'actualite',
    title: 'Actualité entreprise',
    subject: 'Les dernières nouvelles de {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Petit point d’actualité sur notre activité {{metier}}. Notre priorité reste ${pack.signature}.\n\n` +
      '🗞️ Actualité\n' +
      `• point sur les demandes liées à ${pack.localHook}\n` +
      '• rappel de nos prestations principales : {{services}}\n' +
      `• conseil pratique pour ${pack.audience}\n\n` +
      'À bientôt,\n{{prenom}} — {{nom_entreprise}}',
  },
  {
    slug: 'partenariat',
    title: 'Partenariat / nouveauté',
    subject: 'Une nouveauté utile pour nos clients',
    body: (pack) =>
      'Bonjour,\n\n' +
      'Nous mettons en place un nouveau partenariat / service complémentaire pour mieux accompagner nos clients.\n\n' +
      '🤝 Ce que cela apporte\n' +
      `• une réponse plus complète pour ${pack.audience}\n` +
      `• plus de cohérence autour de ${pack.localHook}\n` +
      '• un accompagnement plus simple, du premier contact au suivi\n\n' +
      'Toujours avec notre approche : {{forces}}\n\n' +
      'Bien à vous,\n{{nom_entreprise}}',
  },
  {
    slug: 'local',
    title: 'Actualité locale',
    subject: 'Notre actualité locale — {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Parce que notre activité s’adresse à ${pack.audience}, nous partageons aujourd’hui une actualité locale utile.\n\n` +
      '📍 Dans votre secteur\n' +
      `• besoins fréquents autour de ${pack.localHook}\n` +
      '• période propice pour anticiper une demande ou un rendez-vous\n' +
      `• conseil : ${pack.maintenance}\n\n` +
      'Bien à vous,\n{{nom_entreprise}}',
  },
  {
    slug: 'disponibilites',
    title: 'Mise à jour des disponibilités',
    subject: 'Nos disponibilités et délais du moment',
    body: (pack) =>
      'Bonjour,\n\n' +
      'Petit point utile sur nos disponibilités actuelles.\n\n' +
      '📅 En ce moment\n' +
      '• créneaux ouverts selon nos disponibilités actuelles\n' +
      `• délais à vérifier selon le besoin et ${pack.localHook}\n` +
      '• secteurs couverts : {{zones}}\n\n' +
      'Pour vérifier un créneau, appelez-nous au {{telephone}}.\n\n' +
      'Bien à vous,\n{{nom_entreprise}}',
  },
];

const fideliserSuivisSeeds: VariantSeed[] = [
  {
    slug: 'merci',
    title: 'Merci après intervention',
    subject: 'Merci pour votre confiance — {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Merci encore pour votre confiance. Chez {{nom_entreprise}}, nous mettons tout en œuvre pour ${pack.signature}.\n\n` +
      'Si vous avez la moindre question après notre passage / échange, répondez simplement à ce message ou appelez-nous au {{telephone}}.\n\n' +
      'Bien à vous,\n{{prenom}} — {{nom_entreprise}}',
  },
  {
    slug: 'prise_nouvelles',
    title: 'Prise de nouvelles',
    subject: 'Tout se passe bien ? — {{nom_entreprise}}',
    body: () =>
      'Bonjour,\n\n' +
      'Nous revenons vers vous pour vérifier que tout se passe bien suite à notre dernière intervention / rendez-vous.\n\n' +
      '🔎 Dites-nous simplement :\n' +
      '• si tout est conforme à vos attentes\n' +
      '• si un ajustement est nécessaire\n' +
      '• si vous avez une question\n\n' +
      'Réponse rapide ici ou au {{telephone}}.\n\n' +
      'Merci,\n{{nom_entreprise}}',
  },
  {
    slug: 'rappel',
    title: 'Rappel utile',
    subject: 'Petit rappel utile — {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Petit rappel : ${pack.maintenance}.\n\n` +
      '✅ Pourquoi c’est utile\n' +
      '• anticiper\n' +
      '• éviter les imprévus\n' +
      '• garder un bon niveau de service / confort\n\n' +
      'Si vous souhaitez programmer cela, contactez-nous : {{telephone}} ou {{cta_url}}\n\n' +
      'Cordialement,\n{{prenom}} — {{nom_entreprise}}',
    ctaLabel: '{{cta_label}}',
  },
  {
    slug: 'relance_devis',
    title: 'Relance devis / projet',
    subject: 'Suite à votre demande — {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Je reviens vers vous au sujet de votre projet / demande. Notre rôle est de ${pack.followLead}.\n\n` +
      'Si vous le souhaitez, nous pouvons affiner ensemble :\n' +
      '• le besoin exact\n' +
      '• le calendrier\n' +
      '• la solution la plus adaptée\n\n' +
      '📞 Un échange rapide : {{telephone}}\n\n' +
      'Bien à vous,\n{{prenom}} — {{nom_entreprise}}',
  },
  {
    slug: 'fidelite',
    title: 'Fidélité / retour client',
    subject: 'Merci de votre fidélité — {{nom_entreprise}}',
    body: () =>
      'Bonjour,\n\n' +
      'Votre confiance compte beaucoup pour nous. Pour vous remercier, nous avons préparé un message dédié à nos clients réguliers.\n\n' +
      '💬 Si vous avez un besoin à venir autour de {{services}}, nous sommes disponibles sur {{zones}}.\n\n' +
      'Merci encore,\n{{prenom}} — {{nom_entreprise}}',
  },
  {
    slug: 'apres_vente',
    title: 'Suivi après-vente / après-service',
    subject: 'Nous restons disponibles — {{nom_entreprise}}',
    body: () =>
      'Bonjour,\n\n' +
      'Suite à notre intervention / rendez-vous, nous restons à votre disposition pour toute question complémentaire.\n\n' +
      '📌 Besoin d’aide sur :\n' +
      '• l’utilisation\n' +
      '• l’entretien\n' +
      '• une précision pratique\n\n' +
      'Répondez simplement à ce message.\n\n' +
      'Bien à vous,\n{{nom_entreprise}}',
  },
  {
    slug: 'reprise_contact',
    title: 'Reprise de contact',
    subject: 'Nous reprenons contact — {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Cela faisait quelque temps que nous n’avions pas échangé. Comme nous accompagnons souvent nos clients autour de ${pack.localHook}, nous revenons vers vous.\n\n` +
      'Si vous avez un projet, une question ou un besoin à venir, nous serons ravis d’en parler.\n\n' +
      'À bientôt,\n{{prenom}} — {{nom_entreprise}}',
  },
  {
    slug: 'controle',
    title: 'Contrôle / vérification',
    subject: 'Souhaitez-vous une vérification ?',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Dans le cadre de notre activité {{metier}}, ${pack.maintenance}.\n\n` +
      '🔎 Nous pouvons prévoir\n' +
      '• un contrôle rapide\n' +
      '• une mise à jour / vérification\n' +
      '• un conseil adapté à votre situation\n\n' +
      '👉 Réserver un échange : {{cta_url}}\n\n' +
      'Bien à vous,\n{{nom_entreprise}}',
    ctaLabel: '{{cta_label}}',
  },
  {
    slug: 'renouvellement',
    title: 'Renouvellement / reconduction',
    subject: 'Souhaitez-vous renouveler cette prestation ?',
    body: () =>
      'Bonjour,\n\n' +
      'Nous revenons vers vous car cette prestation / ce suivi peut être renouvelé ou reconduit selon votre besoin.\n\n' +
      '📌 Cela peut être pertinent si vous souhaitez :\n' +
      '• repartir sur une nouvelle période\n' +
      '• ajuster le niveau de service\n' +
      '• planifier un prochain rendez-vous\n\n' +
      'Répondez à ce mail ou contactez-nous au {{telephone}}.\n\n' +
      'Merci,\n{{prenom}} — {{nom_entreprise}}',
  },
  {
    slug: 'saisonnier',
    title: 'Suivi saisonnier',
    subject: 'Le bon moment pour refaire le point',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Selon la période, certains besoins reviennent naturellement. C’est pourquoi nous vous envoyons ce suivi saisonnier autour de ${pack.localHook}.\n\n` +
      '🗓️ Si cela vous intéresse, nous pouvons vous proposer :\n' +
      '• un rendez-vous\n' +
      '• une intervention planifiée\n' +
      '• une recommandation adaptée à la saison\n\n' +
      'Bien cordialement,\n{{nom_entreprise}}',
  },
];

const fideliserEnquetesSeeds: VariantSeed[] = [
  {
    slug: 'satisfaction',
    title: 'Satisfaction client',
    subject: 'Votre avis nous aide à progresser',
    body: () =>
      'Bonjour,\n\n' +
      'Pour continuer à améliorer notre activité, pourriez-vous répondre à 3 questions rapides ?\n\n' +
      '1) Quelle note donneriez-vous à notre service ?\n' +
      '2) Qu’avez-vous le plus apprécié ?\n' +
      '3) Que devrions-nous améliorer ?\n\n' +
      'Vous pouvez répondre directement à ce message.\n\n' +
      'Merci beaucoup,\n{{prenom}} — {{nom_entreprise}}',
  },
  {
    slug: 'besoins',
    title: 'Besoins à venir',
    subject: 'Avez-vous un besoin à venir ?',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Nous cherchons à mieux comprendre les prochains besoins de nos clients. Dans notre domaine {{metier}}, ${pack.surveyLead}.\n\n` +
      'Avez-vous un besoin prévu dans les prochains mois ? Si oui :\n' +
      '• sur quel sujet ?\n' +
      '• dans quel délai ?\n' +
      '• sur quelle zone ?\n\n' +
      'Merci pour votre retour,\n{{nom_entreprise}}',
  },
  {
    slug: 'recommandation',
    title: 'Recommandation / bouche-à-oreille',
    subject: 'À qui recommanderiez-vous {{nom_entreprise}} ?',
    body: () =>
      'Bonjour,\n\n' +
      'Une question rapide : à qui recommanderiez-vous notre activité ?\n\n' +
      '• un proche ?\n' +
      '• un voisin ?\n' +
      '• un collègue / partenaire ?\n\n' +
      'Si vous pensez à quelqu’un, répondez simplement à ce message.\n\n' +
      'Merci d’avance,\n{{prenom}} — {{nom_entreprise}}',
  },
  {
    slug: 'attentes',
    title: 'Attentes clients',
    subject: 'Qu’attendez-vous le plus de nous ?',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Pour mieux vous servir, nous cherchons à comprendre ce qui compte le plus pour vous dans notre univers ${pack.label.toLowerCase()}.\n\n` +
      'Qu’est-ce qui vous paraît prioritaire ?\n' +
      '• la rapidité\n' +
      '• le prix\n' +
      '• le conseil\n' +
      '• le suivi\n\n' +
      'Merci pour votre réponse,\n{{nom_entreprise}}',
  },
  {
    slug: 'nouveau_service',
    title: 'Avis sur un futur service',
    subject: 'Votre avis sur une future nouveauté',
    body: (pack) =>
      'Bonjour,\n\n' +
      'Nous réfléchissons à lancer une nouvelle offre / un nouveau service. Avant cela, nous aimerions connaître votre avis.\n\n' +
      'Seriez-vous intéressé par :\n' +
      '• une formule simple autour de {{services}}\n' +
      `• un accompagnement plus régulier lié à ${pack.localHook}\n` +
      '• une offre avec suivi, rappel ou conseil personnalisé\n\n' +
      'Un simple retour nous aide beaucoup.\n\n' +
      'Merci,\n{{prenom}} — {{nom_entreprise}}',
  },
  {
    slug: 'experience',
    title: 'Retour sur l’expérience client',
    subject: 'Comment avez-vous vécu votre expérience avec nous ?',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Comme nous voulons continuer à ${pack.signature}, nous aimerions avoir votre retour sur votre expérience globale.\n\n` +
      'En quelques mots :\n' +
      '• Qu’est-ce qui vous a rassuré ?\n' +
      '• Qu’est-ce qui pourrait être encore plus simple ?\n' +
      '• Recommanderiez-vous notre service ?\n\n' +
      'Merci beaucoup,\n{{nom_entreprise}}',
  },
  {
    slug: 'localite',
    title: 'Habitudes locales / fréquence',
    subject: 'Question rapide sur vos habitudes',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Pour mieux répondre aux besoins liés à ${pack.localHook}, nous faisons un petit point rapide auprès de nos clients.\n\n` +
      'À quelle fréquence avez-vous besoin de ce type de service / prestation ?\n' +
      '• ponctuellement\n' +
      '• régulièrement\n' +
      '• selon la saison\n' +
      '• selon un projet précis\n\n' +
      'Merci pour votre aide,\n{{prenom}} — {{nom_entreprise}}',
  },
  {
    slug: 'priorites',
    title: 'Vos priorités du moment',
    subject: 'Quelle est votre priorité actuellement ?',
    body: () =>
      'Bonjour,\n\n' +
      'Pour adapter au mieux nos futures communications et offres, nous aimerions connaître votre priorité du moment.\n\n' +
      'Aujourd’hui, ce qui compte le plus pour vous est plutôt :\n' +
      '• gagner du temps\n' +
      '• mieux planifier\n' +
      '• réduire un coût\n' +
      '• obtenir plus de sérénité\n\n' +
      'Merci pour votre retour,\n{{nom_entreprise}}',
  },
  {
    slug: 'offre_idee',
    title: 'Test d’idée / nouvelle formule',
    subject: 'Que pensez-vous de cette nouvelle idée ?',
    body: (pack) =>
      'Bonjour,\n\n' +
      'Nous testons une idée de nouvelle formule pour mieux répondre aux besoins de nos clients.\n\n' +
      'Seriez-vous intéressé par :\n' +
      `• une formule simple pour ${pack.localHook}\n` +
      `• une formule premium pour ${pack.audience}\n` +
      '• une formule avec suivi régulier ou rappel automatique\n\n' +
      'Un simple “oui / non / pourquoi” nous aide déjà beaucoup.\n\n' +
      'Merci,\n{{prenom}} — {{nom_entreprise}}',
  },
  {
    slug: 'canal',
    title: 'Préférences de contact',
    subject: 'Comment préférez-vous être contacté ?',
    body: () =>
      'Bonjour,\n\n' +
      'Pour vous écrire de façon plus utile, nous aimerions connaître votre préférence de contact.\n\n' +
      'Préférez-vous recevoir nos informations :\n' +
      '• par email\n' +
      '• par téléphone\n' +
      '• par SMS\n' +
      '• uniquement quand vous en avez besoin\n\n' +
      'Merci pour votre réponse,\n{{nom_entreprise}}',
  },
];

function buildTemplatesForAction(
  sector: ActivitySectorCategory,
  pack: SectorPack,
  action: Extract<TemplateAction, 'valoriser' | 'avis' | 'offres' | 'informations' | 'suivis' | 'enquetes'>,
  seeds: VariantSeed[],
  professionKey?: string
): TemplateDef[] {
  const moduleName = action === 'valoriser' || action === 'avis' || action === 'offres' ? 'booster' : 'fideliser';
  return seeds.map((seed) => ({
    key: `${moduleName}_${action}_${sector}${professionKey ? `_${professionKey}` : ''}_${seed.slug}`,
    module: moduleName,
    action,
    category: `${action}_${sector}${professionKey ? `_${professionKey}` : ''}_${seed.slug}`,
    title: seed.title,
    subject: seed.subject,
    body: seed.body(pack),
    ctaLabel: seed.ctaLabel,
    intelligent: buildTemplateMetadata({ module: moduleName, action, slug: seed.slug, priority: professionKey ? 70 : 55 }),
    sectorCategory: sector,
    professionKey,
  }));
}

export function createSectorTemplates(definition: SectorTemplateDefinition): TemplateDef[] {
  const { sector, pack, extraTemplates } = definition;
  return [
    ...buildTemplatesForAction(sector, pack, 'valoriser', boosterValoriserSeeds),
    ...(extraTemplates?.valoriser ?? []),
    ...buildTemplatesForAction(sector, pack, 'avis', boosterAvisSeeds),
    ...(extraTemplates?.avis ?? []),
    ...buildTemplatesForAction(sector, pack, 'offres', boosterOffresSeeds),
    ...(extraTemplates?.offres ?? []),
    ...buildTemplatesForAction(sector, pack, 'informations', fideliserInformationsSeeds),
    ...(extraTemplates?.informations ?? []),
    ...buildTemplatesForAction(sector, pack, 'suivis', fideliserSuivisSeeds),
    ...(extraTemplates?.suivis ?? []),
    ...buildTemplatesForAction(sector, pack, 'enquetes', fideliserEnquetesSeeds),
    ...(extraTemplates?.enquetes ?? []),
  ];
}

export function createJobTemplates(definition: JobTemplateDefinition): TemplateDef[] {
  const { sector, professionKey, pack, extraTemplates } = definition;
  return [
    ...buildTemplatesForAction(sector, pack, 'valoriser', boosterValoriserSeeds, professionKey),
    ...(extraTemplates?.valoriser ?? []),
    ...buildTemplatesForAction(sector, pack, 'avis', boosterAvisSeeds, professionKey),
    ...(extraTemplates?.avis ?? []),
    ...buildTemplatesForAction(sector, pack, 'offres', boosterOffresSeeds, professionKey),
    ...(extraTemplates?.offres ?? []),
    ...buildTemplatesForAction(sector, pack, 'informations', fideliserInformationsSeeds, professionKey),
    ...(extraTemplates?.informations ?? []),
    ...buildTemplatesForAction(sector, pack, 'suivis', fideliserSuivisSeeds, professionKey),
    ...(extraTemplates?.suivis ?? []),
    ...buildTemplatesForAction(sector, pack, 'enquetes', fideliserEnquetesSeeds, professionKey),
    ...(extraTemplates?.enquetes ?? []),
  ];
}

// Central registry for Booster/Fidéliser mail templates.
// ✅ Version "dense" : vrais contenus, structurés, et auto-remplis via Mon Profil + Mon activité.
// Placeholders disponibles (principaux) :
// {{nom_entreprise}}, {{prenom}}, {{nom}}, {{telephone}}, {{email}}, {{adresse}}, {{code_postal}}, {{ville}}
// {{secteur}}, {{services}}, {{zones}}, {{jours_ouverture}}, {{horaires_ouverture}}, {{forces}}, {{ton}}
// {{site_url}}, {{facebook_url}}, {{gmb_url}}, {{avis_url}}, {{cta_label}}, {{cta_url}}

export type TemplateModule = "booster" | "fideliser";
export type TemplateAction = "avis" | "offres" | "informations" | "suivis" | "enquetes";

export type TemplateDef = {
  key: string;
  module: TemplateModule;
  action: TemplateAction;
  category: string;
  title: string;
  subject: string;
  body: string;
  ctaLabel?: string;
};

export const TEMPLATES: TemplateDef[] = [
  // -------------------- BOOSTER --------------------
  {
    key: "booster_avis_base",
    module: "booster",
    action: "avis",
    category: "base",
    title: "Demande d’avis (Google)",
    subject: "Pouvez-vous partager votre avis sur {{nom_entreprise}} ?",
    body:
      "Bonjour,\n\n" +
      "Merci encore pour votre confiance. Chez {{nom_entreprise}}, chaque retour compte : il nous aide à améliorer notre service et permet à d’autres personnes de nous trouver.\n\n" +
      "🧩 Rappel de notre activité\n" +
      "• Métier : {{secteur}}\n" +
      "• Prestations : {{services}}\n" +
      "• Zone d’intervention : {{zones}}\n" +
      "• Nos points forts : {{forces}}\n\n" +
      "👉 Pour laisser un avis (1 minute) : {{avis_url}}\n\n" +
      "Si vous préférez, vous pouvez aussi nous répondre directement à ce mail : nous lisons tout.\n\n" +
      "Merci d’avance,\n" +
      "{{prenom}} {{nom}}\n" +
      "{{nom_entreprise}}\n" +
      "Tél : {{telephone}}\n" +
      "Site : {{site_url}}",
    ctaLabel: "Laisser un avis",
  },

  // ---- OFFRES ----
  {
    key: "booster_offres_produit",
    module: "booster",
    action: "offres",
    category: "promotion_produit",
    title: "Promotion d’un produit",
    subject: "Offre du moment chez {{nom_entreprise}} ({{ville}})",
    body:
      "Bonjour,\n\n" +
      "Nous lançons une offre spéciale sur un produit que nous recommandons souvent à nos clients.\n\n" +
      "✅ Ce que vous obtenez\n" +
      "• Produit : [Nom du produit]\n" +
      "• Bénéfice principal : [1 bénéfice concret]\n" +
      "• Pour qui : [type de besoin / situation]\n\n" +
      "🔎 Pourquoi c’est pertinent avec notre métier ({{secteur}})\n" +
      "Nous intervenons régulièrement sur : {{services}}. Ce produit complète très bien ces prestations et permet d’obtenir un résultat plus durable.\n\n" +
      "📍 Disponible sur : {{zones}}\n" +
      "🕒 Horaires : {{jours_ouverture}} — {{horaires_ouverture}}\n\n" +
      "Pour en profiter : {{cta_url}}\n\n" +
      "À bientôt,\n{{prenom}} — {{nom_entreprise}}\nTél : {{telephone}}",
    ctaLabel: "{{cta_label}}",
  },
  {
    key: "booster_offres_remise_service",
    module: "booster",
    action: "offres",
    category: "remise_service",
    title: "Remise sur un service",
    subject: "Remise sur [service] — {{nom_entreprise}}",
    body:
      "Bonjour,\n\n" +
      "Bonne nouvelle : nous proposons en ce moment une remise sur une prestation très demandée.\n\n" +
      "🎯 Offre\n" +
      "• Prestation : [Nom du service]\n" +
      "• Remise : [X% / X€] (conditions : [conditions])\n" +
      "• Inclus : [ce qui est compris] + [garantie / suivi] \n\n" +
      "🧠 Notre approche\n" +
      "Chez {{nom_entreprise}}, nous travaillons avec une méthode claire : diagnostic → recommandation → intervention → contrôle / conseils.\n" +
      "Nos forces : {{forces}}\n\n" +
      "📍 Zone : {{zones}}\n" +
      "📞 Pour réserver : {{telephone}} (ou {{cta_url}})\n\n" +
      "Bien à vous,\n{{prenom}} {{nom}} — {{nom_entreprise}}",
    ctaLabel: "{{cta_label}}",
  },
  {
    key: "booster_offres_devis_gratuit",
    module: "booster",
    action: "offres",
    category: "devis_gratuit",
    title: "Devis gratuit",
    subject: "Devis gratuit et rapide — {{nom_entreprise}}",
    body:
      "Bonjour,\n\n" +
      "Vous avez un besoin en {{secteur}} ? Nous pouvons vous aider rapidement.\n\n" +
      "📌 Ce que comprend notre devis\n" +
      "• Analyse de votre besoin\n" +
      "• Proposition claire (prix + délais)\n" +
      "• Recommandations adaptées à votre situation\n\n" +
      "Nos prestations principales : {{services}}\n" +
      "Zone d’intervention : {{zones}}\n\n" +
      "👉 Demander un devis : {{cta_url}}\n" +
      "Ou appelez-nous : {{telephone}}\n\n" +
      "À bientôt,\n{{prenom}} — {{nom_entreprise}}",
    ctaLabel: "Demander un devis",
  },
  {
    key: "booster_offres_limitee",
    module: "booster",
    action: "offres",
    category: "limitee",
    title: "Offre limitée dans le temps",
    subject: "Offre limitée : [nom de l’offre] (jusqu’au [date])",
    body:
      "Bonjour,\n\n" +
      "Nous lançons une offre limitée (jusqu’au [date]) pour répondre aux demandes fréquentes sur {{zones}}.\n\n" +
      "🔥 L’offre\n" +
      "• [Bénéfice #1]\n" +
      "• [Bénéfice #2]\n" +
      "• [Garantie / bonus] \n\n" +
      "✅ Idéal si vous recherchez : {{services}}\n\n" +
      "Pour réserver un créneau : {{cta_url}}\n" +
      "Horaires : {{jours_ouverture}} — {{horaires_ouverture}}\n\n" +
      "Cordialement,\n{{nom_entreprise}} — {{telephone}}",
    ctaLabel: "{{cta_label}}",
  },
  {
    key: "booster_offres_saisonniere",
    module: "booster",
    action: "offres",
    category: "saisonniere",
    title: "Offre saisonnière",
    subject: "Offre saisonnière : préparation / entretien ({{ville}})",
    body:
      "Bonjour,\n\n" +
      "Selon la saison, certains besoins reviennent souvent. Nous avons préparé une offre spéciale pour vous permettre d’anticiper sereinement.\n\n" +
      "🌿 Offre saisonnière\n" +
      "• Pour : [type de situation saisonnière]\n" +
      "• Ce qui est inclus : [liste courte]\n" +
      "• Objectif : [résultat attendu]\n\n" +
      "Notre métier : {{secteur}}\n" +
      "Nos forces : {{forces}}\n\n" +
      "📍 Intervention : {{zones}}\n" +
      "👉 Infos / réservation : {{cta_url}}\n\n" +
      "À bientôt,\n{{prenom}} — {{nom_entreprise}}",
    ctaLabel: "{{cta_label}}",
  },
  {
    key: "booster_offres_nouveau_client",
    module: "booster",
    action: "offres",
    category: "nouveau_client",
    title: "Offre nouveau client",
    subject: "Bienvenue ! Offre nouveau client — {{nom_entreprise}}",
    body:
      "Bonjour,\n\n" +
      "Si c’est votre première demande chez {{nom_entreprise}}, nous avons prévu une offre de bienvenue.\n\n" +
      "🎁 Offre nouveau client\n" +
      "• Avantage : [remise / bonus / priorité] \n" +
      "• Valable sur : {{services}}\n" +
      "• Zone : {{zones}}\n\n" +
      "🧾 Comment ça se passe ?\n" +
      "1) Vous nous expliquez le besoin\n" +
      "2) On vous propose une solution claire\n" +
      "3) On planifie l’intervention au meilleur créneau\n\n" +
      "👉 Démarrer : {{cta_url}}\n\n" +
      "Bien à vous,\n{{prenom}} — {{nom_entreprise}}\n{{telephone}}",
    ctaLabel: "{{cta_label}}",
  },
  {
    key: "booster_offres_fidelite",
    module: "booster",
    action: "offres",
    category: "fidelite",
    title: "Offre fidélité",
    subject: "Merci ! Avantage fidélité chez {{nom_entreprise}}",
    body:
      "Bonjour,\n\n" +
      "Merci pour votre fidélité. Pour vous récompenser, nous vous faisons bénéficier d’un avantage dédié.\n\n" +
      "⭐ Avantage fidélité\n" +
      "• [Avantage concret : remise, contrôle offert, extension de garantie…]\n" +
      "• Applicable sur : {{services}}\n" +
      "• Conditions : [conditions] \n\n" +
      "📍 Zone : {{zones}}\n" +
      "📞 Réserver : {{telephone}}\n\n" +
      "À très bientôt,\n{{prenom}} — {{nom_entreprise}}",
    ctaLabel: "Réserver",
  },

  // -------------------- FIDÉLISER --------------------
  // ---- INFORMATIONS ----
  {
    key: "fideliser_infos_recrutement",
    module: "fideliser",
    action: "informations",
    category: "recrutement",
    title: "Recrutement",
    subject: "{{nom_entreprise}} recrute sur {{zones}}",
    body:
      "Bonjour,\n\n" +
      "Nous renforçons l’équipe {{nom_entreprise}} pour répondre à la demande sur {{zones}}.\n\n" +
      "📣 Poste : [intitulé]\n" +
      "• Missions : [3 points]\n" +
      "• Profil : [3 points]\n" +
      "• Lieu : {{ville}}\n\n" +
      "Notre activité : {{secteur}} — {{services}}\n\n" +
      "👉 Candidature / infos : {{email}} ou {{telephone}}\n\n" +
      "Merci,\n{{prenom}} — {{nom_entreprise}}",
  },
  {
    key: "fideliser_infos_nouveau_service",
    module: "fideliser",
    action: "informations",
    category: "nouveau_service",
    title: "Nouveau service",
    subject: "Nouveau : [service] chez {{nom_entreprise}}",
    body:
      "Bonjour,\n\n" +
      "Nous lançons une nouvelle prestation pour répondre à une demande fréquente sur {{zones}}.\n\n" +
      "🆕 Nouveau service : [Nom du service]\n" +
      "• Pour qui : [types de clients / cas] \n" +
      "• Ce que ça apporte : [bénéfice principal] \n" +
      "• Comment ça se déroule : [étapes] \n\n" +
      "📍 Zone d’intervention : {{zones}}\n" +
      "🕒 Horaires : {{jours_ouverture}} — {{horaires_ouverture}}\n\n" +
      "👉 En savoir plus / réserver : {{cta_url}}\n\n" +
      "Bien à vous,\n{{prenom}} — {{nom_entreprise}}",
    ctaLabel: "{{cta_label}}",
  },
  {
    key: "fideliser_infos_nouveau_produit",
    module: "fideliser",
    action: "informations",
    category: "nouveau_produit",
    title: "Nouveau produit",
    subject: "Nouveau produit recommandé par {{nom_entreprise}}",
    body:
      "Bonjour,\n\n" +
      "Nous ajoutons un nouveau produit à nos recommandations, car il répond très bien aux besoins liés à {{secteur}}.\n\n" +
      "🧩 Produit : [Nom]\n" +
      "• Avantage : [bénéfice concret]\n" +
      "• Dans quels cas : [cas d’usage]\n" +
      "• Disponibilité : [infos] \n\n" +
      "Vous souhaitez vérifier si c’est adapté à votre situation ? Répondez à ce mail ou contactez-nous : {{telephone}}.\n\n" +
      "Cordialement,\n{{nom_entreprise}}",
  },
  {
    key: "fideliser_infos_nouveau_materiel",
    module: "fideliser",
    action: "informations",
    category: "materiel",
    title: "Nouveau matériel / équipement",
    subject: "Nous investissons dans un nouvel équipement ({{nom_entreprise}})",
    body:
      "Bonjour,\n\n" +
      "Pour améliorer la qualité et la régularité de nos interventions, nous venons d’investir dans un nouvel équipement.\n\n" +
      "🔧 Équipement : [Nom]\n" +
      "• Ce que ça change pour vous : [2-3 bénéfices]\n" +
      "• Sur quelles prestations : {{services}}\n\n" +
      "Notre objectif : des résultats plus fiables, avec notre exigence habituelle.\n\n" +
      "À bientôt,\n{{prenom}} — {{nom_entreprise}}",
  },
  {
    key: "fideliser_infos_nouveau_collaborateur",
    module: "fideliser",
    action: "informations",
    category: "equipe",
    title: "Nouveau collaborateur",
    subject: "L’équipe {{nom_entreprise}} s’agrandit",
    body:
      "Bonjour,\n\n" +
      "Nous sommes heureux de vous présenter notre nouveau collaborateur : [Prénom].\n\n" +
      "👋 Son rôle\n" +
      "• Missions : [missions]\n" +
      "• Spécialités : [spécialités]\n\n" +
      "Cela nous permet de rester disponibles sur {{zones}} et de réduire les délais sur les demandes liées à : {{services}}.\n\n" +
      "Bien à vous,\n{{nom_entreprise}}",
  },
  {
    key: "fideliser_infos_formation_certif",
    module: "fideliser",
    action: "informations",
    category: "formation",
    title: "Formation / certification",
    subject: "Nouvelle certification / formation — {{nom_entreprise}}",
    body:
      "Bonjour,\n\n" +
      "Pour garantir un service irréprochable, nous continuons à nous former régulièrement.\n\n" +
      "🎓 Formation / certification : [Nom]\n" +
      "• Ce que ça apporte : [bénéfices] \n" +
      "• Pour quels besoins : {{services}}\n\n" +
      "Notre promesse : {{forces}}\n\n" +
      "Cordialement,\n{{prenom}} — {{nom_entreprise}}",
  },
  {
    key: "fideliser_infos_partenaire",
    module: "fideliser",
    action: "informations",
    category: "partenaire",
    title: "Nouveau partenaire",
    subject: "Nouveau partenaire — {{nom_entreprise}}",
    body:
      "Bonjour,\n\n" +
      "Nous avons noué un partenariat avec [Nom du partenaire] afin de mieux vous servir sur {{zones}}.\n\n" +
      "🤝 Pourquoi ce partenariat ?\n" +
      "• [bénéfice #1]\n" +
      "• [bénéfice #2]\n\n" +
      "Cela complète nos prestations : {{services}}\n\n" +
      "Si vous souhaitez en discuter : {{telephone}}\n\n" +
      "Bien à vous,\n{{nom_entreprise}}",
  },
  {
    key: "fideliser_infos_realisation",
    module: "fideliser",
    action: "informations",
    category: "realisation",
    title: "Réalisation / chantier récent",
    subject: "Dernière réalisation de {{nom_entreprise}} ({{ville}})",
    body:
      "Bonjour,\n\n" +
      "Nous partageons une réalisation récente pour vous donner une idée concrète de notre méthode.\n\n" +
      "🏁 Contexte\n" +
      "• Besoin : [besoin]\n" +
      "• Intervention : [ce qui a été fait]\n" +
      "• Résultat : [résultat mesurable] \n\n" +
      "Ce type de besoin correspond à nos prestations : {{services}}\n" +
      "Zone : {{zones}}\n\n" +
      "Vous avez une question similaire ? Contact : {{telephone}}\n\n" +
      "Cordialement,\n{{prenom}} — {{nom_entreprise}}",
  },
  {
    key: "fideliser_infos_evenement",
    module: "fideliser",
    action: "informations",
    category: "evenement",
    title: "Participation événement / salon",
    subject: "On se retrouve à [événement] ? — {{nom_entreprise}}",
    body:
      "Bonjour,\n\n" +
      "Nous participons à [événement] le [date] à [lieu].\n\n" +
      "🎟️ Pourquoi venir ?\n" +
      "• Découvrir nos solutions autour de {{secteur}}\n" +
      "• Échanger sur vos besoins ({{services}})\n" +
      "• Obtenir des conseils personnalisés\n\n" +
      "Si vous souhaitez prendre un créneau sur place : {{telephone}}\n\n" +
      "À bientôt,\n{{nom_entreprise}}",
  },
  {
    key: "fideliser_infos_generique",
    module: "fideliser",
    action: "informations",
    category: "generique",
    title: "Actualité entreprise (générique)",
    subject: "Des nouvelles de {{nom_entreprise}}",
    body:
      "Bonjour,\n\n" +
      "Petit point d’actualité de {{nom_entreprise}} :\n\n" +
      "🗞️ [Actualité #1]\n" +
      "🗞️ [Actualité #2]\n" +
      "🗞️ [Actualité #3]\n\n" +
      "Rappel : nous intervenons sur {{zones}} pour : {{services}}.\n\n" +
      "Besoin d’un conseil ? {{telephone}} — {{email}}\n\n" +
      "Bien à vous,\n{{prenom}} — {{nom_entreprise}}",
  },

  // ---- SUIVIS ----
  {
    key: "fideliser_suivis_merci_apres",
    module: "fideliser",
    action: "suivis",
    category: "merci",
    title: "Remerciement après intervention",
    subject: "Merci pour votre confiance — {{nom_entreprise}}",
    body:
      "Bonjour,\n\n" +
      "Merci de nous avoir fait confiance pour votre besoin.\n\n" +
      "✅ Ce que nous avons fait\n" +
      "• Intervention : [rappel court]\n" +
      "• Conseils : [rappel court]\n\n" +
      "Si vous avez la moindre question (ou si vous observez un point à surveiller), vous pouvez nous joindre facilement : {{telephone}}.\n\n" +
      "Et si vous souhaitez nous aider : un avis ici → {{avis_url}}\n\n" +
      "Cordialement,\n{{prenom}} — {{nom_entreprise}}",
    ctaLabel: "Laisser un avis",
  },
  {
    key: "fideliser_suivis_prise_nouvelles",
    module: "fideliser",
    action: "suivis",
    category: "checkin",
    title: "Suivi après prestation (prise de nouvelles)",
    subject: "Tout se passe bien depuis notre passage ? — {{nom_entreprise}}",
    body:
      "Bonjour,\n\n" +
      "Nous prenons des nouvelles suite à notre intervention. Tout se passe bien depuis ?\n\n" +
      "🔎 Si vous pouvez, dites-nous simplement :\n" +
      "1) Est-ce que le résultat est conforme à vos attentes ?\n" +
      "2) Avez-vous une question / un point à ajuster ?\n\n" +
      "Nous restons disponibles sur {{zones}} ({{jours_ouverture}} — {{horaires_ouverture}}).\n\n" +
      "Réponse rapide par mail, ou par téléphone : {{telephone}}\n\n" +
      "Bien à vous,\n{{prenom}} — {{nom_entreprise}}",
  },
  {
    key: "fideliser_suivis_rappel_entretien",
    module: "fideliser",
    action: "suivis",
    category: "rappel_entretien",
    title: "Rappel entretien / contrôle",
    subject: "Rappel : contrôle / entretien recommandé",
    body:
      "Bonjour,\n\n" +
      "Petit rappel : pour conserver un résultat durable, un contrôle / entretien est recommandé après [X] mois.\n\n" +
      "✅ Pourquoi c’est utile\n" +
      "• Prévenir les récidives\n" +
      "• Maintenir la performance\n" +
      "• Identifier les points faibles avant qu’ils ne deviennent coûteux\n\n" +
      "Vous souhaitez que l’on programme un créneau ? {{cta_url}}\n\n" +
      "Cordialement,\n{{nom_entreprise}} — {{telephone}}",
    ctaLabel: "{{cta_label}}",
  },
  {
    key: "fideliser_suivis_anniversaire_client",
    module: "fideliser",
    action: "suivis",
    category: "anniversaire",
    title: "Anniversaire client / relation",
    subject: "Un petit mot de {{nom_entreprise}}",
    body:
      "Bonjour,\n\n" +
      "Un petit message pour vous remercier de votre confiance.\n\n" +
      "Si vous avez un besoin (ou une question) autour de {{services}}, nous sommes là : {{telephone}}.\n\n" +
      "Bonne journée,\n{{prenom}} — {{nom_entreprise}}",
  },
  {
    key: "fideliser_suivis_relance_devis",
    module: "fideliser",
    action: "suivis",
    category: "relance_devis",
    title: "Relance devis",
    subject: "Suite à votre demande — devis {{nom_entreprise}}",
    body:
      "Bonjour,\n\n" +
      "Je reviens vers vous suite à votre demande de devis.\n\n" +
      "Si vous le souhaitez, on peut affiner ensemble :\n" +
      "• le besoin exact\n" +
      "• les contraintes / délais\n" +
      "• la meilleure option (budget / qualité)\n\n" +
      "📞 Un rapide échange : {{telephone}}\n" +
      "Ou répondez à ce mail avec vos disponibilités.\n\n" +
      "Cordialement,\n{{prenom}} — {{nom_entreprise}}",
  },

  // ---- ENQUÊTES ----
  {
    key: "fideliser_enquetes_satisfaction",
    module: "fideliser",
    action: "enquetes",
    category: "satisfaction",
    title: "Mini enquête satisfaction",
    subject: "2 minutes pour améliorer notre service ? — {{nom_entreprise}}",
    body:
      "Bonjour,\n\n" +
      "Pour continuer à améliorer {{nom_entreprise}}, pourriez-vous répondre à ces 3 questions rapides ?\n\n" +
      "1) Sur 10, quelle note donneriez-vous à notre intervention ?\n" +
      "2) Qu’est-ce qui vous a le plus plu ?\n" +
      "3) Qu’est-ce que nous devrions améliorer en priorité ?\n\n" +
      "Vous pouvez répondre directement à ce mail.\n\n" +
      "Merci,\n{{prenom}} — {{nom_entreprise}}\n{{telephone}}",
  },
  {
    key: "fideliser_enquetes_besoins",
    module: "fideliser",
    action: "enquetes",
    category: "besoins",
    title: "Enquête besoins",
    subject: "Une question rapide (vos besoins à venir)",
    body:
      "Bonjour,\n\n" +
      "Pour mieux anticiper, dites-nous : avez-vous un besoin prévu dans les prochains mois concernant :\n" +
      "• {{services}} ?\n\n" +
      "Si oui : quand, et sur quelle zone ({{zones}}) ?\n\n" +
      "Répondez simplement à ce mail, ou contactez-nous : {{telephone}}\n\n" +
      "Merci !\n{{nom_entreprise}}",
  },
  {
    key: "fideliser_enquetes_recommandations",
    module: "fideliser",
    action: "enquetes",
    category: "reco",
    title: "Enquête recommandations",
    subject: "À qui recommanderiez-vous {{nom_entreprise}} ?",
    body:
      "Bonjour,\n\n" +
      "Dernière petite question : à qui recommanderiez-vous nos services ? (amis, famille, voisins, entreprise…)\n\n" +
      "Si vous avez un contact à nous partager, répondez avec un prénom + numéro/mail (si vous avez son accord).\n\n" +
      "Merci d’avance,\n{{prenom}} — {{nom_entreprise}}\n{{telephone}}",
  },
];

export function getTemplates(action: TemplateAction, module?: TemplateModule): TemplateDef[] {
  const inferredModule: TemplateModule =
    module ?? (action === "avis" || action === "offres" ? "booster" : "fideliser");

  return TEMPLATES.filter((t) => t.action === action && t.module === inferredModule);
}


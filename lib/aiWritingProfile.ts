import { asRecord } from "@/lib/tsSafe";

const clean = (value: unknown, max = 800) => String(value ?? "").trim().slice(0, max);

const labelFromMap = (value: unknown, labels: Record<string, string>, fallback: string) => {
  const key = clean(value, 120);
  return labels[key] || (key ? key : fallback);
};

const TONE_LABELS: Record<string, string> = {
  serious: "Sérieux",
  serieux: "Sérieux",
  pro: "Sérieux",
  professional: "Sérieux",
  warm: "Chaleureux",
  chaleureux: "Chaleureux",
  friendly: "Chaleureux",
  fun: "Fun",
  premium: "Premium",
  direct: "Direct",
};

const TEXT_STYLE_LABELS: Record<string, string> = {
  simple: "Simple et clair",
  dynamic: "Dynamique",
  dynamique: "Dynamique",
  moderne: "Dynamique",
  expert: "Conseil d'expert",
  professionnel: "Conseil d'expert",
  coulisses: "Coulisses / histoire",
  histoire: "Coulisses / histoire",
  local_humain: "Local et humain",
  premium: "Haut de gamme",
};

const ORIGINALITY_LABELS: Record<string, string> = {
  classic: "Classique",
  classique: "Classique",
  stable: "Classique",
  balanced: "Équilibrée",
  equilibree: "Équilibrée",
  creative: "Créative",
  creatif: "Créative",
};

const LENGTH_LABELS: Record<string, string> = {
  short: "Court",
  medium: "Moyen",
  detailed: "Détaillé",
};

const EMOJI_LEVEL_LABELS: Record<string, string> = {
  none: "Aucun",
  light: "Léger",
  moderate: "Léger",
  dynamic: "Beaucoup",
  many: "Beaucoup",
};

const PRONOUN_LABELS: Record<string, string> = {
  auto: "Nous",
  je: "Je",
  nous: "Nous",
  vous: "Vous",
  neutral: "Neutre",
};

const ADDRESS_MODE_LABELS: Record<string, string> = {
  vous: "Vouvoiement",
  tu: "Tutoiement",
  auto: "Vouvoiement",
};

const COMMERCIAL_LEVEL_LABELS: Record<string, string> = {
  discreet: "Discret",
  discret: "Discret",
  balanced: "Équilibré",
  equilibre: "Équilibré",
  direct: "Direct",
};

const MAIN_GOAL_LABELS: Record<string, string> = {
  visibility: "Faire connaître l'entreprise",
  visible: "Faire connaître l'entreprise",
  contacts: "Obtenir des contacts",
  contact: "Obtenir des contacts",
  reassure: "Rassurer les clients",
  rassurer: "Rassurer les clients",
  offer: "Mettre en avant une offre",
  offre: "Mettre en avant une offre",
};

const PREFERRED_ANGLE_LABELS: Record<string, string> = {
  local: "Local / proximité",
  quality: "Qualité du travail",
  qualite: "Qualité du travail",
  price: "Prix / avantage",
  prix: "Prix / avantage",
  speed: "Rapidité / réactivité",
  rapidite: "Rapidité / réactivité",
  trust: "Confiance",
  confiance: "Confiance",
};

const CTA_LABELS: Record<string, string> = {
  none: "Aucun bouton",
  site: "Voir le site",
  devis: "Demander un devis",
  appeler: "Appeler",
  message: "Envoyer un message",
  custom: "Lien personnalisé",
};

const AI_LANGUAGE_LABELS: Record<string, string> = {
  fr: "français",
  en: "anglais",
  es: "espagnol",
  it: "italien",
  de: "allemand",
  nl: "néerlandais",
  pt: "portugais",
};

export function normalizeAiLanguage(value: unknown) {
  const raw = clean(value, 80).toLowerCase();
  if (["fr", "french", "francais", "français"].includes(raw)) return "fr";
  if (["en", "english", "anglais"].includes(raw)) return "en";
  if (["es", "spanish", "espagnol"].includes(raw)) return "es";
  if (["it", "italian", "italien"].includes(raw)) return "it";
  if (["de", "german", "allemand"].includes(raw)) return "de";
  if (["nl", "dutch", "neerlandais", "néerlandais"].includes(raw)) return "nl";
  if (["pt", "portuguese", "portugais"].includes(raw)) return "pt";
  return "fr";
}

export function getAiLanguageLabel(source: unknown) {
  const business = asRecord(source);
  return AI_LANGUAGE_LABELS[normalizeAiLanguage(business["ai_language"])] || AI_LANGUAGE_LABELS.fr;
}

export function buildAiLanguageInstruction(source: unknown) {
  const language = getAiLanguageLabel(source);

  return [
    `Langue de sortie obligatoire : ${language}.`,
    `La demande utilisateur, les pièces jointes, l'historique ou le modèle de départ peuvent être écrits dans n'importe quelle langue. Comprends leur intention, mais rédige exclusivement le contenu final en ${language}.`,
    "N'utilise pas une autre langue dans les textes générés, même si la demande utilisateur est écrite dans une autre langue.",
    "Les noms propres, noms d'entreprise, marques, adresses, URLs, hashtags, références techniques et extraits exacts fournis peuvent rester dans leur forme d'origine quand c'est nécessaire.",
    "Les clés JSON attendues par l'application doivent rester inchangées.",
  ].join("\n");
}

export function buildAiWritingProfilePromptSection(source: unknown) {
  const business = asRecord(source);
  const forbiddenStyle = clean(business["ai_custom_instructions"], 700);
  const likedExample = clean(business["ai_liked_example"], 1200);

  const lines = [
    `- Ton du contenu : ${labelFromMap(business["tone"], TONE_LABELS, "Sérieux")}`,
    `- Style du texte : ${labelFromMap(business["communication_style"], TEXT_STYLE_LABELS, "Simple et clair")}`,
    `- Originalité : ${labelFromMap(business["ai_creativity"], ORIGINALITY_LABELS, "Équilibrée")}`,
    `- Longueur favorite : ${labelFromMap(business["ai_length"], LENGTH_LABELS, "Moyen")}`,
    `- Emojis : ${labelFromMap(business["emoji_level"], EMOJI_LEVEL_LABELS, "Léger")}`,
    `- Pronom utilisé : ${labelFromMap(business["ai_voice"], PRONOUN_LABELS, "Nous")}`,
    `- Relation avec le lecteur : ${labelFromMap(business["address_mode"], ADDRESS_MODE_LABELS, "Vouvoiement")}`,
    `- Niveau commercial : ${labelFromMap(business["ai_commercial_level"], COMMERCIAL_LEVEL_LABELS, "Équilibré")}`,
    `- Objectif principal : ${labelFromMap(business["ai_main_goal"], MAIN_GOAL_LABELS, "Obtenir des contacts")}`,
    `- Angle préféré : ${labelFromMap(business["ai_preferred_angle"], PREFERRED_ANGLE_LABELS, "Confiance")}`,
    `- Bouton préféré : ${labelFromMap(business["preferred_cta"], CTA_LABELS, "Demander un devis")}`,
    `- Langue de génération : ${getAiLanguageLabel(business)}`,
    likedExample ? `- Exemple de contenu aimé : ${likedExample}` : "",
    forbiddenStyle ? `- À éviter absolument : ${forbiddenStyle}` : "",
  ].filter(Boolean);

  return lines.join("\n");
}

export function buildAiWritingProfileRules() {
  return [
    "- Appliquer fortement la Configuration IA : le ton, le style, le niveau commercial, la langue de génération et la forme de rédaction doivent se sentir dans le texte final.",
    "- Si un exemple de contenu aimé est fourni, s'inspirer du rythme, de la structure et du style, mais ne jamais le copier, le paraphraser trop près ou reprendre ses détails non fournis.",
    "- Respecter le pronom utilisé : Je = une personne parle ; Nous = l'entreprise/l'équipe parle ; Vous = le texte s'adresse principalement au lecteur ; Neutre = éviter je/nous/vous autant que possible.",
    "- Respecter la relation avec le lecteur : vouvoiement ou tutoiement. Ne pas mélanger les deux.",
    "- Respecter le niveau commercial : discret = conseil naturel ; équilibré = bénéfice + CTA doux ; direct = CTA plus clair sans agressivité.",
    "- Respecter le niveau d'emojis demandé : Aucun = 0 ; Léger = présence sobre ; Beaucoup = présence visible uniquement quand le canal ou le format le permet.",
    "- Varier la structure des contenus : ne pas utiliser de liste à chaque génération. Utiliser une liste uniquement si elle améliore la clarté, la lisibilité, le SEO, l'impact commercial ou la compréhension des prestations.",
    "- Adapter les listes au support : sites = listes propres sans emoji ; réseaux sociaux = mini-listes possibles plus visuelles ; LinkedIn et mails = listes sobres ; emails = liste courte seulement si elle rend l'offre ou les étapes plus claires.",
    "- Pour les emails Propulser/Fidéliser/Mails : rester lisible, humain et prêt à envoyer ; les emojis restent rares même si Beaucoup est configuré, 1 à 2 maximum si cela sert vraiment le ton.",
    "- Respecter l'angle préféré dès que c'est cohérent avec le sujet, sans forcer ni inventer.",
    "- Respecter les éléments à éviter absolument, sauf si cela contredit une obligation de vérité, de conformité ou de sécurité.",
  ].join("\n");
}

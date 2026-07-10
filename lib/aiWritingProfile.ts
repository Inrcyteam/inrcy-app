import { asRecord } from "@/lib/tsSafe";
import { getAiEngineOption, type AiPreferredEngine } from "@/lib/aiEnginePreference";

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
    `LANGUE FINALE OBLIGATOIRE DES CONTENUS : ${language}.`,
    `Toutes les valeurs textuelles générées pour l'utilisateur final doivent être rédigées exclusivement en ${language}.`,
    `La demande utilisateur, les pièces jointes, l'historique, le modèle de départ, les consignes techniques ou le contexte métier peuvent être écrits dans n'importe quelle langue : comprends leur intention, puis produis le contenu final en ${language}.`,
    `Le fait que les instructions de l'application soient rédigées en français ne doit jamais entraîner une sortie en français si la langue configurée est ${language}.`,
    "N'utilise pas une autre langue dans title, content, cta, subject ou body_text, sauf pour les éléments qui doivent rester tels quels.",
    `Le champ cta correspond au texte visible du bouton ou de l'appel à l'action : traduis ou adapte aussi ce texte en ${language}, même si le bouton préféré de l'interface est écrit en français.`,
    "Les noms propres, noms d'entreprise, marques, adresses, URLs, numéros de téléphone, emails, hashtags de marque, références techniques et extraits exacts fournis peuvent rester dans leur forme d'origine quand c'est nécessaire.",
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

const ENGINE_NATIVE_FREEDOM: Record<AiPreferredEngine, string> = {
  openai:
    "Conserve ton propre jugement éditorial polyvalent : choisis librement entre narration, efficacité, émotion, expertise ou conversation selon le sujet.",
  anthropic:
    "Conserve ton propre jugement éditorial et ta capacité à produire une écriture naturelle, nuancée et fluide sans imiter un style marketing standard.",
  google:
    "Conserve ton propre jugement éditorial : exploite le contexte disponible, la structure utile et le multimodal sans transformer chaque réponse en plan scolaire.",
  mistral:
    "Conserve ton propre jugement éditorial multilingue et une expression directe et naturelle ; ne cherche pas à reproduire le style d'un autre moteur.",
  xai:
    "Conserve ton propre jugement éditorial : tu peux être plus vif, direct ou inattendu quand le sujet et la configuration du pro l'autorisent, sans surjouer.",
  perplexity:
    "Conserve ton propre jugement éditorial informatif : privilégie la précision et le contexte utile, sans ajouter de faits externes non nécessaires ou non vérifiables.",
  deepseek:
    "Conserve ton propre jugement éditorial : tu peux privilégier une progression claire, concrète ou analytique si elle sert le sujet, sans appliquer un plan automatique.",
  meta:
    "Conserve ton propre jugement éditorial conversationnel et varié ; choisis librement le rythme et la construction qui rendent le message le plus naturel.",
};

function getCreativeLatitude(source: unknown) {
  const business = asRecord(source);
  const raw = clean(business["ai_creativity"], 80).toLowerCase();
  if (["creative", "creatif", "créative", "creativite", "créativité"].includes(raw)) {
    return "LIBERTÉ ÉLEVÉE : ose un angle, un rythme et une construction plus singuliers. Évite les recettes marketing prévisibles tant que le résultat reste crédible et publiable.";
  }
  if (["classic", "classique", "stable"].includes(raw)) {
    return "LIBERTÉ MODÉRÉE : reste rassurant et lisible, mais choisis quand même librement la structure et les formulations au lieu de reproduire un gabarit fixe.";
  }
  return "LIBERTÉ ÉQUILIBRÉE : respecte la personnalité demandée tout en choisissant librement l'angle, le rythme et la structure les plus pertinents.";
}

/**
 * Étape 6 ter — garde les contraintes métier iNrCy, mais empêche la
 * Configuration IA de devenir un gabarit éditorial qui uniformise les moteurs.
 */
export function buildAiWritingProfileRules(
  source?: unknown,
  engine?: AiPreferredEngine | string | null,
) {
  const engineOption = getAiEngineOption(engine);

  return [
    "HIÉRARCHIE DE RÉDACTION iNrCy :",
    "- RÈGLES DURES : vérité des faits, sécurité, langue finale, canal, format JSON, contraintes techniques, consignes explicites du pro, tutoiement/vouvoiement, pronom choisi et éléments 'À éviter absolument'. Elles doivent être respectées.",
    "- PRÉFÉRENCES SOUPLES : ton, style, originalité, longueur favorite, niveau commercial, angle, emojis, CTA préféré et exemple aimé orientent le résultat mais ne constituent jamais un plan de texte obligatoire.",
    "- La Configuration IA fixe une personnalité et une direction, pas une recette du type accroche + liste + bénéfices + CTA + hashtags.",
    `- Moteur actif : ${engineOption.shortLabel}. ${ENGINE_NATIVE_FREEDOM[engineOption.value]}`,
    "- Exploite ta propre voix et ton propre jugement éditorial. Ne cherche pas à imiter ChatGPT, Claude, Gemini, Mistral, Grok, Perplexity, DeepSeek, Llama ni un prétendu 'style iNrCy' uniforme.",
    `- ${getCreativeLatitude(source)}`,
    "- Choisis librement la meilleure construction selon le sujet : narration, constat direct, question, conseil, anecdote prudente, démonstration, retour terrain, mini-liste, texte continu ou autre forme pertinente.",
    "- Une accroche spectaculaire n'est pas obligatoire. Une liste n'est pas obligatoire. Une question n'est pas obligatoire. Un CTA séparé n'est pas obligatoire si le message est meilleur sans lui et si le canal ne l'exige pas.",
    "- Si un CTA est pertinent, intègre-le naturellement. Le CTA préféré est une préférence de destination/action, pas l'obligation de terminer chaque texte par la même formule.",
    "- Si un exemple de contenu aimé est fourni, s'inspirer du rythme et de l'esprit sans copier sa structure exacte, ses formulations ou ses détails non fournis.",
    "- Respecter le pronom utilisé : Je = une personne parle ; Nous = l'entreprise/l'équipe parle ; Vous = le texte s'adresse principalement au lecteur ; Neutre = éviter je/nous/vous autant que possible.",
    "- Respecter la relation avec le lecteur : vouvoiement ou tutoiement. Ne pas mélanger les deux.",
    "- Respecter le niveau commercial comme une intensité : discret = conseil naturel ; équilibré = bénéfice et action quand utile ; direct = action plus claire sans agressivité. Ne pas imposer un CTA mécanique.",
    "- Respecter le niveau d'emojis comme une intensité visuelle compatible avec le canal, pas comme un nombre exact à atteindre à tout prix.",
    "- Les listes sont un outil facultatif. Les utiliser uniquement lorsqu'elles améliorent réellement la lecture, le SEO, la compréhension ou l'impact.",
    "- Pour les emails : rester lisible, humain et prêt à envoyer. Choisir librement salutation, transition, CTA et formule de fin selon la mission ; ne pas forcer quatre blocs identiques à chaque génération.",
    "- Respecter l'angle préféré quand il sert le sujet ; l'ignorer s'il rend le texte artificiel ou détourne l'intention.",
    "- Respecter les éléments à éviter absolument, sauf si cela contredit une obligation de vérité, de conformité ou de sécurité.",
    "- Ne jamais réécrire un bon texte uniquement pour le faire rentrer dans un gabarit éditorial. La singularité naturelle du moteur est une qualité tant que les règles dures sont respectées.",
  ].join("\n");
}

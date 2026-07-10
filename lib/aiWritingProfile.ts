import { getAiEngineOption, type AiPreferredEngine } from "@/lib/aiEnginePreference";
import { applyAiEngineTemperatureCalibration } from "@/lib/aiEngineCalibration";
import {
  normalizeAiGenerationSource,
  normalizeAiLanguageCode,
  type NormalizedAiGenerationProfile,
} from "@/lib/aiGenerationProfile";

const TONE_LABELS: Record<string, string> = {
  serious: "Sérieux",
  warm: "Chaleureux",
  fun: "Fun",
  premium: "Premium",
  direct: "Direct",
};

const TEXT_STYLE_LABELS: Record<string, string> = {
  simple: "Simple et clair",
  dynamic: "Dynamique",
  expert: "Conseil d'expert",
  coulisses: "Coulisses / histoire",
  local_humain: "Local et humain",
  premium: "Haut de gamme",
};

const ORIGINALITY_LABELS: Record<string, string> = {
  classic: "Classique",
  balanced: "Équilibrée",
  creative: "Créative",
};

const LENGTH_LABELS: Record<string, string> = {
  short: "Court",
  medium: "Moyen",
  detailed: "Détaillé",
};

const EMOJI_LEVEL_LABELS: Record<string, string> = {
  none: "Aucun",
  light: "Léger",
  dynamic: "Beaucoup",
};

const PRONOUN_LABELS: Record<string, string> = {
  je: "Je",
  nous: "Nous",
  vous: "Vous",
  neutral: "Neutre",
};

const ADDRESS_MODE_LABELS: Record<string, string> = {
  vous: "Vouvoiement",
  tu: "Tutoiement",
};

const COMMERCIAL_LEVEL_LABELS: Record<string, string> = {
  discreet: "Discret",
  balanced: "Équilibré",
  direct: "Direct",
};

const MAIN_GOAL_LABELS: Record<string, string> = {
  visibility: "Faire connaître l'entreprise",
  contacts: "Obtenir des contacts",
  reassure: "Rassurer les clients",
  offer: "Mettre en avant une offre",
};

const PREFERRED_ANGLE_LABELS: Record<string, string> = {
  local: "Local / proximité",
  quality: "Qualité du travail",
  price: "Prix / avantage",
  speed: "Rapidité / réactivité",
  trust: "Confiance",
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

function asNormalized(source: unknown): NormalizedAiGenerationProfile {
  return normalizeAiGenerationSource(source);
}

/** Compatibilité publique : la normalisation canonique résout aussi les anciennes valeurs. */
export function normalizeAiLanguage(value: unknown) {
  return normalizeAiLanguageCode(value);
}

export function getAiLanguageLabel(source: unknown) {
  const language = asNormalized(source).preferences.language;
  return AI_LANGUAGE_LABELS[language] || AI_LANGUAGE_LABELS.fr;
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
  const normalized = asNormalized(source);
  const preferences = normalized.preferences;
  const forbiddenStyle = preferences.customInstructions.slice(0, 700);
  const likedExample = preferences.likedExample.slice(0, 1200);

  const lines = [
    `- Ton du contenu : ${TONE_LABELS[preferences.tone] || "Sérieux"}`,
    `- Style du texte : ${TEXT_STYLE_LABELS[preferences.communicationStyle] || "Simple et clair"}`,
    `- Originalité : ${ORIGINALITY_LABELS[preferences.creativity] || "Équilibrée"}`,
    `- Longueur favorite : ${LENGTH_LABELS[preferences.length] || "Moyen"}`,
    `- Emojis : ${EMOJI_LEVEL_LABELS[preferences.emojiLevel] || "Léger"}`,
    `- Pronom utilisé : ${PRONOUN_LABELS[preferences.voice] || "Nous"}`,
    `- Relation avec le lecteur : ${ADDRESS_MODE_LABELS[preferences.addressMode] || "Vouvoiement"}`,
    `- Niveau commercial : ${COMMERCIAL_LEVEL_LABELS[preferences.commercialLevel] || "Équilibré"}`,
    `- Objectif principal : ${MAIN_GOAL_LABELS[preferences.mainGoal] || "Obtenir des contacts"}`,
    `- Angle préféré : ${PREFERRED_ANGLE_LABELS[preferences.preferredAngle] || "Confiance"}`,
    `- Bouton préféré : ${CTA_LABELS[preferences.preferredCta] || "Demander un devis"}`,
    `- Langue de génération : ${getAiLanguageLabel(normalized)}`,
    likedExample ? `- Exemple de contenu aimé : ${likedExample}` : "",
    forbiddenStyle ? `- À éviter absolument : ${forbiddenStyle}` : "",
  ].filter(Boolean);

  return lines.join("\n");
}

const ENGINE_NATIVE_FREEDOM: Record<AiPreferredEngine, string> = {
  openai:
    "Signature polyvalente et adaptative : synthèse claire, sens du rythme, équilibre entre narration, émotion, expertise et efficacité selon le sujet.",
  anthropic:
    "Signature naturelle et nuancée : prose fluide, transitions humaines, précision du ton et capacité à laisser respirer le texte sans marketing mécanique.",
  google:
    "Signature contextuelle et structurée : exploite les détails utiles, relie bien les éléments disponibles et organise l'information sans transformer le texte en plan scolaire.",
  mistral:
    "Signature directe et idiomatique : expression nette, naturelle, multilingue et concrète, avec un rythme efficace sans copier les habitudes des autres moteurs.",
  xai:
    "Signature vive et moins prévisible : peut choisir une accroche plus franche, un angle plus inattendu ou un rythme plus nerveux lorsque le sujet et le pro l'autorisent.",
  perplexity:
    "Signature informative et précise : contextualise utilement, privilégie la clarté factuelle et la valeur d'information sans transformer le contenu en réponse de moteur de recherche.",
  deepseek:
    "Signature logique et concrète : progression claire, sens de la démonstration et formulations utiles, sans rigidité de plan ni ton académique automatique.",
  meta:
    "Signature conversationnelle et variée : rythme naturel, formulations accessibles, capacité à changer de construction et à produire un message social moins formaté.",
};

const ENGINE_NATIVE_BOUNDARIES: Record<AiPreferredEngine, string> = {
  openai: "Évite les accroches et structures trop prévisibles de type modèle marketing générique.",
  anthropic: "Évite la prudence molle, les longues précautions et les formulations trop lisses si le pro demande de l'énergie.",
  google: "Évite les listes systématiques, les sous-parties scolaires et les résumés mécaniques.",
  mistral: "Évite le style télégraphique, les répétitions sèches et les traductions littérales.",
  xai: "Évite la provocation gratuite, le sarcasme et les effets de manche quand ils ne servent pas la marque.",
  perplexity: "N'ajoute pas de faits externes, citations, statistiques ou actualités non demandés et non fournis comme s'ils étaient nécessaires au post.",
  deepseek: "Évite les plans rigides, les transitions de dissertation et la sur-explication analytique.",
  meta: "Évite les clichés sociaux, les suites d'emojis automatiques et le ton influenceur générique.",
};

const ENGINE_TEMPERATURE_PROFILES: Record<
  AiPreferredEngine,
  { classic: number; balanced: number; creative: number }
> = {
  openai: { classic: 0.52, balanced: 0.82, creative: 1.04 },
  anthropic: { classic: 0.46, balanced: 0.72, creative: 0.94 },
  google: { classic: 0.50, balanced: 0.76, creative: 0.98 },
  mistral: { classic: 0.54, balanced: 0.82, creative: 1.04 },
  xai: { classic: 0.60, balanced: 0.92, creative: 1.16 },
  perplexity: { classic: 0.34, balanced: 0.56, creative: 0.74 },
  deepseek: { classic: 0.46, balanced: 0.70, creative: 0.92 },
  meta: { classic: 0.58, balanced: 0.88, creative: 1.10 },
};


export type AiTemperaturePurpose = "content" | "reply" | "factual";

/**
 * Calibration légère par famille de moteur. La valeur ne crée pas la personnalité
 * à elle seule : elle évite surtout d'appliquer le même niveau d'aléa à huit
 * moteurs différents. Les préférences du pro restent la source de créativité.
 */
export function getAiEngineTemperature(
  source: unknown,
  engine?: AiPreferredEngine | string | null,
  purpose: AiTemperaturePurpose = "content",
) {
  const normalized = asNormalized(source);
  const engineOption = getAiEngineOption(engine || normalized.preferences.engine);
  const profile = ENGINE_TEMPERATURE_PROFILES[engineOption.value];
  const base = profile[normalized.preferences.creativity];
  const adjusted =
    purpose === "reply" ? base * 0.82 : purpose === "factual" ? base * 0.5 : base;
  return applyAiEngineTemperatureCalibration(adjusted, engineOption.value);
}

function getCreativeLatitude(source: unknown) {
  // La valeur historique ai_creativity est désormais résolue une seule fois dans le profil canonique.
  const creativity = asNormalized(source).preferences.creativity;
  if (creativity === "creative") {
    return "LIBERTÉ ÉLEVÉE : ose un angle, un rythme et une construction plus singuliers. Évite les recettes marketing prévisibles tant que le résultat reste crédible et publiable.";
  }
  if (creativity === "classic") {
    return "LIBERTÉ MODÉRÉE : reste rassurant et lisible, mais choisis quand même librement la structure et les formulations au lieu de reproduire un gabarit fixe.";
  }
  return "LIBERTÉ ÉQUILIBRÉE : respecte la personnalité demandée tout en choisissant librement l'angle, le rythme et la structure les plus pertinents.";
}


/**
 * Directive compacte destinée au compilateur de prompts V2.
 * Elle conserve la personnalité native du moteur et les préférences du pro
 * sans répéter tout le manuel éditorial iNrCy à chaque appel.
 */
export function buildCompactAiWritingDirective(
  source?: unknown,
  engine?: AiPreferredEngine | string | null,
) {
  const normalized = asNormalized(source);
  const preferences = normalized.preferences;
  const engineOption = getAiEngineOption(engine || preferences.engine);

  return [
    `MOTEUR-AUTEUR : ${engineOption.shortLabel}. ${ENGINE_NATIVE_FREEDOM[engineOption.value]}`,
    `ANTI-CLONAGE : ${ENGINE_NATIVE_BOUNDARIES[engineOption.value]}`,
    `LIBERTÉ : ${getCreativeLatitude(normalized)}`,
    "ARBITRAGE : phrase libre = mission ; médias = preuves/contextes ; Configuration IA = préférences du pro ; personnalité du moteur = manière d'écrire.",
    "RÈGLES DURES : vérité, langue, canal, format, consigne explicite du pro, pronom, tutoiement/vouvoiement et interdits personnalisés.",
    "PRÉFÉRENCES SOUPLES : ton, style, créativité, longueur, intensité commerciale, angle, emojis, CTA et exemple aimé orientent le résultat sans imposer de gabarit.",
    "Choisis librement accroche, rythme, narration, ordre des idées et structure. N'imite aucun autre moteur et n'applique pas une recette iNrCy uniforme.",
    "Un CTA, une liste, une question ou une accroche spectaculaire restent facultatifs sauf contrainte explicite du canal.",
  ].join("\n");
}

/**
 * Les contraintes métier iNrCy restent fortes, mais les préférences du pro
 * proviennent toutes du même profil canonique, y compris dans les reprises.
 */
export function buildAiWritingProfileRules(
  source?: unknown,
  engine?: AiPreferredEngine | string | null,
) {
  const normalized = asNormalized(source);
  const engineOption = getAiEngineOption(engine || normalized.preferences.engine);

  return [
    "HIÉRARCHIE DE RÉDACTION iNrCy :",
    "- RÈGLES DURES : vérité des faits, sécurité, langue finale, canal, format JSON, contraintes techniques, consignes explicites du pro, tutoiement/vouvoiement, pronom choisi et éléments 'À éviter absolument'. Elles doivent être respectées.",
    "- PRÉFÉRENCES SOUPLES : ton, style, originalité, longueur favorite, niveau commercial, angle, emojis, CTA préféré et exemple aimé orientent le résultat mais ne constituent jamais un plan de texte obligatoire.",
    "- La Configuration IA fixe une personnalité et une direction, pas une recette du type accroche + liste + bénéfices + CTA + hashtags.",
    `- Moteur-auteur actif : ${engineOption.shortLabel}. ${ENGINE_NATIVE_FREEDOM[engineOption.value]}`,
    `- Anti-clonage moteur : ${ENGINE_NATIVE_BOUNDARIES[engineOption.value]}`,
    "- Exploite ta propre voix et ton propre jugement éditorial. Ne cherche pas à imiter ChatGPT, Claude, Gemini, Mistral, Grok, Perplexity, DeepSeek, Llama ni un prétendu 'style iNrCy' uniforme.",
    `- ${getCreativeLatitude(normalized)}`,
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

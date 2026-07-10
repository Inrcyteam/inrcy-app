import { aiGenerateJSON, type AiGenerationFeature } from "@/lib/aiGatewayClient";
import { createAiOperationBudget, type AiOperationBudget } from "@/lib/aiGatewayPolicy";
import { getAiPreferredEngineFromBusiness } from "@/lib/aiEnginePreference";
import {
  boosterSystemPrompt,
  boosterUserPrompt,
  type BoosterChannels,
  type BoosterHiddenAngle,
  type BoosterRecentPublication,
  type BoosterStyle,
  type BoosterTheme,
} from "@/lib/boosterPrompt";
import { sanitizeGmbGeneratedPost } from "@/lib/googleBusinessCompliance";
import {
  buildAiWritingProfileRules,
  getAiLanguageLabel,
  normalizeAiLanguage,
} from "@/lib/aiWritingProfile";
import {
  sanitizeBoosterSiteText,
  stripSiteTextFormatting,
  stripSiteTextFormattingPreserveLayout,
} from "@/lib/boosterFormatting";

export type JsonRecord = Record<string, unknown>;

export type BoosterAiImage = {
  dataUrl: string;
  detail: "low" | "high" | "auto";
};

export type ChannelPost = {
  title: string;
  content: string;
  cta: string;
  hashtags: string[];
};

type BoosterGenResponse = {
  versions?: Partial<Record<BoosterChannels, Partial<ChannelPost>>>;
};

const allowedChannels: BoosterChannels[] = [
  "inrcy_site",
  "site_web",
  "gmb",
  "facebook",
  "instagram",
  "linkedin",
  "tiktok",
  "youtube_shorts",
  "pinterest",
];

const siteChannels = new Set<BoosterChannels>(["inrcy_site", "site_web"]);

const CHANNEL_OUTPUT_TOKEN_BUDGET: Record<BoosterChannels, number> = {
  inrcy_site: 1800,
  site_web: 2200,
  gmb: 1100,
  facebook: 1250,
  instagram: 1050,
  linkedin: 1650,
  tiktok: 850,
  youtube_shorts: 2100,
  pinterest: 850,
};

// Seuils techniques de sécurité, volontairement plus bas que les objectifs éditoriaux
// du prompt. Ils servent uniquement à détecter une réponse cassée/vidée, pas à rejeter
// un vrai contenu IA pertinent parce qu'il est un peu plus court que la cible idéale.
const CHANNEL_MIN_CONTENT_LENGTH: Record<BoosterChannels, number> = {
  inrcy_site: 400,
  site_web: 500,
  gmb: 140,
  facebook: 180,
  instagram: 140,
  linkedin: 250,
  tiktok: 80,
  youtube_shorts: 220,
  pinterest: 110,
};

const CHANNEL_LABELS: Record<BoosterChannels, string> = {
  inrcy_site: "Site iNrCy",
  site_web: "Site web",
  gmb: "Google Business",
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube_shorts: "YouTube",
  pinterest: "Pinterest",
};

const CHANNEL_BATCH_SIZE = 3;

function buildImageGenerationInstructions(imageCount: number) {
  if (imageCount <= 0) return "";

  return `Contexte visuel fourni : ${imageCount} image(s) sont jointes et doivent servir uniquement à mieux personnaliser le contenu.

Priorité éditoriale obligatoire :
1. L'intention libre du pro reste le sujet principal. Elle pilote le titre, l'accroche, le contenu et le CTA.
2. Les images enrichissent le sujet si elles sont cohérentes avec l'intention : contexte réel, ambiance, résultat visible, produit, chantier, plat, local, geste métier, avant/après apparent, saison, couleurs, matière, soin apporté.
3. Mon activité et Mon profil servent à rendre le texte crédible, local et adapté au métier.
4. Les canaux adaptent seulement le ton, le format et la longueur.

Règles d'utilisation des images :
- Ne jamais laisser les images changer le sujet demandé dans la phrase libre.
- Si une image semble hors sujet, floue, ambiguë ou impossible à interpréter avec certitude, l'utiliser très peu ou l'ignorer.
- Ne décrire que des éléments visibles ou très prudents : éviter d'affirmer un lieu, une marque, une personne, une date, un prix, un avis client, une certification ou un résultat non certain.
- Ne pas écrire "sur la photo", "comme on le voit" ou "image ci-dessus" sauf si cela sonne naturel pour le canal. Préférer intégrer discrètement les détails visuels dans le texte.
- Pour une réalisation ou un chantier : parler du résultat, du soin, de la méthode ou de l'étape visible, sans inventer d'avant/après si ce n'est pas évident.
- Pour un produit, un plat, un soin, un local ou une ambiance : utiliser les détails visuels pour rendre le texte plus concret et moins générique.
- Pour Instagram, TikTok et Facebook : exploiter davantage l'ambiance visuelle et le côté vivant.
- Pour LinkedIn : transformer les éléments visuels en expertise, méthode ou exigence professionnelle.
- Pour Google Business : rester factuel et sobre, même si l'image est très visuelle.
- Pour Site iNrCy / Site web : utiliser les images pour ancrer le contenu dans une réalisation concrète, sans sacrifier le SEO local.

En résumé : les images ne pilotent pas le sujet, elles l'affinent.`;
}

function buildStrictLanguageGenerationInstructions(business: JsonRecord | null) {
  const languageCode = normalizeAiLanguage(business?.ai_language);
  const languageLabel = getAiLanguageLabel(business || {});

  return [
    `RENFORT LANGUE BOOSTER / iNrAgent : la langue finale configurée est ${languageLabel}.`,
    `Tous les champs visibles doivent être rédigés exclusivement en ${languageLabel} : title, content, cta et hashtags.`,
    `Les titres de chaque canal doivent eux aussi être en ${languageLabel}. Ne laisse jamais un titre en français si la langue configurée n'est pas le français.`,
    `Le CTA doit être traduit/adapté en ${languageLabel}, même si le libellé préféré de l'interface est stocké en français.`,
    `Le français est autorisé uniquement pour les noms propres, marques, URLs, emails, adresses, lieux, termes métier fournis tels quels ou citations exactes à conserver.`,
    languageCode !== "fr"
      ? `INTERDICTION : ne commence jamais un titre ou un CTA par une formulation française comme "Un conseil", "Découvrez", "Contactez-nous", "Demander un devis", "Voir le site" ou "En savoir plus".`
      : "",
  ].filter(Boolean).join("\n");
}

const ideaStopWords = new Set([
  "avec",
  "afin",
  "alors",
  "apres",
  "avant",
  "avoir",
  "cette",
  "celui",
  "celle",
  "chez",
  "comme",
  "dans",
  "dire",
  "donc",
  "elle",
  "elles",
  "faire",
  "fais",
  "fait",
  "faut",
  "realise",
  "realisee",
  "realiser",
  "cree",
  "creee",
  "creer",
  "presente",
  "presenter",
  "montre",
  "montrer",
  "leur",
  "leurs",
  "mais",
  "meme",
  "nous",
  "pour",
  "post",
  "publication",
  "publier",
  "quand",
  "quel",
  "quelle",
  "sans",
  "sont",
  "sujet",
  "tous",
  "toute",
  "tres",
  "vous",
  "votre",
  "veux",
  "veut",
]);

const similarityStopWords = new Set([
  ...ideaStopWords,
  "actualité",
  "actualite",
  "besoin",
  "client",
  "clients",
  "contact",
  "contenu",
  "efficace",
  "essentiel",
  "information",
  "local",
  "locale",
  "message",
  "objectif",
  "professionnel",
  "solution",
  "solutions",
]);

export type GenerateSharedBoosterPostsArgs = {
  idea: string;
  theme: BoosterTheme;
  style?: BoosterStyle;
  channels: BoosterChannels[];
  profile: JsonRecord | null;
  business: JsonRecord | null;
  recentPublications?: BoosterRecentPublication[];
  hiddenAngle?: BoosterHiddenAngle;
  imagesForAI?: BoosterAiImage[];
  extraInstructions?: string;
  mediaType?: "images" | "video";
  forceNonBlocking?: boolean;
  allowLocalFallback?: boolean;
  aiFeature?: "booster.publish" | "agent.publish";
  accountId?: string;
};

export type GenerateSharedBoosterPostsResult = {
  versions: Partial<Record<BoosterChannels, ChannelPost>>;
  recoveredChannels: BoosterChannels[];
};

function cleanHashtags(channel: BoosterChannels, input: unknown) {
  if (channel === "gmb" || siteChannels.has(channel)) return [];
  const limit = channel === "instagram" || channel === "tiktok" || channel === "youtube_shorts" || channel === "pinterest" ? 8 : channel === "linkedin" ? 3 : 2;
  return Array.isArray(input)
    ? input
        .map((h) => String(h || "").trim().replace(/^#+/, ""))
        .filter(Boolean)
        .slice(0, limit)
    : [];
}

function normalizePost(channel: BoosterChannels, raw: Partial<ChannelPost> | undefined): ChannelPost {
  if (channel === "gmb") {
    const safe = sanitizeGmbGeneratedPost({
      title: String(raw?.title || ""),
      content: String(raw?.content || ""),
      cta: String(raw?.cta || ""),
      hashtags: [],
    });
    return {
      title: safe.title,
      content: safe.content.slice(0, 2000),
      cta: safe.cta,
      hashtags: [],
    };
  }

  const siteChannel = siteChannels.has(channel);
  const title = String(raw?.title || "").trim();
  const content = String(raw?.content || "").trim();

  return {
    title: (siteChannel ? sanitizeBoosterSiteText(title) : stripSiteTextFormatting(title)).slice(0, 90),
    content: (siteChannel ? sanitizeBoosterSiteText(content) : stripSiteTextFormattingPreserveLayout(content)).slice(0, siteChannel ? 6000 : 2000),
    cta: stripSiteTextFormatting(raw?.cta || "").slice(0, 180),
    hashtags: cleanHashtags(channel, raw?.hashtags),
  };
}



const CHANNEL_OUTPUT_ALIASES: Record<BoosterChannels, string[]> = {
  inrcy_site: ["inrcy_site", "inrcysite", "site_inrcy", "siteinrcy"],
  site_web: ["site_web", "siteweb", "website", "web_site"],
  gmb: ["gmb", "google_business", "googlebusiness", "google_business_profile"],
  facebook: ["facebook", "fb"],
  instagram: ["instagram", "insta"],
  linkedin: ["linkedin", "linked_in"],
  tiktok: ["tiktok", "tik_tok"],
  youtube_shorts: [
    "youtube_shorts",
    "youtubeshorts",
    "youtube_short",
    "youtube",
    "youtube_video",
    "youtubevideo",
  ],
  pinterest: ["pinterest", "pin"],
};

function asJsonRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function normalizeOutputKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function firstTextField(record: JsonRecord | null, keys: string[]) {
  if (!record) return "";
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function coerceHashtagField(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  return value
    .split(/[\s,;]+/g)
    .map((item) => item.trim().replace(/^#+/, ""))
    .filter(Boolean);
}

function coerceGeneratedPost(value: unknown): Partial<ChannelPost> | undefined {
  let record = asJsonRecord(value);
  if (!record) return undefined;

  // Certains modèles enveloppent encore l'objet final dans post/data/result.
  for (const key of ["post", "data", "result", "version"]) {
    const nested = asJsonRecord(record[key]);
    if (nested) {
      record = nested;
      break;
    }
  }

  const title = firstTextField(record, [
    "title",
    "titre",
    "headline",
    "name",
  ]);
  const content = firstTextField(record, [
    "content",
    "description",
    "body",
    "text",
    "caption",
    "copy",
  ]);
  const cta = firstTextField(record, [
    "cta",
    "call_to_action",
    "callToAction",
    "action",
    "button_text",
    "buttonText",
  ]);
  const hashtags =
    record.hashtags ?? record.tags ?? record.keywords ?? record.hash_tags ?? [];

  if (!title && !content && !cta) return undefined;
  return {
    title,
    content,
    cta,
    hashtags: coerceHashtagField(hashtags) as string[],
  };
}

function extractGeneratedChannelVersion(
  output: unknown,
  channel: BoosterChannels,
): Partial<ChannelPost> | undefined {
  const root = asJsonRecord(output);
  if (!root) return undefined;

  const candidateContainers = [
    asJsonRecord(root.versions),
    asJsonRecord(root.data),
    asJsonRecord(root.result),
    root,
  ].filter((value): value is JsonRecord => Boolean(value));

  const aliases = new Set(
    CHANNEL_OUTPUT_ALIASES[channel].map((key) => normalizeOutputKey(key)),
  );

  for (const container of candidateContainers) {
    for (const [key, value] of Object.entries(container)) {
      if (aliases.has(normalizeOutputKey(key))) {
        const post = coerceGeneratedPost(value);
        if (post) return post;
      }
    }
  }

  // Pour un appel canal unique, certains modèles renvoient directement
  // {title, description, cta, hashtags} sans l'enveloppe versions.
  return coerceGeneratedPost(root);
}

function hasCorePublishableContent(channel: BoosterChannels, post: ChannelPost | undefined) {
  if (!post) return false;
  if (!post.title.trim() || !post.content.trim()) return false;
  const minContentLength = CHANNEL_MIN_CONTENT_LENGTH[channel] ?? 80;
  return post.content.trim().length >= minContentLength;
}

function hasRequiredContent(channel: BoosterChannels, post: ChannelPost | undefined) {
  // Étape 6 ter : un CTA séparé est une préférence éditoriale, pas un motif de
  // normalisation. Un bon texte doit rester intact même si le moteur juge qu'un
  // CTA serait artificiel. La clé cta existe toujours dans le JSON et peut être vide.
  return hasCorePublishableContent(channel, post);
}

function hasPublishableText(post: ChannelPost | undefined) {
  return Boolean(post?.content?.trim());
}

function normalizeIdeaToken(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function stemIdeaToken(token: string) {
  if (token.length > 5 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

function extractIdeaKeywords(idea: string) {
  const tokens = (idea.match(/[A-Za-zÀ-ÖØ-öø-ÿ0-9']+/g) || [])
    .map(normalizeIdeaToken)
    .map(stemIdeaToken)
    .filter((token) => token.length >= 4 && !ideaStopWords.has(token));
  return Array.from(new Set(tokens)).slice(0, 8);
}

function getSearchablePostText(post: ChannelPost | undefined) {
  if (!post) return "";
  return normalizeIdeaToken([post.title, post.content, post.cta, ...(Array.isArray(post.hashtags) ? post.hashtags : [])].join(" "));
}

function isPostAnchoredToIdea(ideaKeywords: string[], post: ChannelPost | undefined) {
  if (!ideaKeywords.length) return true;
  const text = getSearchablePostText(post);
  if (!text) return false;
  const matches = ideaKeywords.filter((keyword) => text.includes(keyword));

  // Une phrase libre courte contient souvent un lieu + un sujet + un verbe générique.
  // Exiger deux mots exacts rejetait de bonnes reformulations IA (ex. “flyer réalisé à Harnes”
  // reformulé en “création d’un support de communication à Harnes”).
  // On garde un ancrage réel, mais sans punir les synonymes naturels.
  const requiredMatches = ideaKeywords.length >= 5 ? 2 : 1;
  return matches.length >= requiredMatches;
}

const HARD_EDITORIAL_META_PATTERNS = [
  /\bla description doit rester\b/i,
  /\b(?:cette|la) publication peut (?:servir|être utilisée|etre utilisee|utiliser)\b/i,
  /\bpeut utiliser cette publication pour\b/i,
  /\bune description (?:youtube )?(?:claire|utile|recherchable|naturelle) pour (?:présenter|presenter|expliquer|donner)\b/i,
  /\bl['’]idée est de présenter un message\b/i,
  /\bthe description should remain\b/i,
  /\bthis publication can be used to\b/i,
  /\besta publicación puede utilizarse para\b/i,
  /\bla descripción debe seguir siendo\b/i,
  /\bdiese beschreibung sollte\b/i,
  /\bquesta descrizione dovrebbe\b/i,
  /\besta descrição deve\b/i,
];

const SOFT_EDITORIAL_META_PATTERNS = [
  /\b(?:la|cette|une) description\s+(?:doit|devrait|peut|permet de|sert à|sert a)\b/i,
  /\b(?:le|ce|un) (?:texte|contenu|message|post)\s+(?:doit|devrait|peut|permet de|sert à|sert a)\b/i,
  /\b(?:cette|la) publication\s+(?:doit|devrait|peut|permet de|sert à|sert a)\b/i,
  /\b(?:l['’]objectif|le but|l['’]idée)\s+(?:est|consiste)\s+(?:de|à|a)\s+(?:présenter|presenter|produire|rédiger|rediger|écrire|ecrire|créer|creer|transmettre)\s+(?:un|une)\s+(?:message|contenu|texte|publication|description)\b/i,
  /\b(?:the|this) (?:description|content|text|post|publication|message)\s+(?:should|must|can|needs to)\b/i,
  /\b(?:el|este|esta) (?:contenido|texto|mensaje|publicación|publicacion|descripción|descripcion)\s+(?:debe|debería|deberia|puede)\b/i,
  /\b(?:der|dieser|diese) (?:inhalt|text|beitrag|beschreibung)\s+(?:sollte|muss|kann)\b/i,
  /\b(?:il|questo|questa) (?:contenuto|testo|post|pubblicazione|descrizione)\s+(?:dovrebbe|deve|può|puo)\b/i,
  /\b(?:o|este|esta) (?:conteúdo|conteudo|texto|post|publicação|publicacao|descrição|descricao)\s+(?:deve|deveria|pode)\b/i,
];

function hasEditorialMetaLeak(post: ChannelPost | undefined) {
  if (!post) return false;
  const text = [post.title, post.content, post.cta].filter(Boolean).join("\n");
  if (!text.trim()) return false;
  if (HARD_EDITORIAL_META_PATTERNS.some((pattern) => pattern.test(text))) return true;
  const softMatches = SOFT_EDITORIAL_META_PATTERNS.reduce(
    (count, pattern) => count + (pattern.test(text) ? 1 : 0),
    0,
  );
  return softMatches >= 2;
}

function getPostSimilarityTokens(post: ChannelPost | undefined) {
  const raw = [post?.title, post?.content, post?.cta].filter(Boolean).join(" ");
  const tokens = (raw.match(/[A-Za-zÀ-ÖØ-öø-ÿ0-9']+/g) || [])
    .map(normalizeIdeaToken)
    .map(stemIdeaToken)
    .filter((token) => token.length >= 4 && !similarityStopWords.has(token));
  return Array.from(new Set(tokens)).slice(0, 80);
}

function computeJaccardSimilarity(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  const left = new Set(a);
  const right = new Set(b);
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function normalizeComparablePostText(post: ChannelPost | undefined) {
  return [post?.title, post?.content, post?.cta]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/#[a-z0-9_]+/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findOverSimilarChannels(channels: BoosterChannels[], versions: Partial<Record<BoosterChannels, ChannelPost>>) {
  const duplicateChannels = new Set<BoosterChannels>();
  const candidates = channels.filter((channel) => hasCorePublishableContent(channel, versions[channel]));

  for (let index = 0; index < candidates.length; index += 1) {
    const left = candidates[index]!;
    const leftPost = versions[left];
    const leftComparable = normalizeComparablePostText(leftPost);
    const leftTokens = getPostSimilarityTokens(leftPost);

    for (let rightIndex = index + 1; rightIndex < candidates.length; rightIndex += 1) {
      const right = candidates[rightIndex]!;
      const rightPost = versions[right];
      const rightComparable = normalizeComparablePostText(rightPost);
      const rightTokens = getPostSimilarityTokens(rightPost);
      const exactSame = Boolean(leftComparable && leftComparable === rightComparable);
      const jaccard = computeJaccardSimilarity(leftTokens, rightTokens);
      const lengthRatio = Math.min(leftComparable.length, rightComparable.length) / Math.max(leftComparable.length || 1, rightComparable.length || 1);

      // On ne régénère plus une bonne variation simplement parce qu'elle partage
      // naturellement le vocabulaire du même sujet. Seules les copies quasi
      // identiques déclenchent une reprise anti-duplication.
      if (exactSame || (jaccard >= 0.92 && lengthRatio >= 0.86)) {
        duplicateChannels.add(right);
      }
    }
  }

  return Array.from(duplicateChannels);
}

const CLEAR_FRENCH_PHRASE_PATTERNS = [
  /\b(?:bonjour|bonsoir|merci|cordialement|à bientôt|a bientot)\b/i,
  /\b(?:n['’ ]?hésitez pas|n hesitez pas|demander un devis|demandez votre devis|contactez[- ]?nous|contactez nous|écrivez[- ]?nous|ecrivez[- ]?nous|voir le site|voir les informations|en savoir plus|un conseil utile|une actualité|une actualite|notre objectif|nous sommes ravis|nous accompagnons|découvrez|decouvrez|profitez de)\b/i,
  /\b(?:votre|vos|notre|nos)\s+(?:projet|besoin|actualité|actualite|activité|activite|devis|message|rendez[- ]?vous|service|solution)\b/i,
  /\b(?:nous|vous)\s+(?:proposons|accompagnons|conseillons|attendons|invitons|aidons|sommes)\b/i,
];

const CLEAR_FRENCH_TOKENS = new Set([
  "actualité",
  "actualités",
  "aiderons",
  "appelez",
  "besoin",
  "besoins",
  "bienêtre",
  "bien-etre",
  "cordialement",
  "devis",
  "découvrez",
  "demandez",
  "écrivez",
  "ecrivez",
  "n'hésitez",
  "nhésitez",
  "prestation",
  "prestations",
  "proposons",
  "rendezvous",
  "rendez-vous",
  "sérénité",
  "souhaitez",
  "votre",
  "voulez",
]);

function normalizeLanguageDetectionToken(value: string) {
  return normalizeIdeaToken(value).replace(/-/g, "");
}

function countRegexMatches(pattern: RegExp, text: string) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const globalPattern = new RegExp(pattern.source, flags);
  return Array.from(text.matchAll(globalPattern)).length;
}

function countClearFrenchTokenHints(text: string) {
  const tokens = (text.match(/[A-Za-zÀ-ÖØ-öø-ÿ0-9'-]+/g) || [])
    .map(normalizeLanguageDetectionToken)
    .filter(Boolean);
  return tokens.reduce((count, token) => count + (CLEAR_FRENCH_TOKENS.has(token) ? 1 : 0), 0);
}

function countClearFrenchLeakMatches(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  return CLEAR_FRENCH_PHRASE_PATTERNS.reduce((count, pattern) => count + countRegexMatches(pattern, text), 0) + countClearFrenchTokenHints(text);
}

function hasClearFrenchLeak(value: unknown, minMatches = 1) {
  return countClearFrenchLeakMatches(value) >= minMatches;
}

function hasLanguageMismatch(languageCode: string, post: ChannelPost | undefined) {
  if (languageCode === "fr" || !post) return false;

  const titleLeak = hasClearFrenchLeak(post.title, 1);
  const ctaLeak = hasClearFrenchLeak(post.cta, 1);
  const contentLeak = hasClearFrenchLeak(post.content, 2);
  const hashtagLeak = Array.isArray(post.hashtags) && post.hashtags.some((tag) => hasClearFrenchLeak(tag, 1));

  return titleLeak || ctaLeak || contentLeak || hashtagLeak;
}

function buildLanguageRetryInstructions(languageCode: string, channels: BoosterChannels[]) {
  if (languageCode === "fr" || !channels.length) return "";
  const languageLabel = getAiLanguageLabel({ ai_language: languageCode });
  return [
    `ERREUR LANGUE À CORRIGER : les canaux suivants contiennent encore du français ou des formulations françaises : ${channels.map((channel) => CHANNEL_LABELS[channel]).join(", ")}.`,
    `Regénère ces canaux exclusivement en ${languageLabel}.`,
    `Vérifie particulièrement les champs title et cta : ils doivent être en ${languageLabel}, pas en français.`,
    `Ne conserve pas les libellés français "Demander un devis", "Contactez-nous", "Voir le site", "En savoir plus", "Un conseil utile", "Découvrez" ou équivalents français.`,
  ].join("\n");
}

function getCreativityTemperature(business: JsonRecord | null) {
  const creativity = String(business?.ai_creativity || "balanced");
  if (["stable", "classic", "classique"].includes(creativity)) return 0.58;
  if (["creative", "creatif", "créative"].includes(creativity)) return 1.02;
  return 0.84;
}

function computeMaxOutputTokens(channels: BoosterChannels[]) {
  const uniqueChannels = Array.from(new Set(channels));
  const budget = uniqueChannels.reduce(
    (sum, channel) => sum + CHANNEL_OUTPUT_TOKEN_BUDGET[channel],
    850,
  );

  // YouTube est isolé dans son propre lot. Avec certains modèles Responses API,
  // max_output_tokens couvre aussi les tokens de raisonnement : l'ancien plancher
  // effectif (~2950) pouvait produire un HTTP 200 mais aucune sortie JSON exploitable.
  // On réserve donc une vraie marge à la génération SEO YouTube.
  const minimum = uniqueChannels.includes("youtube_shorts") ? 6200 : 2800;
  return Math.min(8000, Math.max(minimum, budget));
}

function buildGenerationBatches(channels: BoosterChannels[]) {
  const uniqueChannels = allowedChannels.filter((channel) => channels.includes(channel));
  const sites = uniqueChannels.filter((channel) => siteChannels.has(channel));
  const youtubeRequested = uniqueChannels.includes("youtube_shorts");
  const socials = uniqueChannels.filter(
    (channel) => !siteChannels.has(channel) && channel !== "youtube_shorts",
  );
  const batches: Array<{ channels: BoosterChannels[]; extraInstructions?: string }> = [];

  if (sites.length) {
    batches.push({
      channels: sites,
      extraInstructions:
        sites.length === 2
          ? `Les deux canaux site sont demandés. Produis deux contenus complets, propres et distincts :\n- Site iNrCy : variante plus vitrine/conversion, claire et rassurante.\n- Site web : variante plus SEO durable, crédible et fluide.\nNe copie-colle jamais le même texte. Varie titre, accroche, ordre des idées et formulations, sans inventer de ville, zone ou prestation.`
          : `Un seul canal site est demandé. Produis un contenu site complet et qualitatif, avec une vraie valeur SEO locale, sans l'écourter parce qu'il n'y a qu'un canal.`,
    });
  }

  for (let index = 0; index < socials.length; index += CHANNEL_BATCH_SIZE) {
    batches.push({ channels: socials.slice(index, index + CHANNEL_BATCH_SIZE) });
  }

  // YouTube est volontairement isolé : sa description est plus longue, SEO et structurée.
  // Le mélanger avec LinkedIn/TikTok augmentait les réponses tronquées ou trop courtes,
  // puis déclenchait inutilement les récupérations IA et parfois une erreur globale.
  if (youtubeRequested) {
    batches.push({
      channels: ["youtube_shorts"],
      extraInstructions:
        `YOUTUBE PRIORITAIRE : pars directement de la phrase libre du pro et produis un titre + une vraie description SEO finale. Le texte doit parler du sujet réel de la vidéo, jamais expliquer comment écrire une description.`,
    });
  }

  return batches;
}

async function generateVersions(args: {
  idea: string;
  theme: BoosterTheme;
  style: BoosterStyle;
  channels: BoosterChannels[];
  profile: JsonRecord | null;
  business: JsonRecord | null;
  recentPublications?: BoosterRecentPublication[];
  extraInstructions?: string;
  hiddenAngle?: BoosterHiddenAngle;
  imagesForAI?: BoosterAiImage[];
  aiFeature: AiGenerationFeature;
  accountId?: string;
  budget?: AiOperationBudget;
}) {
  const languageInstructions = buildStrictLanguageGenerationInstructions(args.business);
  const imageInstructions = buildImageGenerationInstructions(args.imagesForAI?.length || 0);

  return aiGenerateJSON<BoosterGenResponse>({
    feature: args.aiFeature,
    accountId: args.accountId,
    budget: args.budget,
    engine: getAiPreferredEngineFromBusiness(args.business),
    system: boosterSystemPrompt(args.business),
    input: [
      boosterUserPrompt({
        idea: args.idea,
        theme: args.theme,
        style: args.style,
        channels: args.channels,
        profile: args.profile,
        business: args.business,
        hiddenAngle: args.hiddenAngle,
        recentPublications: args.recentPublications,
      }),
      languageInstructions,
      imageInstructions,
      `DIFFÉRENCIATION CANAUX : aucun copier-coller entre canaux. Adapte réellement la profondeur, le rythme, le vocabulaire et l'angle au support. Ne force toutefois pas des accroches, CTA ou structures artificiellement opposés : laisse chaque version trouver sa meilleure forme naturelle.`,
      args.extraInstructions,
    ]
      .filter(Boolean)
      .join("\n\n"),
    images: args.imagesForAI,
    maxOutputTokens: computeMaxOutputTokens(args.channels),
    temperature: getCreativityTemperature(args.business),
    // YouTube dispose d'une marge dédiée : certains modèles Responses API
    // consomment une partie du budget en raisonnement avant d'émettre le JSON final.
    timeoutMs: args.channels.includes("youtube_shorts")
      ? args.imagesForAI?.length
        ? 72_000
        : 58_000
      : args.imagesForAI?.length
        ? 48_000
        : 38_000,
    retries: 1,
  });
}

async function generateVersionsForChannels(args: {
  idea: string;
  theme: BoosterTheme;
  style: BoosterStyle;
  channels: BoosterChannels[];
  profile: JsonRecord | null;
  business: JsonRecord | null;
  recentPublications?: BoosterRecentPublication[];
  extraInstructions?: string;
  hiddenAngle?: BoosterHiddenAngle;
  imagesForAI?: BoosterAiImage[];
  aiFeature: AiGenerationFeature;
  accountId?: string;
  budget?: AiOperationBudget;
}) {
  const versions: Partial<Record<BoosterChannels, Partial<ChannelPost>>> = {};
  const batches = buildGenerationBatches(args.channels);

  for (const batch of batches) {
    try {
      const out = await generateVersions({
        ...args,
        channels: batch.channels,
        extraInstructions: [batch.extraInstructions, args.extraInstructions]
          .filter(Boolean)
          .join("\n\n"),
      });

      for (const channel of batch.channels) {
        const candidate = extractGeneratedChannelVersion(out, channel);
        if (candidate) versions[channel] = candidate;
      }
    } catch {
      for (const channel of batch.channels) {
        try {
          const singleOut = await generateVersions({
            ...args,
            channels: [channel],
            extraInstructions: [
              batch.extraInstructions,
              args.extraInstructions,
              `REPRISE CANAL UNIQUE : génère uniquement ${CHANNEL_LABELS[channel]}. Respecte strictement la langue IA configurée et retourne un JSON complet pour ce canal.`,
            ]
              .filter(Boolean)
              .join("\n\n"),
          });
          const candidate = extractGeneratedChannelVersion(singleOut, channel);
          if (candidate) versions[channel] = candidate;
        } catch {
          continue;
        }
      }
    }
  }

  return { versions };
}

function isGeneratedPostSafe(args: {
  channel: BoosterChannels;
  post: ChannelPost | undefined;
  languageCode: string;
}) {
  return Boolean(
    hasCorePublishableContent(args.channel, args.post) &&
      !hasLanguageMismatch(args.languageCode, args.post) &&
      !hasEditorialMetaLeak(args.post),
  );
}

function isGeneratedPostAcceptable(args: {
  channel: BoosterChannels;
  post: ChannelPost | undefined;
  ideaKeywords: string[];
  languageCode: string;
}) {
  return Boolean(
    hasRequiredContent(args.channel, args.post) &&
      isPostAnchoredToIdea(args.ideaKeywords, args.post) &&
      isGeneratedPostSafe({
        channel: args.channel,
        post: args.post,
        languageCode: args.languageCode,
      }),
  );
}

function buildFocusedRecoveryInstructions(args: {
  channel: BoosterChannels;
  idea: string;
  attempt: number;
  otherVersions: Partial<Record<BoosterChannels, ChannelPost>>;
}) {
  const otherSnippets = Object.entries(args.otherVersions)
    .filter(([channel, post]) => channel !== args.channel && Boolean(post?.content?.trim()))
    .slice(0, 4)
    .map(([channel, post]) => {
      const typedChannel = channel as BoosterChannels;
      const excerpt = String(post?.content || "").replace(/\s+/g, " ").trim().slice(0, 220);
      return `- ${CHANNEL_LABELS[typedChannel]} : ${excerpt}`;
    })
    .join("\n");

  const youtubeRules = args.channel === "youtube_shorts"
    ? [
        `YOUTUBE — exigence prioritaire : écris une VRAIE description SEO prête à publier à propos de \"${args.idea}\".`,
        `Commence par parler concrètement du sujet de la vidéo, de la réalisation, du conseil, de l'actualité ou de l'offre demandée.`,
        `Intègre naturellement au moins un terme significatif de la phrase libre et les éléments métier/localité uniquement s'ils sont fournis.`,
        `Ne parle jamais de la manière de rédiger : interdiction de phrases comme \"la description doit…\", \"cette publication peut…\", \"ce contenu sert à…\".`,
        `Le spectateur doit lire un contenu utile sur le sujet réel, pas des instructions éditoriales.`,
      ].join("\n")
    : "";

  return [
    `RÉCUPÉRATION QUALITÉ IA — tentative ${args.attempt + 1}.`,
    `Génère uniquement ${CHANNEL_LABELS[args.channel]} et retourne le texte FINAL PRÊT À PUBLIER.`,
    `Sujet obligatoire : \"${args.idea}\". Reste centré sur cette phrase libre et reformule naturellement sans changer de sujet.`,
    `Ne donne aucune consigne de rédaction, aucun commentaire technique et aucune phrase méta sur \"la description\", \"le contenu\", \"le message\" ou \"la publication\".`,
    `title et content doivent être remplis. La clé cta peut rester vide si un CTA séparé serait artificiel. Le contenu doit rester substantiel et adapté au canal.`,
    `Le résultat doit être intéressant, concret, humain et spécifique au sujet, pas générique.`,
    youtubeRules,
    otherSnippets
      ? `Évite de reprendre la structure ou les formulations déjà utilisées sur les autres canaux :\n${otherSnippets}`
      : "",
  ].filter(Boolean).join("\n\n");
}


function buildCompactYoutubeContext(
  profile: JsonRecord | null,
  business: JsonRecord | null,
) {
  const source = { ...(profile || {}), ...(business || {}) } as JsonRecord;
  const keys = [
    "company_name",
    "business_name",
    "name",
    "city",
    "postal_code",
    "sector",
    "sector_category",
    "profession",
    "job",
    "business_description",
    "activity_description",
    "description",
    "services",
    "intervention_zones",
    "strengths",
    "customer_typologies",
    "ai_tone",
    "ai_pronoun",
    "ai_audience_relation",
    "ai_emoji_level",
    "ai_content_length",
    "ai_cta_preference",
  ];
  const context: JsonRecord = {};
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      context[key] = value.trim().slice(0, 700);
    } else if (Array.isArray(value) && value.length) {
      context[key] = value.slice(0, 12);
    }
  }
  return JSON.stringify(context, null, 2).slice(0, 6500);
}

function isMeaningfulYoutubeCandidate(
  post: ChannelPost | undefined,
  languageCode: string,
) {
  if (!post) return false;
  return Boolean(
    post.title.trim().length >= 8 &&
      post.content.trim().length >= 140 &&
      !hasLanguageMismatch(languageCode, post) &&
      !hasEditorialMetaLeak(post),
  );
}

async function rescueYoutubeWithDedicatedAi(args: {
  idea: string;
  theme: BoosterTheme;
  style: BoosterStyle;
  profile: JsonRecord | null;
  business: JsonRecord | null;
  imagesForAI?: BoosterAiImage[];
  extraInstructions?: string;
  languageCode: string;
  ideaKeywords: string[];
  aiFeature: AiGenerationFeature;
  accountId?: string;
  budget?: AiOperationBudget;
}) {
  const languageLabel = getAiLanguageLabel({ ai_language: args.languageCode });
  const businessContext = buildCompactYoutubeContext(args.profile, args.business);
  const preferredEngine = getAiPreferredEngineFromBusiness(args.business);
  const creativeFreedomRules = buildAiWritingProfileRules(args.business, preferredEngine);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const out = await aiGenerateJSON<JsonRecord>({
        feature: args.aiFeature === "agent.publish" ? "agent.publish" : "booster.youtube-rescue",
        accountId: args.accountId,
        budget: args.budget,
        engine: preferredEngine,
        system: [
          `Tu es un rédacteur YouTube professionnel pour une entreprise locale.`,
          `Écris exclusivement le contenu FINAL destiné au public, en ${languageLabel}.`,
          `Ne donne jamais de consigne de rédaction et ne commente jamais la description, le contenu, le message ou la publication.`,
          `Réponds uniquement en JSON strict avec les clés title, content, cta, hashtags.`,
          creativeFreedomRules,
        ].join("\n"),
        input: [
          `SUJET LIBRE PRIORITAIRE : "${args.idea}"`,
          `Thème : ${args.theme || "information"}`,
          `Style : ${args.style}`,
          businessContext
            ? `Contexte réel de l'activité (utiliser seulement ce qui est utile, ne rien inventer) :\n${businessContext}`
            : "",
          args.extraInstructions
            ? `Contexte média disponible :\n${args.extraInstructions.slice(0, 4500)}`
            : "",
          `MISSION YOUTUBE :`,
          `- Crée un titre naturel de 45 à 90 caractères, directement lié au sujet libre.`,
          `- Crée une vraie description SEO YouTube de 500 à 1200 caractères, intéressante, concrète et prête à publier.`,
          `- Commence par le sujet réel de la vidéo. Développe ce qui a été réalisé, présenté, conseillé ou annoncé selon la phrase libre.`,
          `- Intègre naturellement les mots importants du sujet, puis le métier et la localité uniquement s'ils sont réellement fournis.`,
          `- CTA et hashtags sont facultatifs : ajoute-les seulement s'ils améliorent réellement la description.`,
          `- Interdiction absolue d'écrire des phrases méta comme "la description doit", "cette publication peut", "ce contenu sert à", ou d'expliquer comment rédiger.`,
          `- N'invente aucun client, résultat, prix, lieu, marque, date, personne ou détail technique absent du contexte.`,
          `JSON attendu exactement : {"title":"...","content":"...","cta":"...","hashtags":["..."]}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
        images: attempt === 0 ? args.imagesForAI?.slice(0, 3) : undefined,
        maxOutputTokens: attempt === 0 ? 7000 : 8000,
        temperature: getCreativityTemperature(args.business),
        timeoutMs: attempt === 0 && args.imagesForAI?.length ? 72_000 : 58_000,
        retries: 1,
      });

      const candidate = normalizePost(
        "youtube_shorts",
        coerceGeneratedPost(out) ||
          extractGeneratedChannelVersion(out, "youtube_shorts"),
      );

      const meaningfulYoutubeCandidate = isMeaningfulYoutubeCandidate(
        candidate,
        args.languageCode,
      );
      const anchoredYoutubeCandidate = isPostAnchoredToIdea(
        args.ideaKeywords,
        candidate,
      );

      if (
        isGeneratedPostAcceptable({
          channel: "youtube_shorts",
          post: candidate,
          ideaKeywords: args.ideaKeywords,
          languageCode: args.languageCode,
        }) ||
        (meaningfulYoutubeCandidate && anchoredYoutubeCandidate) ||
        // La deuxième passe est déjà une mission YouTube ultra ciblée sur le sujet libre.
        // Ne pas jeter un bon texte uniquement parce qu'il emploie des synonymes au lieu
        // de répéter littéralement un mot-clé de l'intention.
        (attempt > 0 && meaningfulYoutubeCandidate)
      ) {
        return candidate;
      }
    } catch {
      // Deuxième passe : texte seul et prompt réduit, pour ne pas dépendre de la vision.
    }
  }

  return null;
}

async function recoverChannelsWithAi(args: {
  channels: BoosterChannels[];
  versions: Partial<Record<BoosterChannels, ChannelPost>>;
  idea: string;
  theme: BoosterTheme;
  style: BoosterStyle;
  profile: JsonRecord | null;
  business: JsonRecord | null;
  recentPublications?: BoosterRecentPublication[];
  hiddenAngle?: BoosterHiddenAngle;
  imagesForAI?: BoosterAiImage[];
  extraInstructions?: string;
  ideaKeywords: string[];
  languageCode: string;
  aiFeature: AiGenerationFeature;
  accountId?: string;
  budget?: AiOperationBudget;
}) {
  const recovered = new Set<BoosterChannels>();

  for (const channel of Array.from(new Set(args.channels))) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const out = await generateVersions({
          idea: args.idea,
          theme: args.theme,
          style: args.style,
          channels: [channel],
          profile: args.profile,
          business: args.business,
          recentPublications: args.recentPublications,
          hiddenAngle: args.hiddenAngle,
          // Une seconde tentative textuelle n'a pas besoin de renvoyer toutes les images/frames :
          // la phrase libre reste prioritaire et on évite des appels vision lents ou fragiles.
          imagesForAI: attempt === 0 ? args.imagesForAI : undefined,
          aiFeature: args.aiFeature,
          accountId: args.accountId,
          budget: args.budget,
          extraInstructions: [
            args.extraInstructions,
            buildFocusedRecoveryInstructions({
              channel,
              idea: args.idea,
              attempt,
              otherVersions: args.versions,
            }),
          ].filter(Boolean).join("\n\n"),
        });
        const candidate = normalizePost(
          channel,
          extractGeneratedChannelVersion(out, channel),
        );
        const strictAccept = isGeneratedPostAcceptable({
          channel,
          post: candidate,
          ideaKeywords: args.ideaKeywords,
          languageCode: args.languageCode,
        });
        // Étape 6 ter hotfix : après une première reprise strictement ancrée,
        // la seconde passe peut être acceptée dès qu'elle est techniquement publiable.
        // Le prompt de reprise contient déjà le sujet libre mot pour mot ; exiger encore
        // un mot-clé exact rejetait de bonnes reformulations créatives avec synonymes.
        const safeRecoveryAccept =
          attempt > 0 &&
          isGeneratedPostSafe({
            channel,
            post: candidate,
            languageCode: args.languageCode,
          });

        if (strictAccept || safeRecoveryAccept) {
          args.versions[channel] = candidate;
          recovered.add(channel);
          break;
        }
      } catch {
        // On retente une fois avec une instruction encore plus ciblée.
      }
    }
  }

  return Array.from(recovered);
}

export async function generateSharedBoosterPosts(args: GenerateSharedBoosterPostsArgs): Promise<GenerateSharedBoosterPostsResult> {
  const aiFeature = args.aiFeature || "booster.publish";
  const budget = createAiOperationBudget(aiFeature);
  const style = args.style || "equilibre";
  const languageCode = normalizeAiLanguage(args.business?.ai_language);
  const channels = Array.from(new Set(args.channels)).filter((channel): channel is BoosterChannels => allowedChannels.includes(channel));
  const ideaKeywords = extractIdeaKeywords(args.idea);
  const recoveredChannels = new Set<BoosterChannels>();

  let rawVersions: Partial<Record<BoosterChannels, Partial<ChannelPost>>> = {};
  try {
    const out = await generateVersionsForChannels({
      idea: args.idea,
      theme: args.theme,
      style,
      channels,
      profile: args.profile,
      business: args.business,
      recentPublications: args.recentPublications,
      hiddenAngle: args.hiddenAngle,
      imagesForAI: args.imagesForAI,
      extraInstructions: args.extraInstructions,
      aiFeature,
      accountId: args.accountId,
      budget,
    });
    rawVersions = out?.versions && typeof out.versions === "object" ? out.versions : {};
  } catch {
    rawVersions = {};
  }

  const safeVersions: Partial<Record<BoosterChannels, ChannelPost>> = {};
  for (const channel of channels) {
    safeVersions[channel] = normalizePost(channel, rawVersions[channel]);
  }

  const missingChannels = channels.filter((channel) => !hasCorePublishableContent(channel, safeVersions[channel]));
  const offTopicChannels = channels.filter(
    (channel) => hasCorePublishableContent(channel, safeVersions[channel]) && !isPostAnchoredToIdea(ideaKeywords, safeVersions[channel]),
  );
  const metaLeakChannels = channels.filter((channel) => hasEditorialMetaLeak(safeVersions[channel]));
  const overSimilarChannels = findOverSimilarChannels(channels, safeVersions);
  const languageMismatchChannels = channels.filter((channel) => hasLanguageMismatch(languageCode, safeVersions[channel]));
  const retryChannels = Array.from(
    new Set([
      ...missingChannels,
      ...offTopicChannels,
      ...metaLeakChannels,
      ...overSimilarChannels,
      ...languageMismatchChannels,
    ]),
  );

  const standardRetryChannels = retryChannels.filter(
    (channel) => channel !== "youtube_shorts",
  );

  if (standardRetryChannels.length) {
    try {
      const retryOut = await generateVersionsForChannels({
        idea: args.idea,
        theme: args.theme,
        style,
        channels: standardRetryChannels,
        profile: args.profile,
        business: args.business,
        recentPublications: args.recentPublications,
        hiddenAngle: args.hiddenAngle,
        imagesForAI: args.imagesForAI,
        aiFeature,
        accountId: args.accountId,
        budget,
        extraInstructions: [
          args.extraInstructions,
          `IMPORTANT : regénère uniquement les canaux demandés ci-dessus.`,
          `Le contenu précédent était vide/cassé, vraiment trop court, quasi copié d'un autre canal, hors sujet, dans la mauvaise langue ou contenait du texte méta/technique non publiable.`,
          overSimilarChannels.length
            ? `Canaux à différencier fortement : ${overSimilarChannels.map((channel) => CHANNEL_LABELS[channel]).join(", ")}.`
            : "",
          metaLeakChannels.length
            ? `Canaux ayant produit des consignes éditoriales visibles au lieu du contenu final : ${metaLeakChannels.map((channel) => CHANNEL_LABELS[channel]).join(", ")}. Interdiction absolue de recommencer.`
            : "",
          buildLanguageRetryInstructions(languageCode, languageMismatchChannels),
          `Sujet obligatoire à respecter : "${args.idea}".`,
          `Écris uniquement le contenu FINAL prêt à publier. Ne dis jamais ce que la description, le texte, le message ou la publication doit faire.`,
          `Chaque canal doit avoir une vraie adaptation : Site = SEO long, Google Business = local sobre, Facebook = humain, Instagram = visuel, LinkedIn = expertise, TikTok = court, YouTube = vraie description SEO du sujet, Pinterest = inspirant et recherchable.`,
          `Pour chaque canal, title et content doivent être non vides. La clé cta peut rester vide si un CTA séparé n'apporte rien.`,
          `Le content doit viser au minimum : Site iNrCy >= 900 caractères, Site web >= 1100, Google Business >= 450, Facebook >= 500, Instagram >= 350, LinkedIn >= 700, TikTok >= 180, YouTube >= 500, Pinterest >= 220.`,
          `Si Site iNrCy et Site web sont présents, ils doivent être deux variantes distinctes et non deux copies.`,
          `Respecte strictement la langue IA configurée.`,
        ].filter(Boolean).join("\n"),
      });
      for (const channel of standardRetryChannels) {
        const retriedPost = normalizePost(
          channel,
          extractGeneratedChannelVersion(retryOut, channel),
        );
        if (
          isGeneratedPostAcceptable({
            channel,
            post: retriedPost,
            ideaKeywords,
            languageCode,
          })
        ) {
          safeVersions[channel] = retriedPost;
          recoveredChannels.add(channel);
        }
      }
    } catch {
      // La récupération ciblée canal par canal ci-dessous prend le relais.
    }
  }

  let strictInvalidChannels = channels.filter(
    (channel) =>
      !isGeneratedPostAcceptable({
        channel,
        post: safeVersions[channel],
        ideaKeywords,
        languageCode,
      }),
  );
  let duplicateChannels = findOverSimilarChannels(channels, safeVersions);

  // Une seule récupération ciblée suffit : elle couvre les contenus manquants, réellement
  // trop courts, hors sujet, quasi copiés ou suspects. L'absence de CTA n'est plus un motif
  // de régénération : on préserve la voix native du moteur. YouTube reste isolé.
  const focusedRecoveryChannels = Array.from(
    new Set([...strictInvalidChannels, ...duplicateChannels]),
  ).filter((channel) => channel !== "youtube_shorts");
  if (focusedRecoveryChannels.length) {
    const aiRecovered = await recoverChannelsWithAi({
      channels: focusedRecoveryChannels,
      versions: safeVersions,
      idea: args.idea,
      theme: args.theme,
      style,
      profile: args.profile,
      business: args.business,
      recentPublications: args.recentPublications,
      hiddenAngle: args.hiddenAngle,
      imagesForAI: args.imagesForAI,
      extraInstructions: args.extraInstructions,
      ideaKeywords,
      languageCode,
      aiFeature,
      accountId: args.accountId,
      budget,
    });
    aiRecovered.forEach((channel) => recoveredChannels.add(channel));
  }

  strictInvalidChannels = channels.filter(
    (channel) =>
      !isGeneratedPostAcceptable({
        channel,
        post: safeVersions[channel],
        ideaKeywords,
        languageCode,
      }),
  );
  duplicateChannels = findOverSimilarChannels(channels, safeVersions);

  // Dernière reprise dédiée YouTube : prompt court, sortie JSON plate, budget élevé
  // et seconde tentative sans vision. Cette passe traite les HTTP 200 OpenAI dont
  // la forme JSON est exploitable mais ne respecte pas l'enveloppe multicanal.
  if (
    channels.includes("youtube_shorts") &&
    !isGeneratedPostAcceptable({
      channel: "youtube_shorts",
      post: safeVersions.youtube_shorts,
      ideaKeywords,
      languageCode,
    })
  ) {
    const rescuedYoutube = await rescueYoutubeWithDedicatedAi({
      idea: args.idea,
      theme: args.theme,
      style,
      profile: args.profile,
      business: args.business,
      imagesForAI: args.imagesForAI,
      extraInstructions: args.extraInstructions,
      languageCode,
      ideaKeywords,
      aiFeature,
      accountId: args.accountId,
      budget,
    });

    if (rescuedYoutube) {
      safeVersions.youtube_shorts = rescuedYoutube;
      recoveredChannels.add("youtube_shorts");
    }
  }

  // IMPORTANT UX : les contrôles "ancrage exact" et "anti-doublon"
  // sont des garde-fous de qualité, pas des raisons de jeter une vraie réponse IA.
  // Après les tentatives de récupération, on accepte un texte IA réellement publiable
  // même s'il reformule le sujet avec des synonymes, reste un peu plus court que la cible,
  // oublie le CTA séparé ou ressemble encore partiellement à un autre canal.
  // En revanche, un texte vide/cassé, dans la mauvaise langue ou contenant des consignes
  // techniques reste bloqué : jamais de contenu poubelle ni de fallback local visible.
  const unsafeChannels = channels.filter(
    (channel) =>
      !isGeneratedPostSafe({
        channel,
        post: safeVersions[channel],
        languageCode,
      }),
  );

  if (unsafeChannels.length) {
    console.error("[booster-generation] unsafe channels after recovery", {
      aiFeature,
      accountId: args.accountId || "",
      channels: unsafeChannels,
      diagnostics: unsafeChannels.map((channel) => ({
        channel,
        hasPost: Boolean(safeVersions[channel]),
        titleLength: safeVersions[channel]?.title?.trim().length || 0,
        contentLength: safeVersions[channel]?.content?.trim().length || 0,
        languageMismatch: hasLanguageMismatch(languageCode, safeVersions[channel]),
        editorialMetaLeak: hasEditorialMetaLeak(safeVersions[channel]),
      })),
    });
    throw new Error(
      `La génération IA n'a pas pu finaliser un contenu publiable pour ${unsafeChannels
        .map((channel) => CHANNEL_LABELS[channel])
        .join(", ")}. Merci de relancer la génération.`,
    );
  }

  // Ces listes restent volontairement non bloquantes après récupération. Elles servent
  // uniquement au raisonnement interne ; le contenu retourné vient toujours de l'IA.
  void strictInvalidChannels;
  void duplicateChannels;

  return {
    versions: safeVersions,
    recoveredChannels: Array.from(recoveredChannels),
  };
}

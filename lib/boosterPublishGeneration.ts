import { openaiGenerateJSON } from "@/lib/openaiClient";
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
import { getAiLanguageLabel, normalizeAiLanguage } from "@/lib/aiWritingProfile";
import {
  sanitizeBoosterSiteText,
  stripSiteTextFormatting,
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

const CHANNEL_MIN_CONTENT_LENGTH: Record<BoosterChannels, number> = {
  inrcy_site: 650,
  site_web: 800,
  gmb: 280,
  facebook: 300,
  instagram: 220,
  linkedin: 450,
  tiktok: 120,
  youtube_shorts: 280,
  pinterest: 160,
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
    content: (siteChannel ? sanitizeBoosterSiteText(content) : stripSiteTextFormatting(content)).slice(0, siteChannel ? 6000 : 2000),
    cta: stripSiteTextFormatting(raw?.cta || "").slice(0, 180),
    hashtags: cleanHashtags(channel, raw?.hashtags),
  };
}

function hasRequiredContent(channel: BoosterChannels, post: ChannelPost | undefined) {
  if (!post) return false;
  if (!post.title.trim() || !post.content.trim() || !post.cta.trim()) return false;
  const minContentLength = CHANNEL_MIN_CONTENT_LENGTH[channel] ?? 80;
  return post.content.trim().length >= minContentLength;
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
  const candidates = channels.filter((channel) => hasRequiredContent(channel, versions[channel]));

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

      if (exactSame || (jaccard >= 0.82 && lengthRatio >= 0.72)) {
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
  if (creativity === "stable") return 0.55;
  if (creativity === "creative") return 0.92;
  return 0.78;
}

function computeMaxOutputTokens(channels: BoosterChannels[]) {
  const uniqueChannels = Array.from(new Set(channels));
  const budget = uniqueChannels.reduce((sum, channel) => sum + CHANNEL_OUTPUT_TOKEN_BUDGET[channel], 850);
  return Math.min(7600, Math.max(2800, budget));
}

function buildGenerationBatches(channels: BoosterChannels[]) {
  const uniqueChannels = allowedChannels.filter((channel) => channels.includes(channel));
  const sites = uniqueChannels.filter((channel) => siteChannels.has(channel));
  const socials = uniqueChannels.filter((channel) => !siteChannels.has(channel));
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
}) {
  const languageInstructions = buildStrictLanguageGenerationInstructions(args.business);
  const imageInstructions = buildImageGenerationInstructions(args.imagesForAI?.length || 0);

  return openaiGenerateJSON<BoosterGenResponse>({
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
      `ANTI-DUPLICATION CANAUX : ne retourne jamais deux objets versions avec le même title ou le même content. Chaque canal doit être une vraie variante éditoriale : angle, accroche, ordre des idées, longueur et CTA différents. Les canaux demandés ne sont pas des copies adaptées seulement par le nom du canal.`,
      args.extraInstructions,
    ]
      .filter(Boolean)
      .join("\n\n"),
    images: args.imagesForAI,
    maxOutputTokens: computeMaxOutputTokens(args.channels),
    temperature: getCreativityTemperature(args.business),
    // 24 s était trop court dès qu'une vidéo, plusieurs images ou un canal long
    // (notamment YouTube / LinkedIn / sites) demandaient davantage de raisonnement.
    timeoutMs: args.imagesForAI?.length ? 48_000 : 38_000,
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
}) {
  const versions: Partial<Record<BoosterChannels, Partial<ChannelPost>>> = {};
  const batches = buildGenerationBatches(args.channels);

  for (const batch of batches) {
    try {
      const out = await generateVersions({
        ...args,
        channels: batch.channels,
        extraInstructions: [batch.extraInstructions, args.extraInstructions].filter(Boolean).join("\n\n"),
      });
      const rawVersions = out?.versions && typeof out.versions === "object" ? out.versions : {};
      for (const channel of batch.channels) {
        if (rawVersions[channel]) versions[channel] = rawVersions[channel];
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
          const singleVersions = singleOut?.versions && typeof singleOut.versions === "object" ? singleOut.versions : {};
          if (singleVersions[channel]) versions[channel] = singleVersions[channel];
        } catch {
          continue;
        }
      }
    }
  }

  return { versions };
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
      !hasLanguageMismatch(args.languageCode, args.post) &&
      !hasEditorialMetaLeak(args.post),
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
    `title, content et cta doivent être remplis. Le contenu doit respecter la longueur et le ton du canal définis dans le prompt système.`,
    `Le résultat doit être intéressant, concret, humain et spécifique au sujet, pas générique.`,
    youtubeRules,
    otherSnippets
      ? `Évite de reprendre la structure ou les formulations déjà utilisées sur les autres canaux :\n${otherSnippets}`
      : "",
  ].filter(Boolean).join("\n\n");
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
          imagesForAI: args.imagesForAI,
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
        const rawVersions = out?.versions && typeof out.versions === "object" ? out.versions : {};
        const candidate = normalizePost(channel, rawVersions[channel]);
        if (
          isGeneratedPostAcceptable({
            channel,
            post: candidate,
            ideaKeywords: args.ideaKeywords,
            languageCode: args.languageCode,
          })
        ) {
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
    });
    rawVersions = out?.versions && typeof out.versions === "object" ? out.versions : {};
  } catch {
    rawVersions = {};
  }

  const safeVersions: Partial<Record<BoosterChannels, ChannelPost>> = {};
  for (const channel of channels) {
    safeVersions[channel] = normalizePost(channel, rawVersions[channel]);
  }

  const missingChannels = channels.filter((channel) => !hasRequiredContent(channel, safeVersions[channel]));
  const offTopicChannels = channels.filter(
    (channel) => hasRequiredContent(channel, safeVersions[channel]) && !isPostAnchoredToIdea(ideaKeywords, safeVersions[channel]),
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

  if (retryChannels.length) {
    try {
      const retryOut = await generateVersionsForChannels({
        idea: args.idea,
        theme: args.theme,
        style,
        channels: retryChannels,
        profile: args.profile,
        business: args.business,
        recentPublications: args.recentPublications,
        hiddenAngle: args.hiddenAngle,
        imagesForAI: args.imagesForAI,
        extraInstructions: [
          args.extraInstructions,
          `IMPORTANT : regénère uniquement les canaux demandés ci-dessus.`,
          `Le contenu précédent était vide/trop court, trop proche d'un autre canal, trop éloigné du sujet, dans la mauvaise langue ou contenait du texte méta/technique non publiable.`,
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
          `Pour chaque canal, title, content et cta doivent être non vides.`,
          `Le content doit viser au minimum : Site iNrCy >= 900 caractères, Site web >= 1100, Google Business >= 450, Facebook >= 500, Instagram >= 350, LinkedIn >= 700, TikTok >= 180, YouTube >= 500, Pinterest >= 220.`,
          `Si Site iNrCy et Site web sont présents, ils doivent être deux variantes distinctes et non deux copies.`,
          `Respecte strictement la langue IA configurée.`,
        ].filter(Boolean).join("\n"),
      });
      const retryVersions = retryOut?.versions && typeof retryOut.versions === "object" ? retryOut.versions : {};
      for (const channel of retryChannels) {
        const retriedPost = normalizePost(channel, retryVersions[channel]);
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

  let invalidChannels = channels.filter(
    (channel) =>
      !isGeneratedPostAcceptable({
        channel,
        post: safeVersions[channel],
        ideaKeywords,
        languageCode,
      }),
  );
  let duplicateChannels = findOverSimilarChannels(channels, safeVersions);

  const focusedRecoveryChannels = Array.from(new Set([...invalidChannels, ...duplicateChannels]));
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
    });
    aiRecovered.forEach((channel) => recoveredChannels.add(channel));
  }

  invalidChannels = channels.filter(
    (channel) =>
      !isGeneratedPostAcceptable({
        channel,
        post: safeVersions[channel],
        ideaKeywords,
        languageCode,
      }),
  );
  duplicateChannels = findOverSimilarChannels(channels, safeVersions);

  // Une seconde passe IA ne cible que les doublons persistants. Aucun fallback local n'est injecté.
  if (duplicateChannels.length) {
    const aiRecovered = await recoverChannelsWithAi({
      channels: duplicateChannels,
      versions: safeVersions,
      idea: args.idea,
      theme: args.theme,
      style,
      profile: args.profile,
      business: args.business,
      recentPublications: args.recentPublications,
      hiddenAngle: args.hiddenAngle,
      imagesForAI: args.imagesForAI,
      extraInstructions: [
        args.extraInstructions,
        `ANTI-DUPLICATION STRICT : les variantes restantes sont encore trop proches. Change l'angle, l'accroche, l'ordre des idées, le vocabulaire et le CTA sans quitter le sujet.`,
      ].filter(Boolean).join("\n\n"),
      ideaKeywords,
      languageCode,
    });
    aiRecovered.forEach((channel) => recoveredChannels.add(channel));
  }

  invalidChannels = channels.filter(
    (channel) =>
      !isGeneratedPostAcceptable({
        channel,
        post: safeVersions[channel],
        ideaKeywords,
        languageCode,
      }),
  );
  duplicateChannels = findOverSimilarChannels(channels, safeVersions);

  if (invalidChannels.length || duplicateChannels.length) {
    const failedChannels = Array.from(new Set([...invalidChannels, ...duplicateChannels]));
    // Choix UX volontaire : mieux vaut signaler un échec IA que montrer ou publier un texte
    // générique/technique. Ceci vaut aussi pour iNrAgent : pas de publication automatique dégradée.
    throw new Error(
      `La génération IA n'a pas produit un contenu suffisamment qualitatif pour ${failedChannels
        .map((channel) => CHANNEL_LABELS[channel])
        .join(", ")}. Merci de relancer la génération.`,
    );
  }

  return {
    versions: safeVersions,
    recoveredChannels: Array.from(recoveredChannels),
  };
}

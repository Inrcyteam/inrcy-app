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
  inrcy_site: 1500,
  site_web: 1850,
  gmb: 900,
  facebook: 1000,
  instagram: 850,
  linkedin: 1350,
  tiktok: 650,
  youtube_shorts: 1500,
  pinterest: 650,
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
  const requiredMatches = ideaKeywords.length <= 2 ? 1 : 2;
  return matches.length >= requiredMatches;
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
  const budget = uniqueChannels.reduce((sum, channel) => sum + CHANNEL_OUTPUT_TOKEN_BUDGET[channel], 650);
  return Math.min(5600, Math.max(2200, budget));
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
    timeoutMs: 24_000,
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

function cleanFallbackText(value: unknown, maxLength = 220) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanFallbackList(value: unknown, maxItems = 5, maxItemLength = 70) {
  const rawItems = Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(/[,;\n]/)
        .map((item) => item.trim());
  return Array.from(new Set(rawItems.map((item) => cleanFallbackText(item, maxItemLength)).filter(Boolean))).slice(0, maxItems);
}

function getFallbackBusinessContext(profile: JsonRecord | null, business: JsonRecord | null) {
  const company = cleanFallbackText(profile?.company_legal_name || profile?.companyLegalName || "", 90);
  const city = cleanFallbackText(profile?.hq_city || profile?.hqCity || "", 70);
  const profession = cleanFallbackText(business?.profession_label || business?.profession || business?.job || "", 90);
  const activity = cleanFallbackText(
    business?.business_description || business?.activity_description || business?.company_description || business?.description || "",
    260,
  );
  const services = cleanFallbackList(business?.services || business?.services_text, 5);
  const zones = cleanFallbackList(business?.intervention_zones || business?.intervention_zones_text, 4);
  const preferredCta = cleanFallbackText(business?.preferred_cta || "", 60);
  return { company, city, profession, activity, services, zones, preferredCta };
}

function fallbackTitle(channel: BoosterChannels, idea: string) {
  const base = cleanFallbackText(idea, 58) || "Nouvelle actualité";
  if (channel === "tiktok") return base.slice(0, 70);
  if (channel === "youtube_shorts") return `${base} en vidéo`.slice(0, 90);
  if (siteChannels.has(channel)) return `${base} : l’essentiel`.slice(0, 90);
  return base.slice(0, 90);
}

function fallbackCta(channel: BoosterChannels, preferredCta: string) {
  if (channel === "gmb") return "Voir les informations";
  const preferredCtaLabels: Record<string, string> = {
    site: "Voir le site",
    devis: "Demander un devis",
    appeler: "Appeler",
    message: "Envoyer un message",
    custom: "En savoir plus",
  };
  if (preferredCta && preferredCta !== "none") return preferredCtaLabels[preferredCta] || preferredCta;
  if (channel === "youtube_shorts") return "Découvrez la suite";
  if (channel === "tiktok" || channel === "instagram") return "Écrivez-nous";
  return "Contactez-nous";
}

function fallbackHashtags(channel: BoosterChannels, context: ReturnType<typeof getFallbackBusinessContext>) {
  if (!["instagram", "tiktok", "youtube_shorts"].includes(channel)) return [];
  const raw = [context.profession, context.city, context.company, ...context.services.slice(0, 3)];
  return Array.from(
    new Set(
      raw
        .map((item) => normalizeIdeaToken(item).replace(/[^a-z0-9]/g, "").slice(0, 28))
        .filter((item) => item.length >= 3),
    ),
  ).slice(0, channel === "youtube_shorts" ? 5 : 6);
}

function ensureMinimumContentLength(channel: BoosterChannels, content: string) {
  const minLength = CHANNEL_MIN_CONTENT_LENGTH[channel] ?? 160;
  let out = content.trim();
  const safetyParagraphs = [
    "L’objectif est de transmettre un message clair, facile à comprendre et directement utile pour les personnes qui découvrent cette actualité.",
    "Le contenu peut ensuite être ajusté avec vos mots, vos visuels et les informations précises que vous souhaitez mettre en avant.",
    "Une communication efficace reste simple : un sujet lisible, une information concrète et un appel à l’action naturel.",
  ];
  let index = 0;
  while (out.length < minLength && index < safetyParagraphs.length) {
    out = `${out}\n\n${safetyParagraphs[index]}`.trim();
    index += 1;
  }
  return out;
}

function buildFallbackPost(args: {
  channel: BoosterChannels;
  idea: string;
  profile: JsonRecord | null;
  business: JsonRecord | null;
  mediaType: "images" | "video";
}): ChannelPost {
  const { channel, idea, profile, business, mediaType } = args;
  const context = getFallbackBusinessContext(profile, business);
  const title = fallbackTitle(channel, idea);
  const cta = fallbackCta(channel, context.preferredCta);
  const subject = cleanFallbackText(idea, 180) || "cette actualité";
  const companyLabel = context.company || "l’entreprise";
  const cityLabel = context.city ? ` à ${context.city}` : "";
  const professionLabel = context.profession ? ` dans votre activité de ${context.profession}` : "";
  const servicesLabel = context.services.length ? ` Les prestations à mettre en avant peuvent notamment concerner : ${context.services.slice(0, 4).join(", ")}.` : "";
  const zonesLabel = context.zones.length ? ` Les zones concernées peuvent être citées naturellement : ${context.zones.slice(0, 3).join(", ")}.` : "";
  const mediaLabel = mediaType === "video" ? "la vidéo" : "le visuel";

  let content = "";
  if (siteChannels.has(channel)) {
    const siteIntro = channel === "inrcy_site"
      ? `**${subject}** : une actualité à présenter clairement pour ${companyLabel}${cityLabel}.`
      : `Pour travailler un contenu durable autour de **${subject}**, ${companyLabel}${cityLabel} peut s’appuyer sur un message simple, concret et utile.`;
    content = [
      siteIntro,
      `Le but est de donner rapidement les bonnes informations au lecteur : ce qui est proposé, pourquoi c’est utile et comment passer à l’action.${professionLabel ? ` Cette communication s’inscrit${professionLabel}.` : ""}`,
      context.activity
        ? `Contexte de l’entreprise : ${context.activity}`
        : `Cette publication permet de renforcer la visibilité locale tout en gardant un ton professionnel, lisible et rassurant.`,
      `${servicesLabel}${zonesLabel}`.trim(),
      `Un bon contenu autour de ${subject} doit rester compréhensible en quelques secondes : une accroche nette, un message cohérent, ${mediaLabel} comme support et un appel à l’action sans surcharge.`,
      `L’objectif est de créer une publication exploitable sur le site, utile pour les visiteurs et cohérente avec l’image de ${companyLabel}.`,
    ].filter(Boolean).join("\n\n");
  } else if (channel === "gmb") {
    content = [
      `${companyLabel}${cityLabel} partage une information autour de ${subject}.`,
      `L’idée est de présenter un message clair, local et facile à comprendre, avec les informations essentielles pour les personnes qui recherchent une solution sérieuse.${servicesLabel}`,
      `Cette actualité peut être consultée pour mieux comprendre l’offre, le contexte et les prochaines étapes possibles.`,
    ].join("\n\n");
  } else if (channel === "linkedin") {
    content = [
      `${subject} est un bon support pour expliquer une démarche, une offre ou une nouveauté avec sérieux.`,
      `Pour ${companyLabel}${cityLabel}, l’enjeu est de garder un message professionnel : une accroche lisible, des informations concrètes et une présentation cohérente avec l’activité.${professionLabel ? ` Cela renforce aussi la crédibilité${professionLabel}.` : ""}`,
      `Un contenu efficace ne cherche pas à tout dire. Il met en avant l’essentiel, donne du contexte et facilite la prise de contact quand le besoin est réel.${servicesLabel}`,
    ].join("\n\n");
  } else if (channel === "facebook") {
    content = [
      `${subject} : voici une actualité que ${companyLabel}${cityLabel} peut partager avec sa communauté.`,
      `Le message doit rester simple, humain et direct : expliquer ce qui est proposé, montrer l’intérêt pour le client et donner envie d’en savoir plus sans en faire trop.${servicesLabel}`,
      `Avec ${mediaLabel}, la publication devient plus concrète et plus facile à comprendre au premier coup d’œil.`,
    ].join("\n\n");
  } else if (channel === "instagram") {
    content = [
      `${subject} ✨`,
      `Un message clair, un visuel propre et une idée facile à comprendre : c’est souvent ce qui fait la différence.`,
      `${companyLabel}${cityLabel} peut utiliser cette publication pour présenter l’essentiel, mettre en avant son univers et inviter les personnes intéressées à passer à l’action.${servicesLabel}`,
    ].join("\n\n");
  } else if (channel === "tiktok") {
    content = [
      `${subject} : un format court, clair et direct.`,
      `Avec ${mediaLabel}, l’idée est de capter l’attention rapidement, montrer l’essentiel et donner envie d’en savoir plus sur ${companyLabel}${cityLabel}.`,
    ].join("\n\n");
  } else {
    content = [
      `${subject} : une description YouTube claire pour présenter le sujet et donner du contexte.`,
      `${companyLabel}${cityLabel} peut utiliser cette publication pour expliquer l’objectif, mettre en avant les points importants et orienter les personnes intéressées vers la suite.${servicesLabel}`,
      `La description doit rester recherchable, naturelle et utile, sans surcharger le message.`,
    ].join("\n\n");
  }

  return normalizePost(channel, {
    title,
    content: ensureMinimumContentLength(channel, content),
    cta,
    hashtags: fallbackHashtags(channel, context),
  });
}

type LocalizedFallbackContext = {
  company: string;
  city: string;
  channel: BoosterChannels;
  mediaLabel: string;
};

type LocalizedChannelFallback = {
  title: string;
  content: (context: LocalizedFallbackContext) => string;
};

type LanguageFallbackCopy = {
  title: string;
  siteTitle: string;
  videoTitle: string;
  cta: string;
  gmbCta: string;
  quoteCta: string;
  siteCta: string;
  messageCta: string;
  imageLabel: string;
  videoLabel: string;
  defaultContent: (context: LocalizedFallbackContext) => string;
  fillers: string[];
  channels: Record<BoosterChannels, LocalizedChannelFallback>;
};

const LANGUAGE_FALLBACK_COPY: Record<string, LanguageFallbackCopy> = {
  en: {
    title: "Useful update for local communication",
    siteTitle: "Improve local communication",
    videoTitle: "Useful video for communication",
    cta: "Contact us",
    gmbCta: "View information",
    quoteCta: "Request a quote",
    siteCta: "Visit the website",
    messageCta: "Send a message",
    imageLabel: "visual",
    videoLabel: "video",
    defaultContent: ({ company, city }) => `${company}${city} shares a useful update to communicate clearly and support local visibility. The message remains simple, professional and easy to reuse on the selected channel.`,
    fillers: [
      "The message can be refined later with more precise details, images or a stronger call to action.",
      "The goal is to keep the information understandable, credible and adapted to the people discovering the business.",
      "This version remains ready to edit while preserving a clear angle for the selected channel.",
    ],
    channels: {
      inrcy_site: {
        title: "A clear update for the iNrCy site",
        content: ({ company, city }) => `${company}${city} can present this update as a clear local news item. The content should help visitors quickly understand the service, the value of the business and the next step to take. This version is written for a showcase page: structured, reassuring and easy to reuse with a stronger local SEO angle if more details are added.`,
      },
      site_web: {
        title: "Durable content for the website",
        content: ({ company, city }) => `On the website, ${company}${city} needs a more durable version. The goal is to explain the subject in a useful way, strengthen credibility and give search engines a clear context. This text can later be completed with services, service areas and specific customer information without becoming a copy of the iNrCy site version.`,
      },
      gmb: {
        title: "Clear local information",
        content: ({ company, city }) => `${company}${city} shares practical local information for people who want to understand the offer quickly. On Google Business, the message must stay direct, factual and reassuring: what is available, why it can help and how to take the next step without unnecessary wording.`,
      },
      facebook: {
        title: "A message for the local community",
        content: ({ company, city, mediaLabel }) => `On Facebook, ${company}${city} can use a warmer and more conversational message. The idea is to speak to the local community, explain the update in simple words and make the publication feel approachable. With a ${mediaLabel}, the post becomes more concrete and easier to understand at first glance.`,
      },
      instagram: {
        title: "A visual post to catch attention",
        content: ({ company, city, mediaLabel }) => `On Instagram, the publication should feel more visual, short and lively. ${company}${city} can highlight the atmosphere, the care given to the service and the immediate benefit for people discovering the business. The ${mediaLabel} carries the first impression, while the text stays direct and easy to read.`,
      },
      linkedin: {
        title: "A professional angle for LinkedIn",
        content: ({ company, city }) => `On LinkedIn, ${company}${city} should keep a more professional angle. The publication can explain the method, the seriousness behind the service and the way the business creates value for its customers. The tone remains useful, measured and credible, without turning the message into a generic advertisement.`,
      },
      tiktok: {
        title: "A direct idea for a short format",
        content: ({ company, city, mediaLabel }) => `For TikTok, the message must be quick, clear and easy to understand. ${company}${city} can focus on one simple idea, supported by the ${mediaLabel}, to grab attention in a few seconds and encourage people to discover more without a long explanation.`,
      },
      youtube_shorts: {
        title: "A useful description for YouTube",
        content: ({ company, city }) => `On YouTube, ${company}${city} needs a description that gives context and remains searchable. The text should explain the subject, mention the value of the content and guide viewers toward the next step. This version is more descriptive than TikTok and more practical for people who find the video later.`,
      },
      pinterest: {
        title: "An idea to save on Pinterest",
        content: ({ company, city, mediaLabel }) => `On Pinterest, ${company}${city} can turn the ${mediaLabel} into a useful idea people may want to save. The description should be clear, searchable and focused on the concrete benefit, with a natural invitation to discover more.`,
      },
    },
  },
  es: {
    title: "Una actualización útil para la comunicación local",
    siteTitle: "Mejore su comunicación local",
    videoTitle: "Un vídeo útil para su comunicación",
    cta: "Contáctenos",
    gmbCta: "Ver la información",
    quoteCta: "Solicitar un presupuesto",
    siteCta: "Visitar el sitio web",
    messageCta: "Enviar un mensaje",
    imageLabel: "visual",
    videoLabel: "vídeo",
    defaultContent: ({ company, city }) => `${company}${city} comparte una actualización útil para comunicar con claridad y reforzar su presencia local. El mensaje se mantiene sencillo, profesional y fácil de adaptar al canal seleccionado.`,
    fillers: [
      "Puede ajustarse después con detalles más precisos, imágenes o una llamada a la acción más directa.",
      "El objetivo es que la información sea comprensible, creíble y útil para las personas que descubren el negocio.",
      "Esta versión sigue siendo editable, pero conserva un ángulo claro para el canal seleccionado.",
    ],
    channels: {
      inrcy_site: {
        title: "Una noticia clara para el sitio iNrCy",
        content: ({ company, city }) => `${company}${city} puede presentar esta actualización como una noticia local clara. El contenido debe ayudar al visitante a entender rápidamente el servicio, el valor del negocio y el siguiente paso posible. Esta versión está pensada para una página de presentación: estructurada, tranquilizadora y fácil de reforzar con un enfoque SEO local si se añaden más detalles.`,
      },
      site_web: {
        title: "Contenido duradero para el sitio web",
        content: ({ company, city }) => `En el sitio web, ${company}${city} necesita una versión más duradera. El objetivo es explicar el tema de forma útil, reforzar la credibilidad y dar a los buscadores un contexto claro. Este texto puede completarse después con servicios, zonas de intervención e información específica sin copiar la versión del sitio iNrCy.`,
      },
      gmb: {
        title: "Información local clara y útil",
        content: ({ company, city }) => `${company}${city} comparte una información local práctica para quienes quieren entender la oferta rápidamente. En Google Business, el mensaje debe ser directo, factual y tranquilizador: qué está disponible, por qué puede ayudar y cuál es el siguiente paso, sin frases innecesarias.`,
      },
      facebook: {
        title: "Un mensaje cercano para la comunidad",
        content: ({ company, city, mediaLabel }) => `En Facebook, ${company}${city} puede usar un tono más cercano y conversacional. La idea es hablar a la comunidad local, explicar la actualización con palabras simples y hacer que la publicación resulte accesible. Con un ${mediaLabel}, el mensaje se vuelve más concreto y fácil de entender al primer vistazo.`,
      },
      instagram: {
        title: "Una publicación visual para captar la atención",
        content: ({ company, city, mediaLabel }) => `En Instagram, la publicación debe sentirse más visual, breve y viva. ${company}${city} puede destacar la atmósfera, el cuidado del servicio y el beneficio inmediato para quienes descubren el negocio. El ${mediaLabel} transmite la primera impresión; el texto acompaña con frases directas y fáciles de leer.`,
      },
      linkedin: {
        title: "Un enfoque profesional para LinkedIn",
        content: ({ company, city }) => `En LinkedIn, ${company}${city} debe conservar un enfoque más profesional. La publicación puede explicar el método, la seriedad del servicio y la manera en que el negocio aporta valor a sus clientes. El tono sigue siendo útil, medido y creíble, sin convertirse en una publicidad genérica.`,
      },
      tiktok: {
        title: "Una idea directa para un formato corto",
        content: ({ company, city, mediaLabel }) => `Para TikTok, el mensaje debe ir rápido, claro y al grano. ${company}${city} puede centrarse en una sola idea, apoyada por el ${mediaLabel}, para captar la atención en pocos segundos y dar ganas de descubrir más sin una explicación larga.`,
      },
      youtube_shorts: {
        title: "Una descripción útil para YouTube",
        content: ({ company, city }) => `En YouTube, ${company}${city} necesita una descripción que aporte contexto y sea fácil de encontrar. El texto debe explicar el tema, mencionar el valor del contenido y guiar al espectador hacia el siguiente paso. Esta versión es más descriptiva que TikTok y más práctica para quienes encuentran el vídeo más tarde.`,
      },
      pinterest: {
        title: "Una idea para guardar en Pinterest",
        content: ({ company, city, mediaLabel }) => `En Pinterest, ${company}${city} puede convertir el ${mediaLabel} en una idea útil para guardar. La descripción debe ser clara, fácil de encontrar y centrada en el beneficio concreto, con una invitación natural a descubrir más.`,
      },
    },
  },
  it: {
    title: "Un aggiornamento utile per la comunicazione locale",
    siteTitle: "Migliori la comunicazione locale",
    videoTitle: "Un video utile per la comunicazione",
    cta: "Contattaci",
    gmbCta: "Vedi le informazioni",
    quoteCta: "Richiedi un preventivo",
    siteCta: "Visita il sito web",
    messageCta: "Invia un messaggio",
    imageLabel: "contenuto visivo",
    videoLabel: "video",
    defaultContent: ({ company, city }) => `${company}${city} condivide un aggiornamento utile per comunicare con chiarezza e rafforzare la presenza locale. Il messaggio resta semplice, professionale e facile da adattare al canale selezionato.`,
    fillers: [
      "Può essere adattato in seguito con dettagli più precisi, immagini o un invito all'azione più diretto.",
      "L'obiettivo è mantenere le informazioni comprensibili, credibili e utili per chi scopre l'attività.",
      "Questa versione resta modificabile, ma conserva un angolo chiaro per il canale scelto.",
    ],
    channels: {
      inrcy_site: {
        title: "Una notizia chiara per il sito iNrCy",
        content: ({ company, city }) => `${company}${city} può presentare questo aggiornamento come una notizia locale chiara. Il contenuto deve aiutare il visitatore a capire rapidamente il servizio, il valore dell'attività e il passo successivo possibile. Questa versione è pensata per una pagina vetrina: strutturata, rassicurante e pronta per un approccio SEO locale più forte se vengono aggiunti altri dettagli.`,
      },
      site_web: {
        title: "Contenuto duraturo per il sito web",
        content: ({ company, city }) => `Sul sito web, ${company}${city} ha bisogno di una versione più duratura. L'obiettivo è spiegare il tema in modo utile, rafforzare la credibilità e dare ai motori di ricerca un contesto chiaro. Il testo può essere completato con servizi, zone e informazioni specifiche senza copiare la versione del sito iNrCy.`,
      },
      gmb: {
        title: "Informazione locale chiara",
        content: ({ company, city }) => `${company}${city} condivide un'informazione locale pratica per chi vuole capire rapidamente l'offerta. Su Google Business, il messaggio deve restare diretto, concreto e rassicurante: cosa è disponibile, perché può aiutare e qual è il passo successivo.`,
      },
      facebook: {
        title: "Un messaggio vicino alla comunità",
        content: ({ company, city, mediaLabel }) => `Su Facebook, ${company}${city} può usare un tono più vicino e conversazionale. L'idea è parlare alla comunità locale, spiegare l'aggiornamento con parole semplici e rendere la pubblicazione accessibile. Con un ${mediaLabel}, il messaggio diventa più concreto e immediato.`,
      },
      instagram: {
        title: "Un post visivo per attirare l'attenzione",
        content: ({ company, city, mediaLabel }) => `Su Instagram, la pubblicazione deve sembrare più visiva, breve e viva. ${company}${city} può valorizzare l'atmosfera, la cura del servizio e il beneficio immediato per chi scopre l'attività. Il ${mediaLabel} crea la prima impressione, mentre il testo resta diretto.`,
      },
      linkedin: {
        title: "Un taglio professionale per LinkedIn",
        content: ({ company, city }) => `Su LinkedIn, ${company}${city} deve mantenere un taglio più professionale. La pubblicazione può spiegare il metodo, la serietà del servizio e il modo in cui l'attività crea valore per i clienti. Il tono resta utile, misurato e credibile.`,
      },
      tiktok: {
        title: "Un'idea diretta per un formato breve",
        content: ({ company, city, mediaLabel }) => `Per TikTok, il messaggio deve essere rapido, chiaro e diretto. ${company}${city} può concentrarsi su una sola idea, sostenuta dal ${mediaLabel}, per catturare l'attenzione in pochi secondi e invitare a scoprire di più.`,
      },
      youtube_shorts: {
        title: "Una descrizione utile per YouTube",
        content: ({ company, city }) => `Su YouTube, ${company}${city} ha bisogno di una descrizione che dia contesto e resti ricercabile. Il testo deve spiegare il tema, indicare il valore del contenuto e guidare chi guarda verso il passo successivo.`,
      },
      pinterest: {
        title: "Un'idea da salvare su Pinterest",
        content: ({ company, city, mediaLabel }) => `Su Pinterest, ${company}${city} può trasformare il ${mediaLabel} in un'idea utile da salvare. La descrizione deve essere chiara, ricercabile e centrata sul beneficio concreto, con un invito naturale a scoprire di più.`,
      },
    },
  },
  de: {
    title: "Ein nützliches Update für lokale Kommunikation",
    siteTitle: "Lokale Kommunikation verbessern",
    videoTitle: "Ein hilfreiches Video für die Kommunikation",
    cta: "Kontakt aufnehmen",
    gmbCta: "Informationen ansehen",
    quoteCta: "Angebot anfragen",
    siteCta: "Website besuchen",
    messageCta: "Nachricht senden",
    imageLabel: "visuellen Inhalt",
    videoLabel: "Video",
    defaultContent: ({ company, city }) => `${company}${city} teilt ein nützliches Update, um klar zu kommunizieren und die lokale Präsenz zu stärken. Die Botschaft bleibt einfach, professionell und leicht an den ausgewählten Kanal anpassbar.`,
    fillers: [
      "Sie kann später mit genaueren Details, Bildern oder einem stärkeren Aufruf zum Handeln ergänzt werden.",
      "Ziel ist es, die Informationen verständlich, glaubwürdig und hilfreich für neue Interessenten zu halten.",
      "Diese Version bleibt bearbeitbar, behält aber einen klaren Blickwinkel für den gewählten Kanal.",
    ],
    channels: {
      inrcy_site: {
        title: "Ein klares Update für die iNrCy-Seite",
        content: ({ company, city }) => `${company}${city} kann dieses Update als klare lokale Neuigkeit präsentieren. Der Inhalt hilft Besuchern, das Angebot, den Nutzen und den nächsten Schritt schnell zu verstehen. Diese Version ist für eine Schaufensterseite gedacht: strukturiert, vertrauensbildend und später gut für lokales SEO erweiterbar.`,
      },
      site_web: {
        title: "Dauerhafter Inhalt für die Website",
        content: ({ company, city }) => `Auf der Website braucht ${company}${city} eine dauerhaft nutzbare Version. Sie erklärt das Thema hilfreicher, stärkt die Glaubwürdigkeit und gibt Suchmaschinen einen klaren Kontext. Der Text kann später mit Leistungen, Einsatzgebieten und konkreten Informationen ergänzt werden, ohne die iNrCy-Seite zu kopieren.`,
      },
      gmb: {
        title: "Klare lokale Information",
        content: ({ company, city }) => `${company}${city} teilt eine praktische lokale Information für Menschen, die das Angebot schnell verstehen möchten. Bei Google Business muss die Botschaft direkt, sachlich und vertrauenswürdig bleiben: was verfügbar ist, warum es helfen kann und welcher nächste Schritt möglich ist.`,
      },
      facebook: {
        title: "Eine Nachricht für die lokale Community",
        content: ({ company, city, mediaLabel }) => `Auf Facebook kann ${company}${city} einen näheren und gesprächigeren Ton verwenden. Die Veröffentlichung spricht die lokale Community an, erklärt das Update in einfachen Worten und wirkt zugänglich. Mit einem ${mediaLabel} wird die Botschaft konkreter und schneller verständlich.`,
      },
      instagram: {
        title: "Ein visueller Beitrag für mehr Aufmerksamkeit",
        content: ({ company, city, mediaLabel }) => `Auf Instagram sollte die Veröffentlichung visueller, kürzer und lebendiger wirken. ${company}${city} kann Atmosphäre, Sorgfalt und den unmittelbaren Nutzen hervorheben. Der ${mediaLabel} erzeugt den ersten Eindruck, während der Text direkt und leicht lesbar bleibt.`,
      },
      linkedin: {
        title: "Ein professioneller Blickwinkel für LinkedIn",
        content: ({ company, city }) => `Auf LinkedIn sollte ${company}${city} einen professionelleren Blickwinkel behalten. Die Veröffentlichung kann Methode, Seriosität und den Wert für Kunden erklären. Der Ton bleibt hilfreich, maßvoll und glaubwürdig, ohne wie eine generische Werbung zu wirken.`,
      },
      tiktok: {
        title: "Eine direkte Idee für ein kurzes Format",
        content: ({ company, city, mediaLabel }) => `Für TikTok muss die Botschaft schnell, klar und direkt sein. ${company}${city} kann sich auf eine einfache Idee konzentrieren, unterstützt durch den ${mediaLabel}, um in wenigen Sekunden Aufmerksamkeit zu gewinnen und Lust auf mehr zu machen.`,
      },
      youtube_shorts: {
        title: "Eine hilfreiche Beschreibung für YouTube",
        content: ({ company, city }) => `Auf YouTube braucht ${company}${city} eine Beschreibung, die Kontext bietet und auffindbar bleibt. Der Text erklärt das Thema, nennt den Nutzen des Inhalts und führt Zuschauer zum nächsten Schritt.`,
      },
      pinterest: {
        title: "Eine Idee zum Speichern auf Pinterest",
        content: ({ company, city, mediaLabel }) => `Auf Pinterest kann ${company}${city} den ${mediaLabel} in eine nützliche Idee zum Speichern verwandeln. Die Beschreibung bleibt klar, auffindbar und auf den konkreten Nutzen fokussiert.`,
      },
    },
  },
  nl: {
    title: "Een nuttige update voor lokale communicatie",
    siteTitle: "Verbeter lokale communicatie",
    videoTitle: "Een nuttige video voor communicatie",
    cta: "Neem contact op",
    gmbCta: "Informatie bekijken",
    quoteCta: "Offerte aanvragen",
    siteCta: "Website bekijken",
    messageCta: "Bericht sturen",
    imageLabel: "beeld",
    videoLabel: "video",
    defaultContent: ({ company, city }) => `${company}${city} deelt een nuttige update om helder te communiceren en de lokale zichtbaarheid te versterken. De boodschap blijft eenvoudig, professioneel en gemakkelijk aan te passen aan het gekozen kanaal.`,
    fillers: [
      "Ze kan later worden aangevuld met preciezere details, beelden of een sterkere oproep tot actie.",
      "Het doel is om de informatie begrijpelijk, geloofwaardig en nuttig te houden voor mensen die het bedrijf ontdekken.",
      "Deze versie blijft bewerkbaar, maar behoudt een duidelijke invalshoek voor het gekozen kanaal.",
    ],
    channels: {
      inrcy_site: {
        title: "Een duidelijke update voor de iNrCy-site",
        content: ({ company, city }) => `${company}${city} kan deze update presenteren als een duidelijk lokaal nieuwsbericht. De inhoud helpt bezoekers snel te begrijpen wat er wordt aangeboden, wat de waarde is en welke volgende stap mogelijk is. Deze versie is bedoeld voor een etalagepagina: gestructureerd, geruststellend en later te versterken met lokale SEO.`,
      },
      site_web: {
        title: "Duurzame inhoud voor de website",
        content: ({ company, city }) => `Op de website heeft ${company}${city} een duurzamere versie nodig. Het doel is om het onderwerp nuttig uit te leggen, geloofwaardigheid te versterken en zoekmachines een duidelijke context te geven. De tekst kan later worden aangevuld met diensten, regio's en specifieke informatie zonder de iNrCy-site te kopiëren.`,
      },
      gmb: {
        title: "Duidelijke lokale informatie",
        content: ({ company, city }) => `${company}${city} deelt praktische lokale informatie voor mensen die het aanbod snel willen begrijpen. Op Google Business moet de boodschap direct, feitelijk en betrouwbaar blijven: wat beschikbaar is, waarom het kan helpen en welke volgende stap mogelijk is.`,
      },
      facebook: {
        title: "Een bericht voor de lokale gemeenschap",
        content: ({ company, city, mediaLabel }) => `Op Facebook kan ${company}${city} een warmere en meer toegankelijke toon gebruiken. Het bericht spreekt de lokale gemeenschap aan, legt de update eenvoudig uit en voelt menselijk. Met een ${mediaLabel} wordt de boodschap concreter en sneller te begrijpen.`,
      },
      instagram: {
        title: "Een visuele post voor aandacht",
        content: ({ company, city, mediaLabel }) => `Op Instagram moet de publicatie visueler, korter en levendiger aanvoelen. ${company}${city} kan sfeer, zorg en het directe voordeel benadrukken. Het ${mediaLabel} draagt de eerste indruk, terwijl de tekst direct en makkelijk leesbaar blijft.`,
      },
      linkedin: {
        title: "Een professionele invalshoek voor LinkedIn",
        content: ({ company, city }) => `Op LinkedIn moet ${company}${city} een professionelere invalshoek behouden. De publicatie kan methode, ernst en klantwaarde uitleggen. De toon blijft nuttig, evenwichtig en geloofwaardig, zonder generieke reclame te worden.`,
      },
      tiktok: {
        title: "Een direct idee voor een kort formaat",
        content: ({ company, city, mediaLabel }) => `Voor TikTok moet de boodschap snel, helder en direct zijn. ${company}${city} kan focussen op één eenvoudige idee, ondersteund door de ${mediaLabel}, om in enkele seconden aandacht te trekken en nieuwsgierig te maken.`,
      },
      youtube_shorts: {
        title: "Een nuttige beschrijving voor YouTube",
        content: ({ company, city }) => `Op YouTube heeft ${company}${city} een beschrijving nodig die context geeft en vindbaar blijft. De tekst legt het onderwerp uit, benoemt de waarde van de inhoud en begeleidt kijkers naar de volgende stap.`,
      },
      pinterest: {
        title: "Een idee om op Pinterest te bewaren",
        content: ({ company, city, mediaLabel }) => `Op Pinterest kan ${company}${city} het ${mediaLabel} omzetten in een nuttig idee om te bewaren. De beschrijving blijft duidelijk, vindbaar en gericht op het concrete voordeel.`,
      },
    },
  },
  pt: {
    title: "Uma atualização útil para a comunicação local",
    siteTitle: "Melhore a comunicação local",
    videoTitle: "Um vídeo útil para a comunicação",
    cta: "Contacte-nos",
    gmbCta: "Ver informações",
    quoteCta: "Solicitar orçamento",
    siteCta: "Visitar o site",
    messageCta: "Enviar mensagem",
    imageLabel: "visual",
    videoLabel: "vídeo",
    defaultContent: ({ company, city }) => `${company}${city} partilha uma atualização útil para comunicar com clareza e reforçar a presença local. A mensagem mantém-se simples, profissional e fácil de adaptar ao canal selecionado.`,
    fillers: [
      "Pode ser ajustada depois com detalhes mais precisos, imagens ou uma chamada à ação mais direta.",
      "O objetivo é manter a informação compreensível, credível e útil para quem descobre a empresa.",
      "Esta versão continua editável, mas conserva um ângulo claro para o canal escolhido.",
    ],
    channels: {
      inrcy_site: {
        title: "Uma notícia clara para o site iNrCy",
        content: ({ company, city }) => `${company}${city} pode apresentar esta atualização como uma notícia local clara. O conteúdo deve ajudar o visitante a compreender rapidamente o serviço, o valor da empresa e o próximo passo possível. Esta versão foi pensada para uma página de apresentação: estruturada, tranquilizadora e pronta para um reforço de SEO local se forem adicionados mais detalhes.`,
      },
      site_web: {
        title: "Conteúdo duradouro para o site",
        content: ({ company, city }) => `No site, ${company}${city} precisa de uma versão mais duradoura. O objetivo é explicar o tema de forma útil, reforçar a credibilidade e dar aos motores de pesquisa um contexto claro. O texto pode ser completado depois com serviços, zonas de atuação e informações específicas sem copiar a versão do site iNrCy.`,
      },
      gmb: {
        title: "Informação local clara",
        content: ({ company, city }) => `${company}${city} partilha uma informação local prática para quem quer compreender rapidamente a oferta. No Google Business, a mensagem deve manter-se direta, factual e tranquilizadora: o que está disponível, porque pode ajudar e qual é o próximo passo.`,
      },
      facebook: {
        title: "Uma mensagem para a comunidade local",
        content: ({ company, city, mediaLabel }) => `No Facebook, ${company}${city} pode usar um tom mais próximo e conversacional. A ideia é falar com a comunidade local, explicar a atualização com palavras simples e tornar a publicação acessível. Com um ${mediaLabel}, a mensagem fica mais concreta e fácil de entender à primeira vista.`,
      },
      instagram: {
        title: "Uma publicação visual para captar atenção",
        content: ({ company, city, mediaLabel }) => `No Instagram, a publicação deve parecer mais visual, breve e viva. ${company}${city} pode destacar a atmosfera, o cuidado do serviço e o benefício imediato para quem descobre a empresa. O ${mediaLabel} transmite a primeira impressão; o texto acompanha com frases diretas.`,
      },
      linkedin: {
        title: "Um ângulo profissional para LinkedIn",
        content: ({ company, city }) => `No LinkedIn, ${company}${city} deve manter um ângulo mais profissional. A publicação pode explicar o método, a seriedade do serviço e a forma como a empresa cria valor para os clientes. O tom continua útil, medido e credível, sem se transformar em publicidade genérica.`,
      },
      tiktok: {
        title: "Uma ideia direta para formato curto",
        content: ({ company, city, mediaLabel }) => `Para TikTok, a mensagem deve ser rápida, clara e direta. ${company}${city} pode concentrar-se numa única ideia, apoiada pelo ${mediaLabel}, para captar a atenção em poucos segundos e dar vontade de saber mais.`,
      },
      youtube_shorts: {
        title: "Uma descrição útil para YouTube",
        content: ({ company, city }) => `No YouTube, ${company}${city} precisa de uma descrição que dê contexto e continue pesquisável. O texto deve explicar o tema, mencionar o valor do conteúdo e orientar o espectador para o próximo passo.`,
      },
      pinterest: {
        title: "Uma ideia para guardar no Pinterest",
        content: ({ company, city, mediaLabel }) => `No Pinterest, ${company}${city} pode transformar o ${mediaLabel} numa ideia útil para guardar. A descrição deve ser clara, pesquisável e centrada no benefício concreto.`,
      },
    },
  },
};

function getLocalizedFallbackCta(channel: BoosterChannels, languageCode: string, preferredCta: string) {
  const copy = LANGUAGE_FALLBACK_COPY[languageCode] || LANGUAGE_FALLBACK_COPY.en;
  if (channel === "gmb") return copy.gmbCta;
  if (preferredCta === "devis") return copy.quoteCta;
  if (preferredCta === "site") return copy.siteCta;
  if (preferredCta === "message") return copy.messageCta;
  if (channel === "tiktok" || channel === "instagram" || channel === "youtube_shorts" || channel === "pinterest") return copy.messageCta;
  return copy.cta;
}

function ensureMinimumLocalizedContentLength(channel: BoosterChannels, content: string, languageCode: string) {
  const minLength = CHANNEL_MIN_CONTENT_LENGTH[channel] ?? 160;
  let out = content.trim();
  const copy = LANGUAGE_FALLBACK_COPY[languageCode] || LANGUAGE_FALLBACK_COPY.en;
  let index = 0;
  while (out.length < minLength && copy.fillers.length && index < 8) {
    out = `${out}\n\n${copy.fillers[index % copy.fillers.length]}`.trim();
    index += 1;
  }
  return out || copy.defaultContent({ company: "iNrCy", city: "", channel, mediaLabel: copy.imageLabel });
}

function buildLocalizedFallbackPost(args: {
  channel: BoosterChannels;
  profile: JsonRecord | null;
  business: JsonRecord | null;
  mediaType: "images" | "video";
  languageCode: string;
}): ChannelPost {
  const context = getFallbackBusinessContext(args.profile, args.business);
  const copy = LANGUAGE_FALLBACK_COPY[args.languageCode] || LANGUAGE_FALLBACK_COPY.en;
  const company = context.company || "iNrCy";
  const city = context.city ? ` ${context.city}` : "";
  const mediaLabel = args.mediaType === "video" ? copy.videoLabel : copy.imageLabel;
  const channelFallback = copy.channels[args.channel];
  const fallbackContext = { company, city, channel: args.channel, mediaLabel };
  const baseTitle = channelFallback?.title || (args.channel === "youtube_shorts" || args.mediaType === "video"
    ? copy.videoTitle
    : siteChannels.has(args.channel)
      ? copy.siteTitle
      : copy.title);
  const content = channelFallback?.content(fallbackContext) || copy.defaultContent(fallbackContext);

  return normalizePost(args.channel, {
    title: baseTitle,
    content: ensureMinimumLocalizedContentLength(args.channel, content, args.languageCode),
    cta: getLocalizedFallbackCta(args.channel, args.languageCode, context.preferredCta),
    hashtags: [],
  });
}

function buildDistinctFallbackPost(args: {
  channel: BoosterChannels;
  idea: string;
  profile: JsonRecord | null;
  business: JsonRecord | null;
  mediaType: "images" | "video";
  languageCode: string;
}) {
  if (args.languageCode === "fr") {
    return buildFallbackPost({
      channel: args.channel,
      idea: args.idea,
      profile: args.profile,
      business: args.business,
      mediaType: args.mediaType,
    });
  }

  return buildLocalizedFallbackPost({
    channel: args.channel,
    profile: args.profile,
    business: args.business,
    mediaType: args.mediaType,
    languageCode: args.languageCode,
  });
}

function ensureDistinctGeneratedVersions(args: {
  channels: BoosterChannels[];
  versions: Partial<Record<BoosterChannels, ChannelPost>>;
  idea: string;
  profile: JsonRecord | null;
  business: JsonRecord | null;
  mediaType: "images" | "video";
  languageCode: string;
  allowLocalFallback: boolean;
}) {
  const recoveredChannels = new Set<BoosterChannels>();
  let duplicates = findOverSimilarChannels(args.channels, args.versions);

  for (let attempt = 0; attempt < 2 && duplicates.length; attempt += 1) {
    for (const channel of duplicates) {
      if (args.languageCode !== "fr" || args.allowLocalFallback) {
        args.versions[channel] = buildDistinctFallbackPost({
          channel,
          idea: args.idea,
          profile: args.profile,
          business: args.business,
          mediaType: args.mediaType,
          languageCode: args.languageCode,
        });
        recoveredChannels.add(channel);
      }
    }
    duplicates = findOverSimilarChannels(args.channels, args.versions).filter((channel) => !recoveredChannels.has(channel));
  }

  return Array.from(recoveredChannels);
}

function ensureCompleteGeneratedVersions(args: {
  channels: BoosterChannels[];
  versions: Partial<Record<BoosterChannels, ChannelPost>>;
  idea: string;
  profile: JsonRecord | null;
  business: JsonRecord | null;
  mediaType: "images" | "video";
  allowLocalFallback: boolean;
  languageCode: string;
}) {
  const recoveredChannels: BoosterChannels[] = [];
  for (const channel of args.channels) {
    const current = args.versions[channel];
    if (hasRequiredContent(channel, current) && !hasLanguageMismatch(args.languageCode, current)) continue;

    if (args.languageCode === "fr") {
      if (!args.allowLocalFallback) continue;
      args.versions[channel] = buildFallbackPost({ channel, idea: args.idea, profile: args.profile, business: args.business, mediaType: args.mediaType });
    } else {
      args.versions[channel] = buildLocalizedFallbackPost({
        channel,
        profile: args.profile,
        business: args.business,
        mediaType: args.mediaType,
        languageCode: args.languageCode,
      });
    }
    recoveredChannels.push(channel);
  }
  return recoveredChannels;
}

export async function generateSharedBoosterPosts(args: GenerateSharedBoosterPostsArgs): Promise<GenerateSharedBoosterPostsResult> {
  const style = args.style || "equilibre";
  const mediaType = args.mediaType || "images";
  const languageCode = normalizeAiLanguage(args.business?.ai_language);
  const allowLocalFallback = args.allowLocalFallback ?? languageCode === "fr";
  const channels = Array.from(new Set(args.channels)).filter((channel): channel is BoosterChannels => allowedChannels.includes(channel));
  const ideaKeywords = extractIdeaKeywords(args.idea);

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
  const offTopicChannels = channels.filter((channel) => hasRequiredContent(channel, safeVersions[channel]) && !isPostAnchoredToIdea(ideaKeywords, safeVersions[channel]));
  const overSimilarChannels = findOverSimilarChannels(channels, safeVersions);
  const languageMismatchChannels = channels.filter((channel) => hasLanguageMismatch(languageCode, safeVersions[channel]));
  const retryChannels = Array.from(new Set([...missingChannels, ...offTopicChannels, ...overSimilarChannels, ...languageMismatchChannels]));

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
          `Le contenu précédent était soit vide/trop court, soit trop proche d'un autre canal ou trop éloigné du sujet demandé.`,
          overSimilarChannels.length
            ? `Canaux à différencier fortement car trop proches d'autres variantes : ${overSimilarChannels.map((channel) => CHANNEL_LABELS[channel]).join(", ")}.`
            : "",
          buildLanguageRetryInstructions(languageCode, languageMismatchChannels),
          `Sujet obligatoire à respecter dans le fond : "${args.idea}".`,
          `Chaque canal doit avoir une vraie adaptation : Site = SEO long, Google Business = local sobre, Facebook = humain, Instagram = visuel, LinkedIn = expertise, TikTok = court, YouTube = description utile.`,
          `Pour chaque canal, title, content et cta doivent être non vides quand le canal le permet.`,
          `Le content doit viser au minimum : Site iNrCy >= 900 caractères, Site web >= 1100, Google Business >= 450, Facebook >= 500, Instagram >= 350, LinkedIn >= 700, TikTok >= 180, YouTube >= 500.`,
          `Si Site iNrCy et Site web sont présents, ils doivent être deux variantes distinctes et non deux copies.`,
          `Respecte strictement la langue IA configurée.`,
        ].filter(Boolean).join("\n"),
      });
      const retryVersions = retryOut?.versions && typeof retryOut.versions === "object" ? retryOut.versions : {};
      for (const channel of retryChannels) {
        const retriedPost = normalizePost(channel, retryVersions[channel]);
        if (
          hasRequiredContent(channel, retriedPost) &&
          isPostAnchoredToIdea(ideaKeywords, retriedPost) &&
          !hasLanguageMismatch(languageCode, retriedPost)
        ) {
          safeVersions[channel] = retriedPost;
        }
      }
    } catch {
      // Non bloquant ici : les routes appelantes décident ensuite si elles jettent une erreur ou non.
    }
  }

  const stillOffTopicChannels = channels.filter((channel) => hasRequiredContent(channel, safeVersions[channel]) && !isPostAnchoredToIdea(ideaKeywords, safeVersions[channel]));
  const stillOverSimilarChannels = findOverSimilarChannels(channels, safeVersions);
  const stillLanguageMismatchChannels = channels.filter((channel) => hasLanguageMismatch(languageCode, safeVersions[channel]));

  if (allowLocalFallback) {
    for (const channel of Array.from(new Set([...stillOffTopicChannels, ...stillOverSimilarChannels]))) {
      safeVersions[channel] = buildFallbackPost({
        channel,
        idea: args.idea,
        profile: args.profile,
        business: args.business,
        mediaType,
      });
    }
  }

  if (languageCode !== "fr") {
    for (const channel of stillLanguageMismatchChannels) {
      safeVersions[channel] = buildLocalizedFallbackPost({
        channel,
        profile: args.profile,
        business: args.business,
        mediaType,
        languageCode,
      });
    }
  }

  for (const channel of channels) {
    if (hasPublishableText(safeVersions[channel]) && !hasLanguageMismatch(languageCode, safeVersions[channel])) continue;
    if (languageCode !== "fr") {
      safeVersions[channel] = buildLocalizedFallbackPost({
        channel,
        profile: args.profile,
        business: args.business,
        mediaType,
        languageCode,
      });
      continue;
    }
    if (!allowLocalFallback && !args.forceNonBlocking) continue;
    safeVersions[channel] = buildFallbackPost({
      channel,
      idea: args.idea,
      profile: args.profile,
      business: args.business,
      mediaType,
    });
  }

  const recoveredChannels = ensureCompleteGeneratedVersions({
    channels,
    versions: safeVersions,
    idea: args.idea,
    profile: args.profile,
    business: args.business,
    mediaType,
    allowLocalFallback: allowLocalFallback || Boolean(args.forceNonBlocking),
    languageCode,
  });

  const deduplicatedChannels = ensureDistinctGeneratedVersions({
    channels,
    versions: safeVersions,
    idea: args.idea,
    profile: args.profile,
    business: args.business,
    mediaType,
    languageCode,
    allowLocalFallback: allowLocalFallback || Boolean(args.forceNonBlocking),
  });

  if (!args.forceNonBlocking && !allowLocalFallback) {
    const incompleteChannels = channels.filter((channel) => !hasRequiredContent(channel, safeVersions[channel]) || hasLanguageMismatch(languageCode, safeVersions[channel]));
    if (incompleteChannels.length) {
      throw new Error(`Génération incomplète pour ${incompleteChannels.map((channel) => CHANNEL_LABELS[channel]).join(", ")}.`);
    }
  }

  return {
    versions: safeVersions,
    recoveredChannels: Array.from(new Set([...stillOffTopicChannels, ...stillOverSimilarChannels, ...stillLanguageMismatchChannels, ...recoveredChannels, ...deduplicatedChannels])),
  };
}

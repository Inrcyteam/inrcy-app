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
  const limit = channel === "instagram" || channel === "tiktok" || channel === "youtube_shorts" ? 8 : channel === "linkedin" ? 3 : 2;
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

const FRENCH_LEAK_PATTERNS = [
  /\b(?:bonjour|bonsoir|chez|nous|vous|votre|vos|notre|nos|avec|pour|dans|sans|sur|afin|grâce|grace|découvrez|decouvrez|contactez|écrivez|ecrivez|demandez|demander|devis|conseil|utile|mieux|besoin|prestation|prestations|actualité|actualite|nouveauté|nouveaute|réalisation|realisation|communication digitale|identité visuelle|strategie de communication|stratégie de communication|campagne locale|en savoir plus|voir le site|voir les informations)\b/i,
  /\b(?:un conseil|une actualité|une actualite|notre objectif|nous sommes|nous accompagnons|n'hésitez pas|n hesitez pas|à bientôt|a bientot|demander un devis|contactez-nous|contactez nous|écrivez-nous|ecrivez nous)\b/i,
];

const FRENCH_LEAK_TOKENS = new Set([
  "actualite",
  "actualites",
  "actualité",
  "actualités",
  "ainsi",
  "apaiser",
  "apaisant",
  "appel",
  "besoin",
  "besoins",
  "bienetre",
  "bienêtre",
  "chacun",
  "chacune",
  "chaque",
  "cherchent",
  "clientele",
  "clientèle",
  "concret",
  "concrete",
  "concrète",
  "conseil",
  "conseils",
  "contactez",
  "corps",
  "decouvrir",
  "découvrir",
  "decouvrez",
  "découvrez",
  "demander",
  "demandez",
  "detente",
  "détente",
  "devis",
  "ecrivez",
  "écrivez",
  "envie",
  "esprit",
  "facile",
  "horaires",
  "ideal",
  "ideale",
  "idéale",
  "idéal",
  "information",
  "informations",
  "locale",
  "locales",
  "mieux",
  "moment",
  "nouveaute",
  "nouveauté",
  "offrez",
  "personnalise",
  "personnalisee",
  "personnalisée",
  "personnalisees",
  "personnalisées",
  "permet",
  "permettent",
  "prestation",
  "prestations",
  "propose",
  "proposons",
  "proximite",
  "proximité",
  "rassurant",
  "rassurante",
  "reconnecter",
  "redécouvrez",
  "redecouvrez",
  "relacher",
  "relâcher",
  "rendezvous",
  "rendez-vous",
  "retrouver",
  "savoir",
  "seance",
  "séance",
  "seances",
  "séances",
  "serenite",
  "sérénité",
  "service",
  "services",
  "soin",
  "soins",
  "solution",
  "solutions",
  "souple",
  "souples",
  "tension",
  "tensions",
  "traitement",
  "traitements",
  "utile",
  "visibilite",
  "visibilité",
]);

function countRegexMatches(pattern: RegExp, text: string) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const globalPattern = new RegExp(pattern.source, flags);
  return Array.from(text.matchAll(globalPattern)).length;
}

function countFrenchTokenHints(text: string) {
  const tokens = (text.match(/[A-Za-zÀ-ÖØ-öø-ÿ0-9'-]+/g) || [])
    .map((token) => normalizeIdeaToken(token).replace(/-/g, ""))
    .filter(Boolean);
  return tokens.reduce((count, token) => count + (FRENCH_LEAK_TOKENS.has(token) ? 1 : 0), 0);
}

function countFrenchLeakMatches(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  return FRENCH_LEAK_PATTERNS.reduce((count, pattern) => count + countRegexMatches(pattern, text), 0) + countFrenchTokenHints(text);
}

function hasFrenchLeak(value: unknown, minMatches = 1) {
  return countFrenchLeakMatches(value) >= minMatches;
}

function hasLanguageMismatch(languageCode: string, post: ChannelPost | undefined) {
  if (languageCode === "fr" || !post) return false;

  const titleLeak = hasFrenchLeak(post.title, 1);
  const ctaLeak = hasFrenchLeak(post.cta, 1);
  const contentLeak = hasFrenchLeak(post.content, 2);
  const hashtagLeak = Array.isArray(post.hashtags) && post.hashtags.some((tag) => hasFrenchLeak(tag, 1));

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

type LanguageFallbackCopy = {
  title: string;
  siteTitle: string;
  videoTitle: string;
  cta: string;
  gmbCta: string;
  quoteCta: string;
  siteCta: string;
  messageCta: string;
  content: (context: { company: string; city: string; channel: BoosterChannels }) => string;
};

const LANGUAGE_FALLBACK_COPY: Record<string, LanguageFallbackCopy> = {
  en: {
    title: "Useful update for your local communication",
    siteTitle: "Improve your local communication",
    videoTitle: "Useful video for your communication",
    cta: "Contact us",
    gmbCta: "View information",
    quoteCta: "Request a quote",
    siteCta: "Visit the website",
    messageCta: "Send a message",
    content: ({ company, city }) => `${company}${city} shares a useful update to communicate more clearly and strengthen local visibility. The goal is simple: present the right information, make the message easy to understand and help interested customers take the next step. This publication can be adapted with a visual, a video or a more specific offer when needed.`,
  },
  es: {
    title: "Una actualización útil para su comunicación local",
    siteTitle: "Mejore su comunicación local",
    videoTitle: "Un vídeo útil para su comunicación",
    cta: "Contáctenos",
    gmbCta: "Ver la información",
    quoteCta: "Solicitar un presupuesto",
    siteCta: "Visitar el sitio web",
    messageCta: "Enviar un mensaje",
    content: ({ company, city }) => `${company}${city} comparte una actualización útil para comunicar de forma más clara y reforzar su visibilidad local. El objetivo es sencillo: presentar la información importante, facilitar la comprensión del mensaje y ayudar a los clientes interesados a dar el siguiente paso. Esta publicación puede completarse con una imagen, un vídeo o una oferta más específica si es necesario.`,
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
    content: ({ company, city }) => `${company}${city} condivide un aggiornamento utile per comunicare in modo più chiaro e rafforzare la visibilità locale. L'obiettivo è semplice: presentare le informazioni importanti, rendere il messaggio facile da capire e aiutare i clienti interessati a fare il passo successivo. Questa pubblicazione può essere completata con un'immagine, un video o un'offerta più specifica se necessario.`,
  },
  de: {
    title: "Ein nützliches Update für Ihre lokale Kommunikation",
    siteTitle: "Lokale Kommunikation verbessern",
    videoTitle: "Ein hilfreiches Video für Ihre Kommunikation",
    cta: "Kontakt aufnehmen",
    gmbCta: "Informationen ansehen",
    quoteCta: "Angebot anfragen",
    siteCta: "Website besuchen",
    messageCta: "Nachricht senden",
    content: ({ company, city }) => `${company}${city} teilt ein nützliches Update, um klarer zu kommunizieren und die lokale Sichtbarkeit zu stärken. Das Ziel ist einfach: wichtige Informationen verständlich präsentieren, die Botschaft klar machen und interessierten Kunden den nächsten Schritt erleichtern. Diese Veröffentlichung kann bei Bedarf mit einem Bild, einem Video oder einem konkreteren Angebot ergänzt werden.`,
  },
  nl: {
    title: "Een nuttige update voor uw lokale communicatie",
    siteTitle: "Verbeter uw lokale communicatie",
    videoTitle: "Een nuttige video voor uw communicatie",
    cta: "Neem contact op",
    gmbCta: "Informatie bekijken",
    quoteCta: "Offerte aanvragen",
    siteCta: "Website bekijken",
    messageCta: "Bericht sturen",
    content: ({ company, city }) => `${company}${city} deelt een nuttige update om duidelijker te communiceren en de lokale zichtbaarheid te versterken. Het doel is eenvoudig: belangrijke informatie begrijpelijk presenteren, de boodschap helder maken en geïnteresseerde klanten helpen de volgende stap te zetten. Deze publicatie kan indien nodig worden aangevuld met een afbeelding, video of specifiek aanbod.`,
  },
  pt: {
    title: "Uma atualização útil para a sua comunicação local",
    siteTitle: "Melhore a sua comunicação local",
    videoTitle: "Um vídeo útil para a sua comunicação",
    cta: "Contacte-nos",
    gmbCta: "Ver informações",
    quoteCta: "Solicitar orçamento",
    siteCta: "Visitar o site",
    messageCta: "Enviar mensagem",
    content: ({ company, city }) => `${company}${city} partilha uma atualização útil para comunicar de forma mais clara e reforçar a visibilidade local. O objetivo é simples: apresentar as informações importantes, tornar a mensagem fácil de compreender e ajudar os clientes interessados a dar o próximo passo. Esta publicação pode ser completada com uma imagem, um vídeo ou uma oferta mais específica, se necessário.`,
  },
};

function getLocalizedFallbackCta(channel: BoosterChannels, languageCode: string, preferredCta: string) {
  const copy = LANGUAGE_FALLBACK_COPY[languageCode] || LANGUAGE_FALLBACK_COPY.en;
  if (channel === "gmb") return copy.gmbCta;
  if (preferredCta === "devis") return copy.quoteCta;
  if (preferredCta === "site") return copy.siteCta;
  if (preferredCta === "message") return copy.messageCta;
  if (channel === "tiktok" || channel === "instagram" || channel === "youtube_shorts") return copy.messageCta;
  return copy.cta;
}

function ensureMinimumLocalizedContentLength(channel: BoosterChannels, content: string, languageCode: string) {
  const minLength = CHANNEL_MIN_CONTENT_LENGTH[channel] ?? 160;
  let out = content.trim();
  const copy = LANGUAGE_FALLBACK_COPY[languageCode] || LANGUAGE_FALLBACK_COPY.en;
  const fillers: Record<string, string[]> = {
    en: ["The message remains clear, professional and easy to reuse on the selected channel.", "It can be refined later with more precise details, images or a stronger call to action."],
    es: ["El mensaje se mantiene claro, profesional y fácil de reutilizar en el canal seleccionado.", "Puede ajustarse después con detalles más precisos, imágenes o una llamada a la acción más directa."],
    it: ["Il messaggio resta chiaro, professionale e facile da riutilizzare sul canale selezionato.", "Può essere adattato in seguito con dettagli più precisi, immagini o un invito all'azione più diretto."],
    de: ["Die Botschaft bleibt klar, professionell und leicht auf dem ausgewählten Kanal nutzbar.", "Sie kann später mit genaueren Details, Bildern oder einem stärkeren Aufruf zum Handeln ergänzt werden."],
    nl: ["De boodschap blijft duidelijk, professioneel en gemakkelijk te gebruiken op het geselecteerde kanaal.", "Ze kan later worden aangevuld met preciezere details, beelden of een sterkere oproep tot actie."],
    pt: ["A mensagem mantém-se clara, profissional e fácil de reutilizar no canal selecionado.", "Pode ser ajustada depois com detalhes mais precisos, imagens ou uma chamada à ação mais direta."],
  };
  const extra = fillers[languageCode] || fillers.en || [];
  let index = 0;
  while (out.length < minLength && extra.length && index < 8) {
    out = `${out}\n\n${extra[index % extra.length]}`.trim();
    index += 1;
  }
  return out || copy.content({ company: "iNrCy", city: "", channel });
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
  const baseTitle = args.channel === "youtube_shorts" || args.mediaType === "video"
    ? copy.videoTitle
    : siteChannels.has(args.channel)
      ? copy.siteTitle
      : copy.title;

  return normalizePost(args.channel, {
    title: baseTitle,
    content: ensureMinimumLocalizedContentLength(args.channel, copy.content({ company, city, channel: args.channel }), args.languageCode),
    cta: getLocalizedFallbackCta(args.channel, args.languageCode, context.preferredCta),
    hashtags: [],
  });
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

  if (!args.forceNonBlocking && !allowLocalFallback) {
    const incompleteChannels = channels.filter((channel) => !hasRequiredContent(channel, safeVersions[channel]) || hasLanguageMismatch(languageCode, safeVersions[channel]));
    if (incompleteChannels.length) {
      throw new Error(`Génération incomplète pour ${incompleteChannels.map((channel) => CHANNEL_LABELS[channel]).join(", ")}.`);
    }
  }

  return {
    versions: safeVersions,
    recoveredChannels: Array.from(new Set([...stillOffTopicChannels, ...stillOverSimilarChannels, ...stillLanguageMismatchChannels, ...recoveredChannels])),
  };
}

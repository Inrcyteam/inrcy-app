import { NextResponse } from "next/server";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { requireUser } from "@/lib/requireUser";
import { enforceRateLimit } from "@/lib/rateLimit";
import { openaiGenerateJSON } from "@/lib/openaiClient";
import { withApi } from "@/lib/observability/withApi";
import {
  boosterSystemPrompt,
  boosterUserPrompt,
  pickBoosterHiddenAngle,
  type BoosterChannels,
  type BoosterStyle,
  type BoosterTheme,
  type BoosterHiddenAngle,
  type BoosterRecentPublication,
} from "@/lib/boosterPrompt";
import { sanitizeGmbGeneratedPost } from "@/lib/googleBusinessCompliance";
import { sanitizeBoosterSiteText, stripSiteTextFormatting } from "@/lib/boosterFormatting";

export const maxDuration = 120;

type Payload = {
  idea?: string;
  theme?: BoosterTheme;
  style?: BoosterStyle;
  channels?: BoosterChannels[];
  useImagesForAI?: boolean;
  imageCount?: number;
  imagesForAI?: Array<{ name?: string; type?: string; dataUrl?: string }>;
};

type BoosterAiImage = {
  dataUrl: string;
  detail: "low" | "high" | "auto";
};

type ChannelPost = {
  title: string;
  content: string;
  cta: string;
  hashtags: string[];
};

type BoosterGenResponse = {
  versions: Partial<Record<BoosterChannels, ChannelPost>>;
};

type JsonRecord = Record<string, unknown>;

const allowedChannels: BoosterChannels[] = ["inrcy_site", "site_web", "gmb", "facebook", "instagram", "linkedin"];
const allowedThemes: BoosterTheme[] = ["", "promotion", "information", "conseil", "avis_client", "realisation", "actualite", "autre"];
const allowedStyles: BoosterStyle[] = ["sobre", "equilibre", "dynamique"];
const siteChannels = new Set<BoosterChannels>(["inrcy_site", "site_web"]);
const AI_IMAGE_MAX_COUNT = 5;
const AI_IMAGE_MAX_DATA_URL_LENGTH = 3_500_000;
const AI_IMAGE_MAX_TOTAL_DATA_URL_LENGTH = 10_000_000;
const AI_IMAGE_DATA_URL_RE = /^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/;

function sanitizeImagesForAI(body: Payload): BoosterAiImage[] {
  if (!body.useImagesForAI || !Array.isArray(body.imagesForAI)) return [];

  const images: BoosterAiImage[] = [];
  let totalLength = 0;

  for (const image of body.imagesForAI.slice(0, AI_IMAGE_MAX_COUNT)) {
    const dataUrl = String(image?.dataUrl || "").trim();
    if (!dataUrl || dataUrl.length > AI_IMAGE_MAX_DATA_URL_LENGTH || !AI_IMAGE_DATA_URL_RE.test(dataUrl)) {
      continue;
    }

    totalLength += dataUrl.length;
    if (totalLength > AI_IMAGE_MAX_TOTAL_DATA_URL_LENGTH) break;

    images.push({ dataUrl, detail: "low" });
  }

  return images;
}

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
- Pour Instagram et Facebook : exploiter davantage l'ambiance visuelle et le côté vivant.
- Pour LinkedIn : transformer les éléments visuels en expertise, méthode ou exigence professionnelle.
- Pour Google Business : rester factuel et sobre, même si l'image est très visuelle.
- Pour Site iNrCy / Site web : utiliser les images pour ancrer le contenu dans une réalisation concrète, sans sacrifier le SEO local.

En résumé : les images ne pilotent pas le sujet, elles l'affinent.`;
}

function cleanHashtags(channel: BoosterChannels, input: unknown) {
  if (channel === "gmb" || siteChannels.has(channel)) return [];

  const limit = channel === "instagram" ? 8 : channel === "linkedin" ? 3 : 2;
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
  const minContentLength = siteChannels.has(channel) ? 120 : 40;
  return post.content.trim().length >= minContentLength;
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
  return normalizeIdeaToken(
    [post.title, post.content, post.cta, ...(Array.isArray(post.hashtags) ? post.hashtags : [])].join(" "),
  );
}

function isPostAnchoredToIdea(ideaKeywords: string[], post: ChannelPost | undefined) {
  if (!ideaKeywords.length) return true;
  const text = getSearchablePostText(post);
  if (!text) return false;

  const matches = ideaKeywords.filter((keyword) => text.includes(keyword));
  const requiredMatches = ideaKeywords.length <= 2 ? 1 : 2;
  return matches.length >= requiredMatches;
}

function getCreativityTemperature(business: JsonRecord | null) {
  const creativity = String(business?.ai_creativity || "balanced");
  if (creativity === "stable") return 0.55;
  if (creativity === "creative") return 0.92;
  return 0.78;
}

function computeMaxOutputTokens(channels: BoosterChannels[]) {
  const uniqueChannels = Array.from(new Set(channels));
  const siteCount = uniqueChannels.filter((channel) => siteChannels.has(channel)).length;
  const socialCount = uniqueChannels.length - siteCount;

  // Les contenus site sont beaucoup plus longs. Depuis que Site iNrCy et Site web
  // sont séparés, le budget doit suivre les canaux réellement demandés, sans
  // rogner la qualité quand un seul site est sélectionné.
  let budget = 900;
  budget += siteCount * 1300;
  budget += socialCount * 520;
  if (siteCount >= 2) budget += 650;
  if (uniqueChannels.includes("gmb")) budget += 120;

  return Math.min(5200, Math.max(1400, budget));
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
          ? `Les deux canaux site sont demandés. Produis deux contenus complets, propres et distincts :
- Site iNrCy : variante plus vitrine/conversion, claire et rassurante.
- Site web : variante plus SEO durable, crédible et fluide.
Ne copie-colle jamais le même texte. Varie titre, accroche, ordre des idées et formulations, sans inventer de ville, zone ou prestation.`
          : `Un seul canal site est demandé. Produis un contenu site complet et qualitatif, avec une vraie valeur SEO locale, sans l'écourter parce qu'il n'y a qu'un canal.`,
    });
  }

  // Les réseaux sont gardés dans un second lot pour éviter qu'une réponse trop
  // longue coupe le JSON quand deux contenus site existent.
  for (let index = 0; index < socials.length; index += 3) {
    batches.push({ channels: socials.slice(index, index + 3) });
  }

  return batches;
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
    const out = await generateVersions({
      ...args,
      channels: batch.channels,
      extraInstructions: [batch.extraInstructions, args.extraInstructions].filter(Boolean).join("\n\n"),
    });

    const rawVersions =
      out?.versions && typeof out.versions === "object"
        ? (out.versions as Partial<Record<BoosterChannels, Partial<ChannelPost>>>)
        : {};

    for (const channel of batch.channels) {
      if (rawVersions[channel]) versions[channel] = rawVersions[channel];
    }
  }

  return { versions };
}

function cleanRecentPublicationField(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

async function fetchRecentPublicationMemory(
  supabase: { from: (table: string) => any },
  userId: string,
): Promise<BoosterRecentPublication[]> {
  try {
    const { data, error } = await supabase
      .from("publications")
      .select("title,content,cta,idea,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error || !Array.isArray(data)) return [];

    return data
      .map((row) => ({
        title: cleanRecentPublicationField(row?.title, 90),
        content: cleanRecentPublicationField(row?.content, 260),
        cta: cleanRecentPublicationField(row?.cta, 90),
        idea: cleanRecentPublicationField(row?.idea, 140),
        created_at: cleanRecentPublicationField(row?.created_at, 40),
      }))
      .filter((row) => row.title || row.content || row.idea || row.cta);
  } catch {
    return [];
  }
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
  const system = boosterSystemPrompt();
  const baseInput = boosterUserPrompt({
    idea: args.idea,
    theme: args.theme,
    style: args.style,
    channels: args.channels,
    profile: args.profile,
    business: args.business,
    hiddenAngle: args.hiddenAngle,
    recentPublications: args.recentPublications,
  });
  const imageInstructions = buildImageGenerationInstructions(args.imagesForAI?.length || 0);
  const input = [baseInput, imageInstructions, args.extraInstructions].filter(Boolean).join("\n\n");

  return openaiGenerateJSON<BoosterGenResponse>({
    system,
    input,
    images: args.imagesForAI,
    maxOutputTokens: computeMaxOutputTokens(args.channels),
    temperature: getCreativityTemperature(args.business),
  });
}

const handler = async (req: Request) => {
  try {
    const { supabase, user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;
    const userId = user.id;

    const rl = await enforceRateLimit({ name: "booster_generate", identifier: userId, limit: 10, window: "1 m" });
    if (rl) return rl;

    const body = (await req.json().catch(() => ({}))) as Payload;
    const idea = (body?.idea || "").trim();
    if (!idea) {
      return NextResponse.json({ error: "Idée manquante." }, { status: 400 });
    }

    const theme = allowedThemes.includes(body?.theme as BoosterTheme) ? (body.theme as BoosterTheme) : "information";
    const style = allowedStyles.includes(body?.style as BoosterStyle) ? (body.style as BoosterStyle) : "equilibre";

    const channels = Array.from(
      new Set(
        (Array.isArray(body?.channels) ? body.channels : []).filter(
          (c): c is BoosterChannels => allowedChannels.includes(c as BoosterChannels)
        )
      )
    );
    if (!channels.length) {
      return NextResponse.json({ error: "Canaux manquants." }, { status: 400 });
    }

    const imagesForAI = sanitizeImagesForAI(body);

    const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();

    let business: JsonRecord | null = null;
    try {
      const { data } = await supabase.from("business_profiles").select("*").eq("user_id", userId).maybeSingle();
      business = data && typeof data === "object" ? (data as JsonRecord) : null;
    } catch {
      business = null;
    }

    const recentPublications = await fetchRecentPublicationMemory(supabase, userId);
    const hiddenAngle = pickBoosterHiddenAngle();
    const ideaKeywords = extractIdeaKeywords(idea);

    const out = await generateVersionsForChannels({
      idea,
      theme,
      style,
      channels,
      profile: (profile ?? null) as JsonRecord | null,
      business,
      recentPublications,
      hiddenAngle,
      imagesForAI,
    });

    const rawVersions =
      out?.versions && typeof out.versions === "object"
        ? (out.versions as Partial<Record<BoosterChannels, Partial<ChannelPost>>>)
        : {};

    const safeVersions: Partial<Record<BoosterChannels, ChannelPost>> = {};
    for (const ch of channels) {
      safeVersions[ch] = normalizePost(ch, rawVersions[ch]);
    }

    const missingChannels = channels.filter((ch) => !hasRequiredContent(ch, safeVersions[ch]));
    const offTopicChannels = channels.filter(
      (ch) => hasRequiredContent(ch, safeVersions[ch]) && !isPostAnchoredToIdea(ideaKeywords, safeVersions[ch]),
    );
    const retryChannels = Array.from(new Set([...missingChannels, ...offTopicChannels]));

    if (retryChannels.length) {
      const retryOut = await generateVersionsForChannels({
        idea,
        theme,
        style,
        channels: retryChannels,
        profile: (profile ?? null) as JsonRecord | null,
        business,
        recentPublications,
        hiddenAngle,
        imagesForAI,
        extraInstructions: `IMPORTANT : regénère uniquement les canaux demandés ci-dessus.
- Le contenu précédent était soit vide/trop court, soit trop éloigné de l'intention libre du pro.
- Sujet libre obligatoire à respecter mot pour mot dans le fond : "${idea}".
- Le titre, l'accroche, le corps du texte et le CTA doivent rester reliés à cette intention.
- Ne fais pas une présentation générale de l'activité si le pro a demandé un sujet précis.
- Le contexte Mon activité, l'historique et l'angle éditorial servent uniquement à contextualiser, jamais à changer de sujet.
- Pour chaque canal, title, content et cta doivent être non vides.
- Pour un canal site, le content doit être complet, naturel et utile, jamais vide ni résumé en une ligne.
- Si Site iNrCy et Site web sont présents dans ce lot, ils doivent rester deux variantes distinctes et non deux copies.`,
      });

      const retryVersions =
        retryOut?.versions && typeof retryOut.versions === "object"
          ? (retryOut.versions as Partial<Record<BoosterChannels, Partial<ChannelPost>>>)
          : {};

      for (const ch of retryChannels) {
        const retriedPost = normalizePost(ch, retryVersions[ch]);
        if (hasRequiredContent(ch, retriedPost) && isPostAnchoredToIdea(ideaKeywords, retriedPost)) {
          safeVersions[ch] = retriedPost;
        }
      }
    }

    const stillMissingChannels = channels.filter((ch) => !hasRequiredContent(ch, safeVersions[ch]));
    const stillOffTopicChannels = channels.filter(
      (ch) => hasRequiredContent(ch, safeVersions[ch]) && !isPostAnchoredToIdea(ideaKeywords, safeVersions[ch]),
    );
    if (stillOffTopicChannels.length) {
      return NextResponse.json(
        {
          error: "La génération IA n'a pas assez respecté le sujet demandé. Merci de relancer la génération ou de préciser un peu plus la phrase libre.",
        },
        { status: 502 },
      );
    }

    if (stillMissingChannels.length) {
      return NextResponse.json(
        {
          error:
            stillMissingChannels.some((channel) => siteChannels.has(channel))
              ? "La génération IA n'a pas produit un contenu site exploitable. Merci de relancer la génération."
              : "La génération IA est incomplète. Merci de relancer la génération.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ versions: safeVersions });
  } catch (e: unknown) {
    return jsonUserFacingError(e, {
      status: 502,
      fallback: "La génération IA n'a pas pu aboutir. Merci de réessayer.",
    });
  }
};

export const POST = withApi(handler, { route: "/api/booster/generate" });

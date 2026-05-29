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
import {
  sanitizeBoosterSiteText,
  stripSiteTextFormatting,
} from "@/lib/boosterFormatting";

export const maxDuration = 120;

type Payload = {
  idea?: string;
  theme?: BoosterTheme;
  style?: BoosterStyle;
  channels?: BoosterChannels[];
  mediaType?: "images" | "video";
  useImagesForAI?: boolean;
  imageCount?: number;
  imagesForAI?: Array<{ name?: string; type?: string; dataUrl?: string }>;
  videoForAI?: {
    name?: string;
    type?: string;
    size?: number;
    duration?: number | null;
    source?: "browser_file" | "supabase_storage";
    storagePath?: string;
    publicUrl?: string;
    url?: string;
    visualFrames?: Array<{
      name?: string;
      type?: string;
      dataUrl?: string;
      frameTarget?: "start" | "middle" | "end";
      timeSeconds?: number;
    }>;
    audioTranscript?: string | null;
    rawAudioTranscript?: string | null;
    analysisPlan?: {
      visualFrames?: "pending" | "ready";
      audioTranscript?: "pending" | "ready" | "unavailable";
      frameTargets?: Array<"start" | "middle" | "end">;
    };
  } | null;
};

type BoosterAiImage = {
  dataUrl: string;
  detail: "low" | "high" | "auto";
};

type BoosterVideoContext = {
  mimeType: string;
  size: number | null;
  duration: number | null;
  source: "browser_file" | "supabase_storage";
  storagePath: string;
  publicUrl: string;
  frameCount: number;
  audioTranscript: string;
  analysisPlan: {
    visualFrames: "pending" | "ready";
    audioTranscript: "pending" | "ready" | "unavailable";
    frameTargets: Array<"start" | "middle" | "end">;
  };
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

const allowedChannels: BoosterChannels[] = [
  "inrcy_site",
  "site_web",
  "gmb",
  "facebook",
  "instagram",
  "linkedin",
];
const allowedThemes: BoosterTheme[] = [
  "",
  "promotion",
  "information",
  "conseil",
  "avis_client",
  "realisation",
  "actualite",
  "autre",
];
const allowedStyles: BoosterStyle[] = ["sobre", "equilibre", "dynamique"];
const siteChannels = new Set<BoosterChannels>(["inrcy_site", "site_web"]);
const AI_IMAGE_MAX_COUNT = 5;
const AI_IMAGE_MAX_DATA_URL_LENGTH = 3_500_000;
const AI_IMAGE_MAX_TOTAL_DATA_URL_LENGTH = 10_000_000;
const AI_IMAGE_DATA_URL_RE =
  /^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const BOOSTER_MAX_VIDEO_BYTES = 40 * 1024 * 1024;
const BOOSTER_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
]);

function normalizeGenerationMediaType(value: unknown): "images" | "video" {
  return value === "video" ? "video" : "images";
}

function cleanVideoTranscript(value: unknown, maxLength = 1800) {
  return String(value || "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .replace(/^['"“”‘’]+|['"“”‘’]+$/g, "")
    .slice(0, maxLength)
    .trim();
}
function sanitizeImagesForAI(body: Payload): BoosterAiImage[] {
  if (!body.useImagesForAI || !Array.isArray(body.imagesForAI)) return [];

  const images: BoosterAiImage[] = [];
  let totalLength = 0;

  for (const image of body.imagesForAI.slice(0, AI_IMAGE_MAX_COUNT)) {
    const dataUrl = String(image?.dataUrl || "").trim();
    if (
      !dataUrl ||
      dataUrl.length > AI_IMAGE_MAX_DATA_URL_LENGTH ||
      !AI_IMAGE_DATA_URL_RE.test(dataUrl)
    ) {
      continue;
    }

    totalLength += dataUrl.length;
    if (totalLength > AI_IMAGE_MAX_TOTAL_DATA_URL_LENGTH) break;

    images.push({ dataUrl, detail: "low" });
  }

  return images;
}

function sanitizeVideoFramesForAI(body: Payload): BoosterAiImage[] {
  if (normalizeGenerationMediaType(body.mediaType) !== "video") return [];
  const frames = Array.isArray(body.videoForAI?.visualFrames)
    ? body.videoForAI?.visualFrames
    : [];

  const images: BoosterAiImage[] = [];
  let totalLength = 0;

  for (const frame of frames.slice(0, 3)) {
    const dataUrl = String(frame?.dataUrl || "").trim();
    if (
      !dataUrl ||
      dataUrl.length > AI_IMAGE_MAX_DATA_URL_LENGTH ||
      !AI_IMAGE_DATA_URL_RE.test(dataUrl)
    ) {
      continue;
    }

    totalLength += dataUrl.length;
    if (totalLength > AI_IMAGE_MAX_TOTAL_DATA_URL_LENGTH) break;

    images.push({ dataUrl, detail: "low" });
  }

  return images;
}

function sanitizeVideoForAI(body: Payload): BoosterVideoContext | null {
  if (normalizeGenerationMediaType(body.mediaType) !== "video") return null;
  const video = body.videoForAI;
  if (!video || typeof video !== "object") return null;

  const mimeType = String(video.type || "")
    .toLowerCase()
    .trim();
  const size = Number(video.size || 0);
  const duration = Number(video.duration || 0);

  const source =
    video.source === "supabase_storage" ? "supabase_storage" : "browser_file";
  const frameTargets = Array.isArray(video.analysisPlan?.frameTargets)
    ? video.analysisPlan.frameTargets.filter(
        (target): target is "start" | "middle" | "end" =>
          target === "start" || target === "middle" || target === "end",
      )
    : [];

  const audioTranscript = cleanVideoTranscript(
    video.audioTranscript || video.rawAudioTranscript,
  );
  const requestedAudioStatus = video.analysisPlan?.audioTranscript;

  return {
    mimeType: BOOSTER_VIDEO_MIME_TYPES.has(mimeType) ? mimeType : "video/mp4",
    size:
      Number.isFinite(size) && size > 0 && size <= BOOSTER_MAX_VIDEO_BYTES
        ? size
        : null,
    duration: Number.isFinite(duration) && duration > 0 ? duration : null,
    source,
    storagePath: String(video.storagePath || "").trim(),
    publicUrl: String(video.publicUrl || video.url || "").trim(),
    frameCount: Array.isArray(video.visualFrames)
      ? video.visualFrames.length
      : 0,
    audioTranscript,
    analysisPlan: {
      visualFrames:
        Array.isArray(video.visualFrames) &&
        video.visualFrames.length > 0 &&
        video.analysisPlan?.visualFrames === "ready"
          ? "ready"
          : "pending",
      audioTranscript: audioTranscript
        ? "ready"
        : requestedAudioStatus === "unavailable"
          ? "unavailable"
          : "pending",
      frameTargets: frameTargets.length
        ? frameTargets
        : ["start", "middle", "end"],
    },
  };
}

function formatVideoDurationLabel(seconds: number | null) {
  if (!seconds || !Number.isFinite(seconds)) return "";
  const rounded = Math.max(1, Math.round(seconds));
  if (rounded < 60) return `${rounded} seconde${rounded > 1 ? "s" : ""}`;
  const minutes = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
}

function buildVideoGenerationInstructions(video: BoosterVideoContext | null) {
  if (!video) return "";

  const durationLabel = formatVideoDurationLabel(video.duration);
  const metadata = [
    durationLabel ? `durée approximative : ${durationLabel}` : "",
    video.mimeType
      ? `format : ${video.mimeType.replace("video/", "").toUpperCase()}`
      : "",
  ]
    .filter(Boolean)
    .join(" ; ");
  const frameContext =
    video.analysisPlan.visualFrames === "ready" && video.frameCount > 0
      ? `Des captures extraites de la vidéo sont jointes au prompt (début, milieu, fin quand possible). Utilise-les pour enrichir le contenu avec des détails visibles, sans changer le sujet principal donné par la phrase libre.`
      : `Aucune capture exploitable n'est disponible : rédiger principalement à partir de l'intention libre du pro, de Mon activité, de Mon profil et du canal demandé.`;
  const audioContext = video.audioTranscript
    ? `Transcription audio détectée dans la vidéo :
"""${video.audioTranscript}"""
Utilise cette transcription comme contexte prioritaire pour comprendre ce qui est dit, les mots métier, les noms, les offres ou les précisions commerciales. Ne la cite pas forcément mot pour mot, transforme-la en publication propre.`
    : video.analysisPlan.audioTranscript === "unavailable"
      ? `Aucune parole exploitable n'a été détectée ou la transcription audio vidéo est indisponible : rédiger sans bloquer la génération.`
      : `La transcription audio vidéo n'est pas disponible : rédiger sans attendre l'audio.`;

  return `Contexte média fourni : 1 vidéo est jointe à la publication${metadata ? ` (${metadata})` : ""}.

${audioContext}

Règles vidéo obligatoires :
- La génération est en mode vidéo : le texte doit être adapté à une publication vidéo.
- ${frameContext}
- La phrase libre reste le sujet principal. La transcription audio complète l'intention quand elle existe ; si elle contredit clairement la phrase libre, privilégier la phrase libre.
- Les captures vidéo servent à préciser l'ambiance, le geste métier, le résultat visible, le produit, le lieu apparent ou le contexte quand c'est cohérent.
- Adapter le texte à une publication vidéo : accroche plus vivante, phrases concrètes, CTA qui incite à découvrir la réalisation, le produit, le conseil ou le moment présenté.
- Ne jamais inventer ce qui se voit ou s'entend dans la vidéo : lieu, personne, marque, avant/après, résultat précis, prix, certification, date, avis client ou détail technique non fourni.
- Si une capture est floue, ambiguë ou peu utile, l'ignorer plutôt que d'inventer.
- Ne pas écrire "on voit dans la vidéo", "regardez cette vidéo" ou "comme montré" si l'intention libre ne le permet pas.
- Ne pas parler de photo, d'image, de carrousel ou de visuel statique.
- Pour Instagram et Facebook : ton plus direct, dynamique et immersif.
- Pour LinkedIn : transformer le support vidéo en preuve de méthode, sérieux ou expertise.
- Pour Google Business : rester sobre, factuel et local.
- Pour Site iNrCy / Site web : utiliser la vidéo comme preuve de terrain, sans affirmer de détails non fournis.`;
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
        .map((h) =>
          String(h || "")
            .trim()
            .replace(/^#+/, ""),
        )
        .filter(Boolean)
        .slice(0, limit)
    : [];
}

function normalizePost(
  channel: BoosterChannels,
  raw: Partial<ChannelPost> | undefined,
): ChannelPost {
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
    title: (siteChannel
      ? sanitizeBoosterSiteText(title)
      : stripSiteTextFormatting(title)
    ).slice(0, 90),
    content: (siteChannel
      ? sanitizeBoosterSiteText(content)
      : stripSiteTextFormatting(content)
    ).slice(0, siteChannel ? 6000 : 2000),
    cta: stripSiteTextFormatting(raw?.cta || "").slice(0, 180),
    hashtags: cleanHashtags(channel, raw?.hashtags),
  };
}

function hasRequiredContent(
  channel: BoosterChannels,
  post: ChannelPost | undefined,
) {
  if (!post) return false;
  if (!post.title.trim() || !post.content.trim() || !post.cta.trim())
    return false;
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
    [
      post.title,
      post.content,
      post.cta,
      ...(Array.isArray(post.hashtags) ? post.hashtags : []),
    ].join(" "),
  );
}

function isPostAnchoredToIdea(
  ideaKeywords: string[],
  post: ChannelPost | undefined,
) {
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
  const siteCount = uniqueChannels.filter((channel) =>
    siteChannels.has(channel),
  ).length;
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
  const uniqueChannels = allowedChannels.filter((channel) =>
    channels.includes(channel),
  );
  const sites = uniqueChannels.filter((channel) => siteChannels.has(channel));
  const socials = uniqueChannels.filter(
    (channel) => !siteChannels.has(channel),
  );
  const batches: Array<{
    channels: BoosterChannels[];
    extraInstructions?: string;
  }> = [];

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
      extraInstructions: [batch.extraInstructions, args.extraInstructions]
        .filter(Boolean)
        .join("\n\n"),
    });

    const rawVersions =
      out?.versions && typeof out.versions === "object"
        ? (out.versions as Partial<
            Record<BoosterChannels, Partial<ChannelPost>>
          >)
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
  const imageInstructions = buildImageGenerationInstructions(
    args.imagesForAI?.length || 0,
  );
  const input = [baseInput, imageInstructions, args.extraInstructions]
    .filter(Boolean)
    .join("\n\n");

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

    const rl = await enforceRateLimit({
      name: "booster_generate",
      identifier: userId,
      limit: 10,
      window: "1 m",
    });
    if (rl) return rl;

    const body = (await req.json().catch(() => ({}))) as Payload;
    const idea = (body?.idea || "").trim();
    if (!idea) {
      return NextResponse.json({ error: "Idée manquante." }, { status: 400 });
    }

    const theme = allowedThemes.includes(body?.theme as BoosterTheme)
      ? (body.theme as BoosterTheme)
      : "information";
    const style = allowedStyles.includes(body?.style as BoosterStyle)
      ? (body.style as BoosterStyle)
      : "equilibre";

    const channels = Array.from(
      new Set(
        (Array.isArray(body?.channels) ? body.channels : []).filter(
          (c): c is BoosterChannels =>
            allowedChannels.includes(c as BoosterChannels),
        ),
      ),
    );
    if (!channels.length) {
      return NextResponse.json({ error: "Canaux manquants." }, { status: 400 });
    }

    const mediaType = normalizeGenerationMediaType(body.mediaType);
    const imagesForAI = sanitizeImagesForAI({ ...body, mediaType });
    const videoFrameImagesForAI = sanitizeVideoFramesForAI({
      ...body,
      mediaType,
    });
    const videoForAI = sanitizeVideoForAI({ ...body, mediaType });
    const mediaGenerationInstructions =
      buildVideoGenerationInstructions(videoForAI);

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    let business: JsonRecord | null = null;
    try {
      const { data } = await supabase
        .from("business_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      business = data && typeof data === "object" ? (data as JsonRecord) : null;
    } catch {
      business = null;
    }

    const recentPublications = await fetchRecentPublicationMemory(
      supabase,
      userId,
    );
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
      imagesForAI:
        mediaType === "video"
          ? [...videoFrameImagesForAI, ...imagesForAI].slice(
              0,
              AI_IMAGE_MAX_COUNT,
            )
          : imagesForAI,
      extraInstructions: mediaGenerationInstructions,
    });

    const rawVersions =
      out?.versions && typeof out.versions === "object"
        ? (out.versions as Partial<
            Record<BoosterChannels, Partial<ChannelPost>>
          >)
        : {};

    const safeVersions: Partial<Record<BoosterChannels, ChannelPost>> = {};
    for (const ch of channels) {
      safeVersions[ch] = normalizePost(ch, rawVersions[ch]);
    }

    const missingChannels = channels.filter(
      (ch) => !hasRequiredContent(ch, safeVersions[ch]),
    );
    const offTopicChannels = channels.filter(
      (ch) =>
        hasRequiredContent(ch, safeVersions[ch]) &&
        !isPostAnchoredToIdea(ideaKeywords, safeVersions[ch]),
    );
    const retryChannels = Array.from(
      new Set([...missingChannels, ...offTopicChannels]),
    );

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
        imagesForAI:
          mediaType === "video"
            ? [...videoFrameImagesForAI, ...imagesForAI].slice(
                0,
                AI_IMAGE_MAX_COUNT,
              )
            : imagesForAI,
        extraInstructions: [
          mediaGenerationInstructions,
          `IMPORTANT : regénère uniquement les canaux demandés ci-dessus.
- Le contenu précédent était soit vide/trop court, soit trop éloigné de l'intention libre du pro.
- Sujet libre obligatoire à respecter mot pour mot dans le fond : "${idea}".
- Le titre, l'accroche, le corps du texte et le CTA doivent rester reliés à cette intention.
- Ne fais pas une présentation générale de l'activité si le pro a demandé un sujet précis.
- Le contexte Mon activité, l'historique et l'angle éditorial servent uniquement à contextualiser, jamais à changer de sujet.
- Pour chaque canal, title, content et cta doivent être non vides.
- Pour un canal site, le content doit être complet, naturel et utile, jamais vide ni résumé en une ligne.
- Si Site iNrCy et Site web sont présents dans ce lot, ils doivent rester deux variantes distinctes et non deux copies.`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      });

      const retryVersions =
        retryOut?.versions && typeof retryOut.versions === "object"
          ? (retryOut.versions as Partial<
              Record<BoosterChannels, Partial<ChannelPost>>
            >)
          : {};

      for (const ch of retryChannels) {
        const retriedPost = normalizePost(ch, retryVersions[ch]);
        if (
          hasRequiredContent(ch, retriedPost) &&
          isPostAnchoredToIdea(ideaKeywords, retriedPost)
        ) {
          safeVersions[ch] = retriedPost;
        }
      }
    }

    const stillMissingChannels = channels.filter(
      (ch) => !hasRequiredContent(ch, safeVersions[ch]),
    );
    const stillOffTopicChannels = channels.filter(
      (ch) =>
        hasRequiredContent(ch, safeVersions[ch]) &&
        !isPostAnchoredToIdea(ideaKeywords, safeVersions[ch]),
    );
    if (stillOffTopicChannels.length) {
      return NextResponse.json(
        {
          error:
            "La génération IA n'a pas assez respecté le sujet demandé. Merci de relancer la génération ou de préciser un peu plus la phrase libre.",
        },
        { status: 502 },
      );
    }

    if (stillMissingChannels.length) {
      return NextResponse.json(
        {
          error: stillMissingChannels.some((channel) =>
            siteChannels.has(channel),
          )
            ? "La génération IA n'a pas produit un contenu site exploitable. Merci de relancer la génération."
            : "La génération IA est incomplète. Merci de relancer la génération.",
        },
        { status: 502 },
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

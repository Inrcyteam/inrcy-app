import { NextResponse } from "next/server";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { requireUser } from "@/lib/requireUser";
import { enforceRateLimit } from "@/lib/rateLimit";
import { openaiGenerateJSON } from "@/lib/openaiClient";
import { withApi } from "@/lib/observability/withApi";
import {
  boosterSystemPrompt,
  boosterUserPrompt,
  type BoosterChannels,
  type BoosterStyle,
  type BoosterTheme,
} from "@/lib/boosterPrompt";
import { sanitizeGmbGeneratedPost } from "@/lib/googleBusinessCompliance";

type Payload = {
  idea?: string;
  theme?: BoosterTheme;
  style?: BoosterStyle;
  channels?: BoosterChannels[];
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

function cleanHashtags(input: unknown) {
  return Array.isArray(input)
    ? input
        .map((h) => String(h || "").trim().replace(/^#+/, ""))
        .filter(Boolean)
        .slice(0, 8)
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

  return {
    title: String(raw?.title || "").trim().slice(0, 90),
    content: String(raw?.content || "")
      .trim()
      .slice(0, siteChannels.has(channel) ? 6000 : 2000),
    cta: String(raw?.cta || "").trim().slice(0, 180),
    hashtags: cleanHashtags(raw?.hashtags),
  };
}

function hasRequiredContent(channel: BoosterChannels, post: ChannelPost | undefined) {
  if (!post) return false;
  if (!post.title.trim() || !post.content.trim() || !post.cta.trim()) return false;
  const minContentLength = siteChannels.has(channel) ? 120 : 40;
  return post.content.trim().length >= minContentLength;
}

function computeMaxOutputTokens(channels: BoosterChannels[]) {
  const uniqueChannels = new Set(channels);
  const hasSite = channels.some((channel) => siteChannels.has(channel));
  let budget = 700 + uniqueChannels.size * 220;
  if (hasSite) budget += 350;
  if (uniqueChannels.size >= 4) budget += 150;
  return Math.min(2000, Math.max(900, budget));
}

async function generateVersions(args: {
  idea: string;
  theme: BoosterTheme;
  style: BoosterStyle;
  channels: BoosterChannels[];
  profile: JsonRecord | null;
  business: JsonRecord | null;
  extraInstructions?: string;
}) {
  const system = boosterSystemPrompt();
  const baseInput = boosterUserPrompt({
    idea: args.idea,
    theme: args.theme,
    style: args.style,
    channels: args.channels,
    profile: args.profile,
    business: args.business,
  });
  const input = args.extraInstructions ? `${baseInput}

${args.extraInstructions}` : baseInput;

  return openaiGenerateJSON<BoosterGenResponse>({
    system,
    input,
    maxOutputTokens: computeMaxOutputTokens(args.channels),
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

    const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();

    let business: JsonRecord | null = null;
    try {
      const { data } = await supabase.from("business_profiles").select("*").eq("user_id", userId).maybeSingle();
      business = data && typeof data === "object" ? (data as JsonRecord) : null;
    } catch {
      business = null;
    }

    const out = await generateVersions({
      idea,
      theme,
      style,
      channels,
      profile: (profile ?? null) as JsonRecord | null,
      business,
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

    if (missingChannels.length) {
      const retryOut = await generateVersions({
        idea,
        theme,
        style,
        channels: missingChannels,
        profile: (profile ?? null) as JsonRecord | null,
        business,
        extraInstructions:
          "IMPORTANT : certains canaux précédents étaient vides ou trop courts. Regénère uniquement les canaux demandés ci-dessus. Pour chaque canal, title, content et cta doivent être non vides. Pour un canal site, le content doit être complet, naturel et utile, jamais vide ni résumé en une ligne.",
      });

      const retryVersions =
        retryOut?.versions && typeof retryOut.versions === "object"
          ? (retryOut.versions as Partial<Record<BoosterChannels, Partial<ChannelPost>>>)
          : {};

      for (const ch of missingChannels) {
        const retriedPost = normalizePost(ch, retryVersions[ch]);
        if (hasRequiredContent(ch, retriedPost)) {
          safeVersions[ch] = retriedPost;
        }
      }
    }

    const stillMissingChannels = channels.filter((ch) => !hasRequiredContent(ch, safeVersions[ch]));
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
    return jsonUserFacingError(e, { status: 500 });
  }
};

export const POST = withApi(handler, { route: "/api/booster/generate" });

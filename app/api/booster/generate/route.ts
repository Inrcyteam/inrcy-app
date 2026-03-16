import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { enforceRateLimit } from "@/lib/rateLimit";
import { openaiGenerateJSON } from "@/lib/openaiClient";
import { withApi } from "@/lib/observability/withApi";
import {
  boosterSystemPrompt,
  boosterUserPrompt,
  type BoosterChannels,
  type BoosterTheme,
} from "@/lib/boosterPrompt";

type Payload = {
  idea?: string;
  theme?: BoosterTheme;
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

function cleanHashtags(input: unknown) {
  return Array.isArray(input)
    ? input
        .map((h) => String(h || "").trim().replace(/^#+/, ""))
        .filter(Boolean)
        .slice(0, 8)
    : [];
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
      return NextResponse.json({ error: "Missing idea" }, { status: 400 });
    }

    const theme = allowedThemes.includes(body?.theme as BoosterTheme) ? (body.theme as BoosterTheme) : "information";
    const channels = (Array.isArray(body?.channels) ? body.channels : []).filter(
      (c): c is BoosterChannels => allowedChannels.includes(c as BoosterChannels)
    );
    if (!channels.length) {
      return NextResponse.json({ error: "Missing channels" }, { status: 400 });
    }

    const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();

    let business: JsonRecord | null = null;
    try {
      const { data } = await supabase.from("business_profiles").select("*").eq("user_id", userId).maybeSingle();
      business = data && typeof data === "object" ? (data as JsonRecord) : null;
    } catch {
      business = null;
    }

    const system = boosterSystemPrompt();
    const input = boosterUserPrompt({ idea, theme, channels, profile: (profile ?? null) as JsonRecord | null, business });

    const out = await openaiGenerateJSON<BoosterGenResponse>({
      system,
      input,
      maxOutputTokens: 1800,
    });

    const rawVersions = (out?.versions && typeof out.versions === "object" ? out.versions : {}) as Partial<Record<BoosterChannels, Partial<ChannelPost>>>;
    const safeVersions: Partial<Record<BoosterChannels, ChannelPost>> = {};

    for (const ch of channels) {
      const raw = rawVersions[ch] || {};
      safeVersions[ch] = {
        title: String(raw?.title || "").slice(0, 90),
        content: String(raw?.content || "").slice(0, ch === "inrcy_site" || ch === "site_web" ? 6000 : 2000),
        cta: String(raw?.cta || "").slice(0, 180),
        hashtags: cleanHashtags(raw?.hashtags),
      };
    }

    return NextResponse.json({ versions: safeVersions });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};

export const POST = withApi(handler, { route: "/api/booster/generate" });

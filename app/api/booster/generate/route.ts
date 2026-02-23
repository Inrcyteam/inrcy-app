import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { enforceRateLimit } from "@/lib/rateLimit";
import { openaiGenerateJSON } from "@/lib/openaiClient";
import { withApi } from "@/lib/observability/withApi";
import {
  boosterSystemPrompt,
  boosterUserPrompt,
  type BoosterChannels,
} from "@/lib/boosterPrompt";

type Payload = {
  idea?: string;
  channels?: BoosterChannels[];
};

type BoosterGenResponse = {
  title: string;
  content: string;
  cta: string;
  hashtags: string[];
};

const allowedChannels: BoosterChannels[] = ["inrcy_site", "site_web", "gmb", "facebook", "instagram", "linkedin"];

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

    const channels = (Array.isArray(body?.channels) ? body.channels : [])
      .filter((c): c is BoosterChannels => allowedChannels.includes(c as BoosterChannels));

    // Load profile (identity/company info)
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    // Load business profile (Mon activité)
    let business: any = null;
    try {
      const { data } = await supabase
        .from("business_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      business = data ?? null;
    } catch {
      business = null;
    }

    const system = boosterSystemPrompt();
    const input = boosterUserPrompt({ idea, channels, profile, business });

    const out = await openaiGenerateJSON<BoosterGenResponse>({
      system,
      input,
      maxOutputTokens: 900,
    });

    const safe: BoosterGenResponse = {
      title: String(out?.title || "").slice(0, 80),
      content: String(out?.content || "").slice(0, 2000),
      cta: String(out?.cta || "").slice(0, 160),
      hashtags: Array.isArray(out?.hashtags)
        ? out.hashtags
            .map((h) => String(h || "").trim())
            .filter(Boolean)
            .slice(0, 6)
        : [],
    };

    return NextResponse.json(safe);
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};

export const POST = withApi(handler, { route: "/api/booster/generate" });
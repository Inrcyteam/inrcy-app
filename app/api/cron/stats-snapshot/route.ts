import { NextResponse } from "next/server";
import { getChannelConnectionStates, type ChannelStates } from "@/lib/channelConnectionState";
import { saveSnapshot } from "@/lib/statsSnapshots";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const SNAPSHOT_SOURCES: Array<keyof ChannelStates> = [
  "site_inrcy",
  "site_web",
  "facebook",
  "instagram",
  "linkedin",
  "gmb",
];

function isAuthorizedCron(req: Request) {
  const cronSecret = process.env.VERCEL_CRON_SECRET || process.env.CRON_SECRET || "";
  if (!cronSecret) return false;

  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  const headerSecret = (req.headers.get("x-cron-secret") || "").trim();

  const url = new URL(req.url);
  const querySecret = (url.searchParams.get("secret") || "").trim();

  return bearer === cronSecret || headerSecret === cronSecret || querySecret === cronSecret;
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: users, error: usersError } = await supabaseAdmin
    .from("profiles")
    .select("user_id")
    .not("user_id", "is", null);

  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 500 });
  }

  let processedUsers = 0;
  let writtenSnapshots = 0;
  const errors: Array<{ user_id: string; message: string }> = [];

  for (const user of users || []) {
    const userId = typeof user?.user_id === "string" ? user.user_id : "";
    if (!userId) continue;

    try {
      const states = await getChannelConnectionStates(supabaseAdmin, userId);

      for (const source of SNAPSHOT_SOURCES) {
        const state = states[source];

        await saveSnapshot({
          supabase: supabaseAdmin,
          userId,
          source,
          connected: Boolean(state?.connected),
          metrics: state ?? {},
          demandesCaptees: 0,
          opportunites: 0,
        });

        writtenSnapshots++;
      }

      processedUsers++;
    } catch (error) {
      errors.push({
        user_id: userId,
        message: error instanceof Error ? error.message : "Unknown snapshot error",
      });
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    processedUsers,
    writtenSnapshots,
    errors,
  });
}

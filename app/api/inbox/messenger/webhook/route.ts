import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Messenger Webhook
 * Meta config:
 * - Callback URL: <SITE>/api/inbox/messenger/webhook
 * - Verify Token: env MESSENGER_VERIFY_TOKEN
 */
function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const verify = process.env.MESSENGER_VERIFY_TOKEN;
  if (mode === "subscribe" && token && verify && token === verify && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Webhook verification failed" }, { status: 403 });
}

export async function POST(req: Request) {
  // Meta attend un 200 rapidement.
  try {
    const body = await req.json().catch(() => null);
    if (!body || body.object !== "page") return NextResponse.json({ ok: true });

    const entries = Array.isArray(body.entry) ? body.entry : [];
    const supabase = supabaseAdmin();

    for (const e of entries) {
      const pageId: string | null = e?.id ?? null;
      if (!pageId) continue;

      // Trouver à quel user appartient cette page
      const { data: acc, error: accErr } = await supabase
        .from("messenger_accounts")
        .select("user_id")
        .eq("page_id", pageId)
        .maybeSingle();

      if (accErr || !acc?.user_id) continue;

      const userId = acc.user_id as string;

      // Events Messenger possibles: messaging, standby, changes...
      // Le plus courant: e.messaging[]
      const messaging = Array.isArray(e?.messaging) ? e.messaging : [];

      for (const m of messaging) {
        const ts =
          typeof m?.timestamp === "number"
            ? new Date(m.timestamp).toISOString()
            : new Date().toISOString();

        // event_type simple (tu peux affiner plus tard)
        const eventType =
          m?.message ? "message" : m?.postback ? "postback" : "messaging";

        // Insert compatible avec ta table actuelle
        await supabase.from("messenger_events").insert({
          user_id: userId,
          page_id: pageId,
          event_type: eventType,
          payload: m, // on stocke brut (parfait pour debug + future normalisation)
          created_at: ts,
        });
      }
    }
  } catch {
    // swallow (Meta veut 200)
  }

  return NextResponse.json({ ok: true });
}

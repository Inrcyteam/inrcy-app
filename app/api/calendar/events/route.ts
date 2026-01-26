import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

function isExpired(expires_at?: string | null, skewSeconds = 60) {
  if (!expires_at) return false;
  const t = Date.parse(expires_at);
  if (Number.isNaN(t)) return false;
  return t <= Date.now() + skewSeconds * 1000;
}

async function refreshAccessToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function getCalendarToken(supabase: any, userId: string) {
  const { data: accounts } = await supabase
    .from("calendar_accounts")
    .select("id,access_token_enc,refresh_token_enc,expires_at,status,created_at")
    .eq("user_id", userId)
    .eq("provider", "google")
    .order("created_at", { ascending: true })
    .limit(1);

  const account = accounts?.[0];
  if (!account) throw new Error("No Google Calendar connected");

  let accessToken: string = account.access_token_enc;
  const refreshToken: string | null = account.refresh_token_enc ?? null;

  if (refreshToken && isExpired(account.expires_at)) {
    const r = await refreshAccessToken(refreshToken);
    if (r.ok && r.data?.access_token) {
      accessToken = r.data.access_token;
      const expiresAt =
        r.data.expires_in != null
          ? new Date(Date.now() + Number(r.data.expires_in) * 1000).toISOString()
          : null;

      await supabase
        .from("calendar_accounts")
        .update({ access_token_enc: accessToken, expires_at: expiresAt, status: "connected" })
        .eq("id", account.id);
    }
  }

  return { accessToken };
}

export async function GET(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);

  // ✅ Support d'un range explicite (utile pour l'affichage calendrier)
  // - Si timeMin/timeMax sont fournis, on s'aligne dessus.
  // - Sinon, fallback sur ?days=14.
  const qTimeMin = searchParams.get("timeMin");
  const qTimeMax = searchParams.get("timeMax");

  let timeMin: string;
  let timeMax: string;

  if (qTimeMin || qTimeMax) {
    // On exige les deux pour éviter les surprises.
    if (!qTimeMin || !qTimeMax) {
      return NextResponse.json({ ok: false, error: "timeMin et timeMax sont requis ensemble" }, { status: 400 });
    }

    const tMin = Date.parse(qTimeMin);
    const tMax = Date.parse(qTimeMax);
    if (Number.isNaN(tMin) || Number.isNaN(tMax) || tMax <= tMin) {
      return NextResponse.json({ ok: false, error: "Range invalide" }, { status: 400 });
    }

    // Garde-fou perf : max 120 jours.
    const maxDays = 120;
    const diffDays = (tMax - tMin) / (24 * 3600 * 1000);
    if (diffDays > maxDays) {
      return NextResponse.json(
        { ok: false, error: `Range trop large (max ${maxDays} jours)` },
        { status: 400 }
      );
    }

    timeMin = new Date(tMin).toISOString();
    timeMax = new Date(tMax).toISOString();
  } else {
    // par défaut : événements à venir sur 14 jours
    const days = Number(searchParams.get("days") ?? "14");
    timeMin = new Date().toISOString();
    timeMax = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
  }

  const { accessToken } = await getCalendarToken(supabase, auth.user.id);

  const url =
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?" +
    new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });

  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok) return NextResponse.json({ error: "Calendar fetch failed", details: j }, { status: 502 });

  // On renvoie une version “front friendly”
  const items = Array.isArray(j.items) ? j.items : [];
  const events = items.map((e: any) => ({
    id: e.id,
    summary: e.summary ?? "(Sans titre)",
    start: e.start?.dateTime ?? e.start?.date ?? null,
    end: e.end?.dateTime ?? e.end?.date ?? null,
    location: e.location ?? null,
    htmlLink: e.htmlLink ?? null,
  }));

  return NextResponse.json({ ok: true, timeMin, timeMax, events });
}

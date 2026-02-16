import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
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
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;
  const userId = user.id;
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

  const { accessToken } = await getCalendarToken(supabase, userId);

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
    description: e.description ?? null,
    inrcy: parseInrcyBlock(e.description ?? null),
  }));

  return NextResponse.json({ ok: true, timeMin, timeMax, events });
}



type CreateEventBody = {
  summary?: string;
  description?: string;
  location?: string;
  start?: string; // ISO datetime
  end?: string;   // ISO datetime
  allDay?: boolean;
  date?: string;  // YYYY-MM-DD if allDay
  // iNrCy: meta métier (permet de transformer l'agenda en planning d'interventions)
  inrcy?: {
    kind?: "intervention" | "agenda";
    intervention?: {
      type?: string; // ex: "Dépannage", "Chantier", "Consultation"...
      status?: string; // ex: "devis", "confirmé", "en cours", "terminé"...
      address?: string;
      city?: string;
      postal_code?: string;
      reference?: string; // ref interne (optionnel)
    };
  };
  contact?: {
    id?: string;
    display_name?: string;
    email?: string;
    phone?: string;
    address?: string;
  };
};

function assertIsoDateTime(v: any) {
  if (typeof v !== "string") return false;
  const t = Date.parse(v);
  return !Number.isNaN(t);
}

function assertDateOnly(v: any) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function buildDescription(base: string, contact: any) {
  const parts: string[] = [];
  if (base && String(base).trim()) parts.push(String(base).trim());
  if (contact) {
    const lines: string[] = [];
    const name = String(contact.display_name || "").trim();
    const email = String(contact.email || "").trim();
    const phone = String(contact.phone || "").trim();
    const address = String(contact.address || "").trim();
    if (name) lines.push(`Contact : ${name}`);
    if (phone) lines.push(`Téléphone : ${phone}`);
    if (email) lines.push(`Email : ${email}`);
    if (address) lines.push(`Adresse : ${address}`);
    if (lines.length) parts.push("\n---\n" + lines.join("\n"));
  }
  return parts.join("\n\n");
}

function buildInrcyBlock(inrcy: any, contact: any) {
  const payload = {
    v: 1,
    kind: inrcy?.kind ?? undefined,
    intervention: inrcy?.intervention ?? undefined,
    contact: contact
      ? {
          id: contact?.id ?? undefined,
          display_name: contact?.display_name ?? undefined,
          email: contact?.email ?? undefined,
          phone: contact?.phone ?? undefined,
          address: contact?.address ?? undefined,
        }
      : undefined,
    ts: new Date().toISOString(),
  };

  const hasAny = Boolean(payload.kind || payload.intervention || payload.contact);
  if (!hasAny) return "";

  return `\n\n[inrcy]\n${JSON.stringify(payload)}\n[/inrcy]\n`;
}

function parseInrcyBlock(description: string | null | undefined) {
  if (!description) return null;
  const m = /\[inrcy\]\s*([\s\S]*?)\s*\[\/inrcy\]/i.exec(description);
  if (!m) return null;
  const raw = (m[1] ?? "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;
  const userId = user.id;

  const body = (await req.json().catch(() => ({}))) as CreateEventBody;

  const summary = String(body?.summary ?? "").trim() || "Rendez-vous";
  const location = String(body?.location ?? "").trim();
  const descriptionBase = buildDescription(String(body?.description ?? ""), body?.contact);
  const inrcyBlock = buildInrcyBlock(body?.inrcy, body?.contact);
  const description = (descriptionBase || "") + (inrcyBlock || "");

  let eventPayload: any = {
    summary,
    location: location || undefined,
    description: description || undefined,
  };

  const allDay = Boolean(body?.allDay);
  if (allDay) {
    const date = body?.date;
    if (!assertDateOnly(date)) {
      return NextResponse.json({ ok: false, error: "date (YYYY-MM-DD) requis pour un événement journée" }, { status: 400 });
    }
    eventPayload.start = { date };
    const d = new Date(date + "T00:00:00");
        d.setDate(d.getDate() + 1);
        const endDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        eventPayload.end = { date: endDate };
  } else {
    if (!assertIsoDateTime(body?.start) || !assertIsoDateTime(body?.end)) {
      return NextResponse.json({ ok: false, error: "start/end ISO requis" }, { status: 400 });
    }
    const start = new Date(body!.start!).toISOString();
    const end = new Date(body!.end!).toISOString();
    if (Date.parse(end) <= Date.parse(start)) {
      return NextResponse.json({ ok: false, error: "end doit être après start" }, { status: 400 });
    }
    eventPayload.start = { dateTime: start };
    eventPayload.end = { dateTime: end };
  }

  const { accessToken } = await getCalendarToken(supabase, userId);

  const r = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(eventPayload),
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: j?.error?.message ?? "Erreur Google Calendar" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, event: j });
}

export async function PATCH(req: Request) {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;
  const userId = user.id;

  const { searchParams } = new URL(req.url);
  const eventId = String(searchParams.get("id") ?? "").trim();
  if (!eventId) return NextResponse.json({ ok: false, error: "id requis" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as CreateEventBody;

  const patch: any = {};
  if (body.summary != null) patch.summary = String(body.summary).trim() || "Rendez-vous";
  if (body.location != null) patch.location = String(body.location).trim() || undefined;
  if (body.description != null || body.contact != null || body.inrcy != null) {
    const base = buildDescription(String(body.description ?? ""), body.contact);
    const inrcyBlock = buildInrcyBlock(body?.inrcy, body?.contact);
    patch.description = (base || "") + (inrcyBlock || "");
  }

  const allDay = Boolean(body?.allDay);
  if (allDay) {
    if (body.date != null) {
      if (!assertDateOnly(body.date)) {
        return NextResponse.json({ ok: false, error: "date invalide" }, { status: 400 });
      }
      patch.start = { date: body.date };
      const d = new Date(body.date + "T00:00:00");
          d.setDate(d.getDate() + 1);
          const endDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          patch.end = { date: endDate };
    }
  } else {
    if (body.start != null || body.end != null) {
      if (!assertIsoDateTime(body?.start) || !assertIsoDateTime(body?.end)) {
        return NextResponse.json({ ok: false, error: "start/end ISO requis" }, { status: 400 });
      }
      const start = new Date(body!.start!).toISOString();
      const end = new Date(body!.end!).toISOString();
      if (Date.parse(end) <= Date.parse(start)) {
        return NextResponse.json({ ok: false, error: "end doit être après start" }, { status: 400 });
      }
      patch.start = { dateTime: start };
      patch.end = { dateTime: end };
    }
  }

  const { accessToken } = await getCalendarToken(supabase, userId);

  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patch),
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: j?.error?.message ?? "Erreur Google Calendar" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, event: j });
}

export async function DELETE(req: Request) {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;
  const userId = user.id;

  const { searchParams } = new URL(req.url);
  const eventId = String(searchParams.get("id") ?? "").trim();
  if (!eventId) return NextResponse.json({ ok: false, error: "id requis" }, { status: 400 });

  const { accessToken } = await getCalendarToken(supabase, userId);

  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    return NextResponse.json({ ok: false, error: j?.error?.message ?? "Erreur Google Calendar" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

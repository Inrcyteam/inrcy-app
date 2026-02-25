import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";

/**
 * Agenda iNrCy NATIF (sans Google Calendar)
 *
 * Contrat conservé côté front :
 * - GET  /api/calendar/events?timeMin=ISO&timeMax=ISO  -> { ok:true, events: [...] }
 * - POST /api/calendar/events                         -> crée un event
 * - PATCH/DELETE via ?id=...                          -> modifie/supprime
 */

type CreateEventBody = {
  summary?: string;
  description?: string;
  location?: string;
  start?: string; // ISO datetime
  end?: string; // ISO datetime
  allDay?: boolean;
  date?: string; // YYYY-MM-DD if allDay
  inrcy?: unknown;
  contact?: unknown;
};

function assertIsoDateTime(v: unknown) {
  if (typeof v !== "string") return false;
  const t = Date.parse(v);
  return !Number.isNaN(t);
}

function assertDateOnly(v: unknown) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function normalizeAllDayRange(dateOnly: string) {
  // start inclusive, end exclusive (comme Google)
  const start = new Date(`${dateOnly}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function GET(req: Request) {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(req.url);
  const qTimeMin = searchParams.get("timeMin");
  const qTimeMax = searchParams.get("timeMax");

  if (!qTimeMin || !qTimeMax) return bad("timeMin et timeMax sont requis");
  if (!assertIsoDateTime(qTimeMin) || !assertIsoDateTime(qTimeMax)) return bad("Range invalide");

  const timeMin = new Date(qTimeMin);
  const timeMax = new Date(qTimeMax);
  if (timeMax <= timeMin) return bad("Range invalide");

  const { data, error } = await supabase
    .from("agenda_events")
    .select("id,title,description,location,start_at,end_at,all_day,meta")
    .eq("user_id", user.id)
    .lt("start_at", timeMax.toISOString())
    .gt("end_at", timeMin.toISOString())
    .order("start_at", { ascending: true })
    .limit(500);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const events = (data ?? []).map((e: Record<string, unknown>) => ({
    id: e.id,
    summary: e.title ?? "(Sans titre)",
    start: e.all_day ? (e.start_at ? String(e.start_at).slice(0, 10) : null) : e.start_at,
    end: e.all_day ? (e.end_at ? String(e.end_at).slice(0, 10) : null) : e.end_at,
    location: e.location ?? null,
    htmlLink: null,
    description: e.description ?? null,
    inrcy: e.meta ?? null,
  }));

  return NextResponse.json({
    ok: true,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    events,
  });
}

export async function POST(req: Request) {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const body = (await req.json().catch(() => ({}))) as CreateEventBody;
  const allDay = Boolean(body.allDay);

  let startAt: string;
  let endAt: string;

  if (allDay) {
    const date = body.date;
    if (!date) return bad("date (YYYY-MM-DD) requis pour allDay");
    if (!assertDateOnly(date)) return bad("date (YYYY-MM-DD) requis pour allDay");

    const r = normalizeAllDayRange(date);
    startAt = r.start;
    endAt = r.end;
  } else {
    if (!assertIsoDateTime(body.start) || !assertIsoDateTime(body.end)) return bad("start/end ISO requis");
    if (new Date(body.end!) <= new Date(body.start!)) return bad("end doit être > start");

    startAt = new Date(body.start!).toISOString();
    endAt = new Date(body.end!).toISOString();
  }

  const meta = body.inrcy ?? null;

  const { data, error } = await supabase
    .from("agenda_events")
    .insert({
      user_id: user.id,
      title: body.summary ?? "(Sans titre)",
      description: body.description ?? null,
      location: body.location ?? null,
      start_at: startAt,
      end_at: endAt,
      all_day: allDay,
      meta,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data?.id });
}

export async function PATCH(req: Request) {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return bad("id requis");

  const body = (await req.json().catch(() => ({}))) as CreateEventBody;
  const allDay = Boolean(body.allDay);

  const patch: Record<string, unknown> = {
    title: body.summary ?? undefined,
    description: body.description ?? undefined,
    location: body.location ?? undefined,
    all_day: allDay,
    meta: body.inrcy ?? undefined,
  };

  if (allDay) {
    const date = body.date;
    if (!date || !assertDateOnly(date)) return bad("date (YYYY-MM-DD) requis pour allDay");
    const r = normalizeAllDayRange(date);
    patch.start_at = r.start;
    patch.end_at = r.end;
  } else {
    if (!assertIsoDateTime(body.start) || !assertIsoDateTime(body.end)) return bad("start/end ISO requis");
    if (new Date(body.end!) <= new Date(body.start!)) return bad("end doit être > start");
    patch.start_at = new Date(body.start!).toISOString();
    patch.end_at = new Date(body.end!).toISOString();
  }

  const { error } = await supabase.from("agenda_events").update(patch).eq("id", id).eq("user_id", user.id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return bad("id requis");

  const { error } = await supabase.from("agenda_events").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

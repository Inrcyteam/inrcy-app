import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";

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

type ReminderMeta = {
  inAppMinutesBefore?: number;
  emailMinutesBefore?: number;
  lastInAppReminderAt?: string | null;
  lastEmailReminderAt?: string | null;
};

function safeObj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function buildAgendaMeta(input: unknown, previous?: unknown) {
  const next = safeObj(input);
  const prev = safeObj(previous);
  const prevReminders = safeObj(prev.reminders);
  const nextReminders = safeObj(next.reminders);

  const reminders: ReminderMeta = {
    inAppMinutesBefore: Number(nextReminders.inAppMinutesBefore ?? prevReminders.inAppMinutesBefore ?? 120),
    emailMinutesBefore: Number(nextReminders.emailMinutesBefore ?? prevReminders.emailMinutesBefore ?? 1440),
    lastInAppReminderAt: typeof prevReminders.lastInAppReminderAt === "string" ? prevReminders.lastInAppReminderAt : null,
    lastEmailReminderAt: typeof prevReminders.lastEmailReminderAt === "string" ? prevReminders.lastEmailReminderAt : null,
  };

  return {
    ...prev,
    ...next,
    reminders,
  };
}

async function createAgendaConfirmationNotification(userId: string, title: string, startAt: string) {
  const when = new Date(startAt);
  const whenLabel = Number.isFinite(when.getTime())
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(when)
    : "bientôt";

  await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    category: "information",
    kind: "agenda_event_saved",
    title: "Rendez-vous enregistré dans iNrCalendar",
    body: `“${title || "Rendez-vous"}” est bien positionné pour le ${whenLabel}. Un rappel in-app sera envoyé automatiquement avant l’échéance et les rappels email partiront 24h avant puis 2h avant au pro ainsi qu’au contact lié au rendez-vous lorsqu’un email est renseigné.`,
    cta_label: "Ouvrir l’agenda",
    cta_url: "/dashboard/agenda",
    dedupe_key: `agenda_saved:${userId}:${title}:${startAt}`,
    meta: { source: "agenda" },
  });
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

  if (error) return jsonUserFacingError(error, { status: 500, extra: { ok: false } });

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

  const meta = buildAgendaMeta(body.inrcy);

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

  if (error) return jsonUserFacingError(error, { status: 500, extra: { ok: false } });
  await createAgendaConfirmationNotification(user.id, String(body.summary ?? "(Sans titre)"), startAt).catch(() => null);
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

  const { data: current } = await supabase
    .from("agenda_events")
    .select("meta")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  const patch: Record<string, unknown> = {
    title: body.summary ?? undefined,
    description: body.description ?? undefined,
    location: body.location ?? undefined,
    all_day: allDay,
    meta: buildAgendaMeta(body.inrcy, current?.meta) ?? undefined,
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

  if (error) return jsonUserFacingError(error, { status: 500, extra: { ok: false } });
  await createAgendaConfirmationNotification(user.id, String(body.summary ?? "(Sans titre)"), String(patch.start_at ?? body.start ?? "")).catch(() => null);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return bad("id requis");

  const { error } = await supabase.from("agenda_events").delete().eq("id", id).eq("user_id", user.id);
  if (error) return jsonUserFacingError(error, { status: 500, extra: { ok: false } });
  return NextResponse.json({ ok: true });
}

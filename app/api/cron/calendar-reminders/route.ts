import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendTxMail } from "@/lib/txMailer";
import { optionalEnv } from "@/lib/env";

export const runtime = "nodejs";

function isAuthorizedCron(req: Request) {
  const cronSecret = process.env.VERCEL_CRON_SECRET || process.env.CRON_SECRET || "";
  if (!cronSecret) return false;
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerSecret = (req.headers.get("x-cron-secret") || "").trim();
  const querySecret = new URL(req.url).searchParams.get("secret") || "";
  return bearer === cronSecret || headerSecret === cronSecret || querySecret === cronSecret;
}

function safeObj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asNumber(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short" }).format(d)
    : iso;
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const horizon = new Date(now.getTime() + 48 * 3600 * 1000).toISOString();
  const smtpConfigured = Boolean(optionalEnv("TX_SMTP_HOST") && optionalEnv("TX_SMTP_PORT") && optionalEnv("TX_SMTP_USER") && optionalEnv("TX_SMTP_PASS"));

  const { data, error } = await supabaseAdmin
    .from("agenda_events")
    .select("id, user_id, title, description, location, start_at, end_at, all_day, meta")
    .gte("start_at", now.toISOString())
    .lte("start_at", horizon)
    .order("start_at", { ascending: true })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let inAppSent = 0;
  let emailSent = 0;

  for (const row of data ?? []) {
    const meta = safeObj(row.meta);
    const reminders = safeObj(meta.reminders);
    const startAt = new Date(String(row.start_at));
    if (!Number.isFinite(startAt.getTime())) continue;
    const minutesUntil = Math.round((startAt.getTime() - now.getTime()) / 60000);
    if (minutesUntil < 0) continue;

    const inAppMinutesBefore = asNumber(reminders.inAppMinutesBefore, 120);
    const emailMinutesBefore = asNumber(reminders.emailMinutesBefore, 1440);
    const lastInAppReminderAt = typeof reminders.lastInAppReminderAt === "string" ? reminders.lastInAppReminderAt : null;
    const lastEmailReminderAt = typeof reminders.lastEmailReminderAt === "string" ? reminders.lastEmailReminderAt : null;

    let nextMeta = meta;
    let dirty = false;

    if (!lastInAppReminderAt && minutesUntil <= inAppMinutesBefore) {
      const { error: notificationError } = await supabaseAdmin.from("notifications").insert({
        user_id: row.user_id,
        category: "action",
        kind: "agenda_rappel",
        title: `Rappel rendez-vous : ${row.title || "Rendez-vous"}`,
        body: `Votre rendez-vous est prévu le ${fmtDate(String(row.start_at))}${row.location ? ` à ${row.location}` : ""}.`,
        cta_label: "Ouvrir l’agenda",
        cta_url: "/dashboard/agenda",
        dedupe_key: `agenda:inapp:${row.id}:${String(row.start_at)}`,
        meta: { source: "agenda", event_id: row.id },
      });
      if (!notificationError) {
        inAppSent += 1;
        nextMeta = { ...nextMeta, reminders: { ...reminders, lastInAppReminderAt: now.toISOString(), lastEmailReminderAt } };
        dirty = true;
      }
    }

    if (smtpConfigured && !lastEmailReminderAt && minutesUntil <= emailMinutesBefore) {
      const contact = safeObj(safeObj(meta.inrcy).contact);
      const recipient = String(contact.email || "").trim();
      if (recipient) {
        const subject = `Rappel de rendez-vous — ${row.title || "iNrCalendar"}`;
        const text = [
          `Bonjour,`,
          "",
          `Petit rappel : votre rendez-vous "${row.title || "Rendez-vous"}" est prévu le ${fmtDate(String(row.start_at))}.`,
          row.location ? `Lieu : ${row.location}` : "",
          row.description ? `Détails : ${row.description}` : "",
          "",
          "Message envoyé automatiquement par iNrCalendar.",
        ].filter(Boolean).join(`\n`);
        const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#0f172a"><p>Bonjour,</p><p>Petit rappel : votre rendez-vous <b>${String(row.title || "Rendez-vous")}</b> est prévu le <b>${fmtDate(String(row.start_at))}</b>.</p>${row.location ? `<p><b>Lieu :</b> ${String(row.location)}</p>` : ""}${row.description ? `<p><b>Détails :</b> ${String(row.description)}</p>` : ""}<p>Message envoyé automatiquement par iNrCalendar.</p></div>`;
        await sendTxMail({ to: recipient, subject, text, html }).catch(() => null);
        emailSent += 1;
        nextMeta = { ...nextMeta, reminders: { ...safeObj(nextMeta.reminders), lastEmailReminderAt: now.toISOString(), lastInAppReminderAt: safeObj(nextMeta.reminders).lastInAppReminderAt ?? lastInAppReminderAt } };
        dirty = true;
      }
    }

    if (dirty) {
      await supabaseAdmin.from("agenda_events").update({ meta: nextMeta }).eq("id", row.id);
    }
  }

  return NextResponse.json({ ok: true, scanned: (data ?? []).length, inAppSent, emailSent });
}

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendTxMail } from "@/lib/txMailer";
import { optionalEnv } from "@/lib/env";

export const runtime = "nodejs";

const EMAIL_REMINDER_OFFSETS_MINUTES = [1440, 120] as const;

type RecipientKind = "pro" | "contact";

type RecipientInfo = {
  kind: RecipientKind;
  email: string;
  label: string;
  firstName?: string | null;
  companyName?: string | null;
};

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

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function offsetLabel(minutes: number) {
  if (minutes === 1440) return "24h avant";
  if (minutes === 120) return "2h avant";
  if (minutes % 60 === 0) return `${minutes / 60}h avant`;
  return `${minutes} min avant`;
}

async function getProRecipient(userId: string): Promise<RecipientInfo | null> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("contact_email, first_name, company_legal_name")
    .eq("user_id", userId)
    .maybeSingle();

  const row = safeObj(profile);
  const profileEmail = normalizeEmail(row.contact_email);
  if (profileEmail) {
    return {
      kind: "pro",
      email: profileEmail,
      label: "pro",
      firstName: typeof row.first_name === "string" ? row.first_name : null,
      companyName: typeof row.company_legal_name === "string" ? row.company_legal_name : null,
    };
  }

  const adminUser = await supabaseAdmin.auth.admin.getUserById(userId).catch(() => null);
  const authEmail = normalizeEmail(adminUser?.data?.user?.email);
  if (!authEmail) return null;

  return {
    kind: "pro",
    email: authEmail,
    label: "pro",
    firstName: typeof row.first_name === "string" ? row.first_name : null,
    companyName: typeof row.company_legal_name === "string" ? row.company_legal_name : null,
  };
}

function getContactRecipient(meta: Record<string, unknown>): RecipientInfo | null {
  const contact = safeObj(safeObj(meta.inrcy).contact);
  const email = normalizeEmail(contact.email);
  if (!email) return null;
  return {
    kind: "contact",
    email,
    label: "client",
    firstName: typeof contact.first_name === "string" ? contact.first_name : null,
    companyName: typeof contact.company_name === "string" ? contact.company_name : null,
  };
}

function buildRecipients(pro: RecipientInfo | null, contact: RecipientInfo | null) {
  const unique = new Map<string, RecipientInfo>();
  for (const recipient of [pro, contact]) {
    if (!recipient?.email) continue;
    if (unique.has(recipient.email)) continue;
    unique.set(recipient.email, recipient);
  }
  return Array.from(unique.values());
}

function getRecipientSentAt(reminders: Record<string, unknown>, kind: RecipientKind, offsetMinutes: number) {
  const sentAtByRecipient = safeObj(reminders.emailSentAtByRecipient);
  const sentAtByOffset = safeObj(sentAtByRecipient[kind]);
  const current = sentAtByOffset[String(offsetMinutes)];
  if (typeof current === "string" && current.trim()) return current;

  if (offsetMinutes === 1440 && typeof reminders.lastEmailReminderAt === "string" && reminders.lastEmailReminderAt.trim()) {
    return reminders.lastEmailReminderAt;
  }

  return null;
}

function markRecipientSent(
  reminders: Record<string, unknown>,
  kind: RecipientKind,
  offsetMinutes: number,
  sentAtIso: string,
) {
  const sentAtByRecipient = safeObj(reminders.emailSentAtByRecipient);
  const sentAtByOffset = safeObj(sentAtByRecipient[kind]);

  return {
    ...reminders,
    emailSentAtByRecipient: {
      ...sentAtByRecipient,
      [kind]: {
        ...sentAtByOffset,
        [String(offsetMinutes)]: sentAtIso,
      },
    },
    lastEmailReminderAt: offsetMinutes === 1440 ? sentAtIso : reminders.lastEmailReminderAt ?? null,
  };
}

function buildReminderMail(row: { title: string | null; description: string | null; location: string | null; start_at: string | null }, offsetMinutes: number, recipient: RecipientInfo) {
  const greetingName = (recipient.firstName || recipient.companyName || "").trim();
  const greeting = greetingName ? `Bonjour ${greetingName},` : "Bonjour,";
  const subject = `Rappel de rendez-vous ${offsetLabel(offsetMinutes)} — ${row.title || "iNrCalendar"}`;
  const intro = recipient.kind === "pro"
    ? `Petit rappel : votre rendez-vous "${row.title || "Rendez-vous"}" est prévu le ${fmtDate(String(row.start_at))}.`
    : `Petit rappel : votre rendez-vous "${row.title || "Rendez-vous"}" est prévu le ${fmtDate(String(row.start_at))}.`;

  const text = [
    greeting,
    "",
    intro,
    row.location ? `Lieu : ${row.location}` : "",
    row.description ? `Détails : ${row.description}` : "",
    "",
    `Rappel envoyé automatiquement par iNrCalendar (${offsetLabel(offsetMinutes)}).`,
  ].filter(Boolean).join("\n");

  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#0f172a"><p>${greeting}</p><p>Petit rappel : votre rendez-vous <b>${String(row.title || "Rendez-vous")}</b> est prévu le <b>${fmtDate(String(row.start_at))}</b>.</p>${row.location ? `<p><b>Lieu :</b> ${String(row.location)}</p>` : ""}${row.description ? `<p><b>Détails :</b> ${String(row.description)}</p>` : ""}<p>Rappel envoyé automatiquement par iNrCalendar (${offsetLabel(offsetMinutes)}).</p></div>`;

  return { subject, text, html };
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "Accès non autorisé." }, { status: 401 });

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
    const lastInAppReminderAt = typeof reminders.lastInAppReminderAt === "string" ? reminders.lastInAppReminderAt : null;

    let nextMeta: Record<string, unknown> = meta;
    let nextReminders: Record<string, unknown> = reminders;
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
        nextReminders = { ...nextReminders, lastInAppReminderAt: now.toISOString() };
        nextMeta = { ...nextMeta, reminders: nextReminders };
        dirty = true;
      }
    }

    if (smtpConfigured) {
      const proRecipient = await getProRecipient(String(row.user_id));
      const contactRecipient = getContactRecipient(meta);
      const recipients = buildRecipients(proRecipient, contactRecipient);

      for (const offsetMinutes of EMAIL_REMINDER_OFFSETS_MINUTES) {
        if (minutesUntil > offsetMinutes) continue;

        for (const recipient of recipients) {
          const alreadySentAt = getRecipientSentAt(nextReminders, recipient.kind, offsetMinutes);
          if (alreadySentAt) continue;

          const mail = buildReminderMail(row, offsetMinutes, recipient);
          try {
            await sendTxMail({ to: recipient.email, subject: mail.subject, text: mail.text, html: mail.html });
            emailSent += 1;
            nextReminders = markRecipientSent(nextReminders, recipient.kind, offsetMinutes, now.toISOString());
            nextMeta = { ...nextMeta, reminders: nextReminders };
            dirty = true;
          } catch (mailError) {
            console.error("[calendar-reminders] sendTxMail failed", {
              eventId: row.id,
              recipient: recipient.email,
              kind: recipient.kind,
              offsetMinutes,
              error: mailError,
            });
          }
        }
      }
    }

    if (dirty) {
      await supabaseAdmin.from("agenda_events").update({ meta: nextMeta }).eq("id", row.id);
    }
  }

  return NextResponse.json({ ok: true, scanned: (data ?? []).length, inAppSent, emailSent });
}

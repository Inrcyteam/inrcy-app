import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendTxMail } from "@/lib/txMailer";
import { optionalEnv } from "@/lib/env";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { sendMailFromIntegration } from "@/lib/inrsend/sendMailFromIntegration";

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

const AGENDA_TIMEZONE = "Europe/Paris";

function fmtDate(iso: string) {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: AGENDA_TIMEZONE,
      }).format(d)
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


function getReminderMailAccountId(meta: Record<string, unknown>) {
  const reminders = safeObj(meta.reminders);
  const value = reminders.mailAccountId;
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function getSelectedMailAccountIdFromSettings(settings: unknown) {
  const root = safeObj(settings);
  const inrcalendar = safeObj(root.inrcalendar);
  const value = inrcalendar.selected_mail_account_id;
  return typeof value === "string" && value.trim() ? value.trim() : "";
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

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildReminderMail(row: { title: string | null; description: string | null; location: string | null; start_at: string | null }, offsetMinutes: number, recipient: RecipientInfo) {
  const greetingName = (recipient.firstName || recipient.companyName || "").trim();
  const greeting = greetingName ? `Bonjour ${greetingName},` : "Bonjour,";
  const subject = `Rappel de rendez-vous ${offsetLabel(offsetMinutes)} — ${row.title || "iNrCalendar"}`;
  const eventTitle = String(row.title || "Rendez-vous");
  const formattedDate = fmtDate(String(row.start_at));
  const reminderLabel = offsetLabel(offsetMinutes);
  const intro = recipient.kind === "pro"
    ? `Petit rappel : votre rendez-vous "${eventTitle}" est prévu le ${formattedDate}.`
    : `Petit rappel : votre rendez-vous "${eventTitle}" est prévu le ${formattedDate}.`;

  const text = [
    greeting,
    "",
    intro,
    row.location ? `Lieu : ${row.location}` : "",
    row.description ? `Détails : ${row.description}` : "",
    "",
    `Ce rappel vous est envoyé automatiquement par iNrCalendar (${reminderLabel}).`,
  ].filter(Boolean).join("\n");

  const safeTitle = escapeHtml(eventTitle);
  const safeGreeting = escapeHtml(greeting);
  const safeDate = escapeHtml(formattedDate);
  const safeLocation = row.location ? escapeHtml(row.location) : "";
  const safeDescription = row.description ? escapeHtml(row.description).replace(/\n/g, "<br />") : "";
  const safeReminderLabel = escapeHtml(reminderLabel);

  const html = `
  <div style="margin:0;padding:32px 16px;background:linear-gradient(135deg,#081225 0%,#101935 55%,#1f1740 100%);font-family:Arial,sans-serif;color:#e5eefc;">
    <div style="max-width:640px;margin:0 auto;">
      <div style="margin-bottom:16px;color:#cbd5e1;font-size:13px;letter-spacing:.08em;text-transform:uppercase;">iNrCy · iNrCalendar</div>
      <div style="background:rgba(9,15,30,.88);border:1px solid rgba(148,163,184,.18);border-radius:24px;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.35);">
        <div style="padding:28px 28px 16px;background:linear-gradient(135deg,rgba(56,189,248,.16),rgba(168,85,247,.16));border-bottom:1px solid rgba(148,163,184,.14);">
          <div style="display:inline-block;padding:7px 12px;border-radius:999px;background:rgba(255,255,255,.08);font-size:12px;font-weight:700;letter-spacing:.04em;color:#dbeafe;">RAPPEL ${safeReminderLabel.toUpperCase()}</div>
          <h1 style="margin:16px 0 8px;font-size:28px;line-height:1.2;color:#ffffff;">${safeTitle}</h1>
          <p style="margin:0;font-size:15px;line-height:1.7;color:#cbd5e1;">${safeGreeting}<br />Nous vous confirmons votre rendez-vous prévu le <strong style="color:#ffffff;">${safeDate}</strong>.</p>
        </div>

        <div style="padding:24px 28px 8px;">
          <div style="background:rgba(15,23,42,.66);border:1px solid rgba(148,163,184,.14);border-radius:18px;padding:18px 18px 4px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
              <tr>
                <td style="padding:0 0 14px;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#94a3b8;">Date et heure</td>
              </tr>
              <tr>
                <td style="padding:0 0 18px;font-size:18px;font-weight:700;color:#ffffff;">${safeDate}</td>
              </tr>
              ${safeLocation ? `<tr><td style="padding:0 0 10px;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#94a3b8;">Lieu</td></tr><tr><td style="padding:0 0 18px;font-size:15px;line-height:1.6;color:#e2e8f0;">${safeLocation}</td></tr>` : ""}
              ${safeDescription ? `<tr><td style="padding:0 0 10px;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#94a3b8;">Détails</td></tr><tr><td style="padding:0 0 18px;font-size:15px;line-height:1.7;color:#e2e8f0;">${safeDescription}</td></tr>` : ""}
            </table>
          </div>
        </div>

        <div style="padding:8px 28px 28px;">
          <p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#cbd5e1;">Merci de prévoir quelques minutes d’avance si nécessaire. En cas d’imprévu, pensez à prévenir votre contact dès que possible.</p>
          <p style="margin:0;font-size:12px;line-height:1.7;color:#94a3b8;">Ce rappel vous est envoyé automatiquement par iNrCalendar (${safeReminderLabel}).</p>
        </div>
      </div>
    </div>
  </div>`;

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

  if (error) return jsonUserFacingError(error, { status: 500 });

  let inAppSent = 0;
  let emailSent = 0;
  const userMailAccountCache = new Map<string, string>();

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

    const proRecipient = await getProRecipient(String(row.user_id));
    const contactRecipient = getContactRecipient(meta);
    const recipients = buildRecipients(proRecipient, contactRecipient);

    let selectedMailAccountId = getReminderMailAccountId(meta);
    if (!selectedMailAccountId) {
      if (userMailAccountCache.has(String(row.user_id))) {
        selectedMailAccountId = userMailAccountCache.get(String(row.user_id)) || "";
      } else {
        const { data: cfg } = await supabaseAdmin.from("pro_tools_configs").select("settings").eq("user_id", String(row.user_id)).maybeSingle();
        selectedMailAccountId = getSelectedMailAccountIdFromSettings(cfg?.settings);
        userMailAccountCache.set(String(row.user_id), selectedMailAccountId);
      }
    }

    for (const offsetMinutes of EMAIL_REMINDER_OFFSETS_MINUTES) {
      if (minutesUntil > offsetMinutes) continue;

      for (const recipient of recipients) {
        const alreadySentAt = getRecipientSentAt(nextReminders, recipient.kind, offsetMinutes);
        if (alreadySentAt) continue;

        const mail = buildReminderMail(row, offsetMinutes, recipient);
        try {
          if (recipient.kind === "contact" && selectedMailAccountId) {
            await sendMailFromIntegration({
              userId: String(row.user_id),
              accountId: selectedMailAccountId,
              to: recipient.email,
              subject: mail.subject,
              text: mail.text,
              html: mail.html,
            });
          } else {
            if (!smtpConfigured) continue;
            await sendTxMail({ to: recipient.email, subject: mail.subject, text: mail.text, html: mail.html });
          }

          emailSent += 1;
          nextReminders = markRecipientSent(nextReminders, recipient.kind, offsetMinutes, now.toISOString());
          nextMeta = { ...nextMeta, reminders: nextReminders };
          dirty = true;
        } catch (mailError) {
          console.error("[calendar-reminders] reminder send failed", {
            eventId: row.id,
            recipient: recipient.email,
            kind: recipient.kind,
            offsetMinutes,
            via: recipient.kind === "contact" && selectedMailAccountId ? "inrsend" : "inrcy",
            error: mailError,
          });
        }
      }
    }

    if (dirty) {
      await supabaseAdmin.from("agenda_events").update({ meta: nextMeta }).eq("id", row.id);
    }
  }

  return NextResponse.json({ ok: true, scanned: (data ?? []).length, inAppSent, emailSent });
}

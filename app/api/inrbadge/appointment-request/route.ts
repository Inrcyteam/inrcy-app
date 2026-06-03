import { NextResponse } from "next/server";
import { optionalEnv } from "@/lib/env";
import { extractInrBadgeUserIdFromSlug } from "@/lib/inrBadge";
import { normalizeInrBadgeShareSettings, resolveInrBadgeAppointmentSettings } from "@/lib/inrBadgeSettings";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendTxMail } from "@/lib/txMailer";

type RequestBody = {
  slug?: string;
  start?: string;
  end?: string;
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function safeObj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(new Date(iso));
}

function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date(iso));
}

function parseMinutes(value: string) {
  const [h, m] = value.split(":").map((item) => Number(item));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function timeInParisParts(date: Date) {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value || "0");
  const weekdayLabel = String(parts.find((part) => part.type === "weekday")?.value || "").toLowerCase();
  const weekdayMap: Record<string, number> = { dim: 0, lun: 1, mar: 2, mer: 3, jeu: 4, ven: 5, sam: 6 };
  return { minutes: hour * 60 + minute, weekday: weekdayMap[weekdayLabel.slice(0, 3)] ?? date.getDay() };
}


function getAppointmentDaySettings(settings: ReturnType<typeof resolveInrBadgeAppointmentSettings>, weekday: number) {
  return settings.dailySlots[String(weekday)] || {
    enabled: settings.weekdays.includes(weekday),
    startTime: settings.startTime,
    endTime: settings.endTime,
    durationMinutes: settings.durationMinutes,
  };
}

function getBaseUrl(req: Request) {
  return String(
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_INRBADGE_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    new URL(req.url).origin ||
    "https://app.inrcy.com"
  ).replace(/\/+$/, "");
}

function hasSmtpConfig() {
  return Boolean(optionalEnv("TX_SMTP_HOST") && optionalEnv("TX_SMTP_PORT") && optionalEnv("TX_SMTP_USER") && optionalEnv("TX_SMTP_PASS"));
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as RequestBody;
  const slug = clean(body.slug);
  const userId = extractInrBadgeUserIdFromSlug(slug);
  if (!userId) return bad("Badge introuvable", 404);

  const start = new Date(clean(body.start));
  const end = new Date(clean(body.end));
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return bad("Créneau invalide");

  const clientName = clean(body.name);
  const clientEmail = clean(body.email).toLowerCase();
  const clientPhone = clean(body.phone);
  const message = clean(body.message);
  if (!clientName) return bad("Nom obligatoire");
  if (!isEmail(clientEmail)) return bad("Email invalide");

  const [profileRes, toolsRes] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("company_legal_name,contact_email,first_name,phone")
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("pro_tools_configs")
      .select("settings")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (profileRes.error || !profileRes.data) return bad("Professionnel introuvable", 404);
  const rootSettings = safeObj((toolsRes.data as { settings?: unknown } | null)?.settings);
  const shareSettings = normalizeInrBadgeShareSettings(rootSettings.inrBadgeShareSettings);
  const appointmentSettings = resolveInrBadgeAppointmentSettings(rootSettings);
  if (!shareSettings.appointment) return bad("La prise de RDV n'est pas activée", 403);

  const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);

  const minDate = new Date(Date.now() + appointmentSettings.minNoticeHours * 60 * 60 * 1000);
  if (start < minDate) return bad("Ce créneau n'est plus disponible");

  const paris = timeInParisParts(start);
  const daySettings = getAppointmentDaySettings(appointmentSettings, paris.weekday);
  const startMinutes = parseMinutes(daySettings.startTime);
  const endMinutes = parseMinutes(daySettings.endTime);
  if (!daySettings.enabled) return bad("Ce jour n'est pas ouvert à la réservation");
  if (durationMinutes !== daySettings.durationMinutes) return bad("Durée du créneau invalide");
  if (paris.minutes < startMinutes || paris.minutes + durationMinutes > endMinutes) return bad("Ce créneau n'est pas dans les horaires proposés");
  if ((paris.minutes - startMinutes) % daySettings.durationMinutes !== 0) return bad("Ce créneau n'est pas proposé");

  const { data: conflicts, error: conflictsError } = await supabaseAdmin
    .from("agenda_events")
    .select("id")
    .eq("user_id", userId)
    .lt("start_at", end.toISOString())
    .gt("end_at", start.toISOString())
    .limit(1);

  if (conflictsError) return bad("Impossible de vérifier les disponibilités", 500);
  if ((conflicts || []).length > 0) return bad("Ce créneau vient d'être réservé. Choisissez un autre horaire.");

  const profile = profileRes.data as Record<string, unknown>;
  const company = clean(profile.company_legal_name) || "Votre entreprise";
  const proEmail = clean(profile.contact_email) || clean((await supabaseAdmin.auth.admin.getUserById(userId).catch(() => null))?.data?.user?.email);
  if (!proEmail) return bad("Email professionnel introuvable", 500);

  const baseUrl = getBaseUrl(req);
  const query = new URLSearchParams({
    action: "new",
    rdvDate: start.toISOString().slice(0, 10),
    rdvStart: fmtTime(start.toISOString()),
    rdvEnd: fmtTime(end.toISOString()),
    summary: `RDV iNr'Badge - ${clientName}`,
    contactName: clientName,
    contactEmail: clientEmail,
    contactPhone: clientPhone,
    notes: message ? `Demande depuis iNr'Badge\n\n${message}` : "Demande depuis iNr'Badge",
  });
  const acceptUrl = `${baseUrl}/dashboard/agenda?${query.toString()}`;
  const dateLabel = fmtDate(start.toISOString());
  const timeLabel = `${fmtTime(start.toISOString())} → ${fmtTime(end.toISOString())}`;

  const subject = `Nouvelle demande de RDV iNr'Badge - ${clientName}`;
  const text = [
    `Nouvelle demande de rendez-vous pour ${company}`,
    "",
    `Client : ${clientName}`,
    `Email : ${clientEmail}`,
    clientPhone ? `Téléphone : ${clientPhone}` : "",
    `Date : ${dateLabel}`,
    `Horaire : ${timeLabel}`,
    message ? `Message : ${message}` : "",
    "",
    `Valider dans iNrCalendar : ${acceptUrl}`,
    "",
    "Le rendez-vous ne sera enregistré qu'après validation dans iNrCalendar.",
  ].filter(Boolean).join("\n");

  const html = `<!doctype html><html lang="fr"><body style="margin:0;padding:0;background:#041126;font-family:Arial,Helvetica,sans-serif;color:#e7eefc;">
  <div style="max-width:640px;margin:0 auto;padding:28px 14px;">
    <div style="border-radius:26px;background:linear-gradient(135deg,#0b2450,#071736 58%,#2c1f6a);border:1px solid rgba(120,143,190,.24);padding:26px;">
      <div style="color:#93c5fd;font-weight:800;font-size:13px;letter-spacing:.04em;">iNr'Badge → iNr'Calendar</div>
      <h1 style="margin:16px 0 8px;color:#fff;font-size:28px;line-height:1.15;">Nouvelle demande de RDV</h1>
      <p style="margin:0 0 18px;line-height:1.6;">Un prospect a choisi un créneau depuis votre iNr'Badge. Le rendez-vous n'est pas encore enregistré : vous pouvez le valider dans iNr'Calendar.</p>
      <div style="background:#0d1630;border:1px solid rgba(148,163,184,.16);border-radius:20px;padding:18px;margin:18px 0;">
        <p><strong>Client :</strong> ${escapeHtml(clientName)}</p>
        <p><strong>Email :</strong> ${escapeHtml(clientEmail)}</p>
        ${clientPhone ? `<p><strong>Téléphone :</strong> ${escapeHtml(clientPhone)}</p>` : ""}
        <p><strong>Date :</strong> ${escapeHtml(dateLabel)}</p>
        <p><strong>Horaire :</strong> ${escapeHtml(timeLabel)}</p>
        ${message ? `<p><strong>Message :</strong><br />${escapeHtml(message).replace(/\n/g, "<br />")}</p>` : ""}
      </div>
      <a href="${escapeHtml(acceptUrl)}" style="display:inline-block;background:#8b5cf6;color:#fff;text-decoration:none;font-weight:900;border-radius:999px;padding:13px 18px;">Valider dans iNrCalendar</a>
      <p style="color:#97a6c5;font-size:12px;line-height:1.6;margin-top:18px;">Pour refuser, répondez simplement au client par mail.</p>
    </div>
  </div>
</body></html>`;

  let mailSent = false;
  if (hasSmtpConfig()) {
    await sendTxMail({ to: proEmail, subject, text, html }).then(() => { mailSent = true; }).catch((error) => {
      console.error("[inrbadge-appointment-request] mail failed", error);
    });
  }

  const { error: notificationError } = await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    category: "information",
    kind: "inrbadge_appointment_request",
    title: "Nouvelle demande de RDV iNr'Badge",
    body: `${clientName} souhaite un rendez-vous le ${dateLabel} à ${fmtTime(start.toISOString())}.`,
    cta_label: "Valider dans l'agenda",
    cta_url: `/dashboard/agenda?${query.toString()}`,
    dedupe_key: `inrbadge_rdv:${userId}:${start.toISOString()}:${clientEmail}`,
    meta: { source: "inrbadge", clientName, clientEmail, clientPhone, start: start.toISOString(), end: end.toISOString(), mailSent },
  });

  if (notificationError) {
    console.warn("[inrbadge-appointment-request] notification insert failed", notificationError);
  }

  return NextResponse.json({ ok: true, mailSent });
}

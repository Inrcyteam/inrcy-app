import { NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { getCronSecret } from "@/lib/cronAuth";
import { resolveInrAgentActionRequest } from "@/lib/inrAgentRequest";
import { enforceRateLimit } from "@/lib/rateLimit";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendTxMail } from "@/lib/txMailer";
import { getInrcyBrandInlineAttachments } from "@/lib/txEmailAssets";
import { openaiGenerateJSON } from "@/lib/openaiClient";
import {
  sanitizeInrAgentAutomationSettings,
  type InrAgentAutomationSettings,
  type InrAgentTheme,
} from "@/lib/inrAgentSettings";
import { rowToInrAgentAction } from "@/lib/inrAgentActions";

export const runtime = "nodejs";
export const maxDuration = 180;

type JsonRecord = Record<string, unknown>;

type AutomationDbRow = {
  enabled?: boolean | null;
  frequency?: string | null;
  day_of_week?: number | null;
  time?: string | null;
  validation_mode?: string | null;
  allowed_channels?: string[] | null;
  allowed_themes?: string[] | null;
  use_image_bank?: boolean | null;
  image_required?: boolean | null;
  recipient_scope?: string | null;
  source_strategy?: string | null;
  last_prepared_at?: string | null;
  last_executed_at?: string | null;
  next_run_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

type ChannelReportLine = {
  key: string;
  label: string;
  connected: boolean;
  statsConnected: boolean;
  statusLabel: string;
  opportunities: number;
  capturedWeek: number;
  capturedMonth: number;
  estimatedValue: number;
  error: string | null;
  recommendation: string;
};

type MailReport = {
  connectedCount: number;
  maxAccounts: number;
  contactsEmail: number;
  campagnes30: number;
  campagnesTotal: number;
  destinataires30: number;
  destinatairesTotal: number;
  propulsions30: number;
  fidelisations30: number;
  mailsSimples30: number;
  agendaReminders30: number;
  factures30: number;
  devis30: number;
};

type BadgeReport = {
  views30: number;
  qrScans30: number;
  actions30: number;
  leads30: number;
  appointments30: number;
  capturedLeads30: number;
  qualityScore: number;
  opportunity30: number;
};

type StatsReportData = {
  generatedAt: string;
  periodDays: number;
  recipientEmail: string;
  companyName: string;
  proName: string;
  channels: ChannelReportLine[];
  mail: MailReport | null;
  badge: BadgeReport | null;
  totals: {
    connectedChannels: number;
    statsConnectedChannels: number;
    opportunities: number;
    capturedLeadsMonth: number;
    estimatedValue: number;
  };
};

type StatsAiInsights = Record<string, unknown> & {
  globalSummary?: string;
  strengths?: string[];
  weaknesses?: string[];
  recommendations?: string[];
  channelNotes?: Record<string, string>;
};

const ACTION_SELECT =
  "id, automation_key, action_type, target_tool, title, summary, preview_text, target_channels, target_themes, recipients, image_assets, payload, validation_required, execution_policy, status, scheduled_for, prepared_at, validated_at, refused_at, completed_at, last_error, created_at, updated_at";

const channelLabels: Record<string, string> = {
  site_inrcy: "Site iNrCy",
  site_web: "Site Web",
  gmb: "Google Business",
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube_shorts: "YouTube Shorts",
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function cleanText(value: unknown, maxLength = 1000) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function cleanEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(email) ? email : "";
}

function safeNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("fr-FR").format(Math.max(0, Math.round(value)));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(value)));
}

function formatDateFr(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function escapeHtml(value: unknown) {
  return cleanText(value, 2000)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function rowToAutomationSettings(row: AutomationDbRow | null): InrAgentAutomationSettings {
  return sanitizeInrAgentAutomationSettings("stats", {
    enabled: row?.enabled ?? undefined,
    frequency: row?.frequency as InrAgentAutomationSettings["frequency"],
    dayOfWeek: row?.day_of_week ?? undefined,
    time: row?.time ?? undefined,
    validationMode: row?.validation_mode as InrAgentAutomationSettings["validationMode"],
    allowedChannels: row?.allowed_channels as InrAgentAutomationSettings["allowedChannels"],
    allowedThemes: row?.allowed_themes as InrAgentAutomationSettings["allowedThemes"],
    useImageBank: row?.use_image_bank ?? undefined,
    imageRequired: row?.image_required ?? undefined,
    recipientScope: row?.recipient_scope as InrAgentAutomationSettings["recipientScope"],
    sourceStrategy: row?.source_strategy as InrAgentAutomationSettings["sourceStrategy"],
    lastPreparedAt: row?.last_prepared_at ?? null,
    lastExecutedAt: row?.last_executed_at ?? null,
    nextRunAt: row?.next_run_at ?? null,
    metadata: row?.metadata ?? {},
  });
}

async function loadStatsAutomationSettings(userId: string) {
  const { data } = await supabaseAdmin
    .from("inr_agent_automation_settings")
    .select(
      "enabled, frequency, day_of_week, time, validation_mode, allowed_channels, allowed_themes, use_image_bank, image_required, recipient_scope, source_strategy, last_prepared_at, last_executed_at, next_run_at, metadata",
    )
    .eq("user_id", userId)
    .eq("automation_key", "stats")
    .maybeSingle();

  return rowToAutomationSettings((data as AutomationDbRow | null) ?? null);
}

async function fetchJson<T>(url: string, args: { cookie: string; cronUserId?: string }): Promise<{ data: T | null; error: string | null }> {
  try {
    const headers: Record<string, string> = {};
    if (args.cookie) headers.cookie = args.cookie;
    if (args.cronUserId) {
      headers["x-inr-agent-user-id"] = args.cronUserId;
      const cronSecret = getCronSecret();
      if (cronSecret) {
        headers["x-cron-secret"] = cronSecret;
        headers.authorization = `Bearer ${cronSecret}`;
      }
    }

    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: Object.keys(headers).length ? headers : undefined,
    });
    const payload = (await response.json().catch(() => null)) as T | JsonRecord | null;
    if (!response.ok) {
      const record = asRecord(payload);
      return { data: null, error: cleanText(record.error || record.message || response.statusText, 400) };
    }
    return { data: payload as T, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "Chargement impossible",
    };
  }
}

function buildChannelRecommendation(line: Omit<ChannelReportLine, "recommendation">) {
  if (!line.connected) return "Canal non connecté : à brancher pour enrichir le bilan.";
  if (!line.statsConnected) return "Compte connecté, mais statistiques à reconnecter ou à actualiser.";
  if (line.error) return "Statistiques partiellement disponibles : vérifier la connexion du canal.";
  if (line.capturedMonth > 0) return "Canal actif : continuer et reproduire les contenus qui déclenchent des demandes.";
  if (line.opportunities >= 10) return "Visibilité présente : ajouter un appel à l'action plus direct pour convertir.";
  return "Canal à nourrir avec plus de régularité cette période.";
}

function statsThemeToChannelKey(theme: InrAgentTheme) {
  if (theme === "youtube") return "youtube_shorts";
  return Object.prototype.hasOwnProperty.call(channelLabels, theme) ? theme : "";
}

function normalizeChannelReports(bulk: JsonRecord | null, allowedThemes: InrAgentTheme[]): ChannelReportLine[] {
  const rawBlocks = asRecord(bulk?.blocks);
  const selected = allowedThemes.includes("vue_globale")
    ? Object.keys(channelLabels)
    : allowedThemes.map(statsThemeToChannelKey).filter(Boolean);
  const channelKeys = selected.length ? Array.from(new Set(selected)) : Object.keys(channelLabels);

  return channelKeys.map((key) => {
    const block = asRecord(rawBlocks[key]);
    const connection = asRecord(block.connection);
    const connected = Boolean(connection.connected || connection.accountConnected);
    const statsConnected = Boolean(connection.statsConnected);
    const error = cleanText(block.error, 240) || null;
    const lineWithoutRecommendation = {
      key,
      label: channelLabels[key] || key,
      connected,
      statsConnected,
      statusLabel: statsConnected ? "Stats actives" : connected ? "Connecté sans stats" : "Non connecté",
      opportunities: Math.max(0, Math.round(safeNumber(block.opportunities))),
      capturedWeek: Math.max(0, Math.round(safeNumber(asRecord(block.capturedLeads).week))),
      capturedMonth: Math.max(0, Math.round(safeNumber(asRecord(block.capturedLeads).month))),
      estimatedValue: Math.max(0, Math.round(safeNumber(block.estimatedValue))),
      error,
    };

    return {
      ...lineWithoutRecommendation,
      recommendation: buildChannelRecommendation(lineWithoutRecommendation),
    };
  });
}

function normalizeMailReport(raw: JsonRecord | null): MailReport | null {
  if (!raw) return null;
  return {
    connectedCount: Math.round(safeNumber(raw.connectedCount)),
    maxAccounts: Math.round(safeNumber(raw.maxAccounts, 4)),
    contactsEmail: Math.round(safeNumber(raw.contactsEmail || raw.contactsCrm)),
    campagnes30: Math.round(safeNumber(raw.campagnes30)),
    campagnesTotal: Math.round(safeNumber(raw.campagnesTotal)),
    destinataires30: Math.round(safeNumber(raw.destinataires30)),
    destinatairesTotal: Math.round(safeNumber(raw.destinatairesTotal)),
    propulsions30: Math.round(safeNumber(raw.propulsions30)),
    fidelisations30: Math.round(safeNumber(raw.fidelisations30)),
    mailsSimples30: Math.round(safeNumber(raw.mailsSimples30 || raw.inrsend30)),
    agendaReminders30: Math.round(safeNumber(raw.agendaReminders30)),
    factures30: Math.round(safeNumber(raw.factures30)),
    devis30: Math.round(safeNumber(raw.devis30)),
  };
}

function normalizeBadgeReport(raw: JsonRecord | null): BadgeReport | null {
  if (!raw) return null;
  return {
    views30: Math.round(safeNumber(asRecord(raw.views).month)),
    qrScans30: Math.round(safeNumber(asRecord(raw.qrScans).month)),
    actions30: Math.round(safeNumber(asRecord(raw.actions).month)),
    leads30: Math.round(safeNumber(asRecord(raw.leads).month)),
    appointments30: Math.round(safeNumber(asRecord(raw.appointments).month)),
    capturedLeads30: Math.round(safeNumber(asRecord(raw.capturedLeads).month)),
    qualityScore: Math.round(safeNumber(raw.qualityScore, 52)),
    opportunity30: Math.round(safeNumber(raw.opportunity30)),
  };
}

function buildTotals(channels: ChannelReportLine[]) {
  return channels.reduce(
    (totals, channel) => ({
      connectedChannels: totals.connectedChannels + (channel.connected ? 1 : 0),
      statsConnectedChannels: totals.statsConnectedChannels + (channel.statsConnected ? 1 : 0),
      opportunities: totals.opportunities + channel.opportunities,
      capturedLeadsMonth: totals.capturedLeadsMonth + channel.capturedMonth,
      estimatedValue: totals.estimatedValue + channel.estimatedValue,
    }),
    {
      connectedChannels: 0,
      statsConnectedChannels: 0,
      opportunities: 0,
      capturedLeadsMonth: 0,
      estimatedValue: 0,
    },
  );
}

function fallbackInsights(report: StatsReportData): StatsAiInsights {
  const bestChannels = [...report.channels]
    .filter((channel) => channel.statsConnected)
    .sort((a, b) => b.opportunities + b.capturedMonth * 6 - (a.opportunities + a.capturedMonth * 6))
    .slice(0, 2);

  const disconnected = report.channels.filter((channel) => !channel.connected).slice(0, 2);
  const strengths = bestChannels.length
    ? bestChannels.map((channel) => `${channel.label} ressort comme un canal à suivre en priorité.`)
    : ["Le bilan centralise désormais tous les canaux pour faciliter le pilotage."];

  const weaknesses = disconnected.length
    ? disconnected.map((channel) => `${channel.label} n’est pas encore connecté ou exploitable dans les statistiques.`)
    : ["Les canaux connectés doivent être alimentés régulièrement pour créer plus d’historique."];

  return {
    globalSummary:
      report.totals.statsConnectedChannels > 0
        ? `Sur les ${report.periodDays} derniers jours, ${report.totals.statsConnectedChannels} canal${report.totals.statsConnectedChannels > 1 ? "aux" : ""} dispose${report.totals.statsConnectedChannels > 1 ? "nt" : ""} de statistiques exploitables. iNr’Agent estime ${formatNumber(report.totals.opportunities)} opportunité${report.totals.opportunities > 1 ? "s" : ""} et ${formatNumber(report.totals.capturedLeadsMonth)} demande${report.totals.capturedLeadsMonth > 1 ? "s" : ""} captée${report.totals.capturedLeadsMonth > 1 ? "s" : ""}.`
        : "Les statistiques sont encore limitées : il faut connecter les canaux et laisser iNrCy collecter davantage de données.",
    strengths,
    weaknesses,
    recommendations: [
      "Publier au moins une action utile cette semaine sur les canaux connectés.",
      "Mettre un appel à l’action clair sur les canaux qui génèrent déjà de la visibilité.",
      "Connecter ou réparer les canaux sans statistiques pour obtenir un bilan complet.",
    ],
    channelNotes: Object.fromEntries(report.channels.map((channel) => [channel.key, channel.recommendation])),
  };
}

async function generateAiInsights(report: StatsReportData): Promise<StatsAiInsights> {
  if (!process.env.OPENAI_API_KEY) return fallbackInsights(report);

  try {
    const compact = {
      periodDays: report.periodDays,
      totals: report.totals,
      channels: report.channels.map((channel) => ({
        key: channel.key,
        label: channel.label,
        status: channel.statusLabel,
        opportunities: channel.opportunities,
        capturedMonth: channel.capturedMonth,
        estimatedValue: channel.estimatedValue,
        error: channel.error,
      })),
      mail: report.mail,
      badge: report.badge,
    };

    const generated = await openaiGenerateJSON<StatsAiInsights>({
      maxOutputTokens: 1300,
      temperature: 0.25,
      system:
        "Tu es iNr’Agent. Tu rédiges des bilans statistiques courts, utiles et honnêtes pour des professionnels. Tu ne dois jamais inventer des chiffres. Réponds uniquement en JSON.",
      input: `Analyse ces statistiques iNrCy et retourne un JSON avec les clés globalSummary, strengths, weaknesses, recommendations, channelNotes. Les tableaux doivent contenir 2 à 5 phrases courtes. channelNotes est un objet {cléCanal: phrase courte}. Données : ${JSON.stringify(compact)}`,
    });

    return {
      ...fallbackInsights(report),
      ...generated,
      strengths: Array.isArray(generated.strengths) ? generated.strengths.map((item) => cleanText(item, 220)).filter(Boolean).slice(0, 5) : fallbackInsights(report).strengths,
      weaknesses: Array.isArray(generated.weaknesses) ? generated.weaknesses.map((item) => cleanText(item, 220)).filter(Boolean).slice(0, 5) : fallbackInsights(report).weaknesses,
      recommendations: Array.isArray(generated.recommendations) ? generated.recommendations.map((item) => cleanText(item, 220)).filter(Boolean).slice(0, 5) : fallbackInsights(report).recommendations,
      globalSummary: cleanText(generated.globalSummary, 700) || fallbackInsights(report).globalSummary,
      channelNotes: asRecord(generated.channelNotes) as Record<string, string>,
    };
  } catch (error) {
    console.warn("[inr-agent-stats-report] AI insights fallback", error);
    return fallbackInsights(report);
  }
}

async function buildReportData(args: {
  origin: string;
  cookie: string;
  userEmail: string;
  allowedThemes: InrAgentTheme[];
  cronUserId?: string;
}) {
  const fetchArgs = { cookie: args.cookie, cronUserId: args.cronUserId };
  const [bulkResult, mailResult, badgeResult] = await Promise.all([
    fetchJson<JsonRecord>(`${args.origin}/api/stats/dashboard-bulk?days=30&fresh=1`, fetchArgs),
    fetchJson<JsonRecord>(`${args.origin}/api/inrstats/mails`, fetchArgs),
    fetchJson<JsonRecord>(`${args.origin}/api/inrstats/inrbadge`, fetchArgs),
  ]);

  const channels = normalizeChannelReports(bulkResult.data, args.allowedThemes);
  return {
    channels,
    mail: mailResult.data ? normalizeMailReport(mailResult.data) : null,
    badge: badgeResult.data ? normalizeBadgeReport(badgeResult.data) : null,
    errors: {
      channels: bulkResult.error,
      mail: mailResult.error,
      badge: badgeResult.error,
    },
  };
}

function splitText(doc: jsPDF, text: unknown, width: number): string[] {
  return doc.splitTextToSize(cleanText(text, 4000) || "-", width) as string[];
}

function addPageHeader(doc: jsPDF, title: string, pageNumber: number) {
  doc.setFillColor(8, 20, 48);
  doc.rect(0, 0, 210, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(title, 14, 11.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Page ${pageNumber}`, 190, 11.5, { align: "right" });
  doc.setTextColor(15, 23, 42);
}

function addWrappedText(doc: jsPDF, text: unknown, x: number, y: number, width: number, lineHeight = 5) {
  const lines = splitText(doc, text, width);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function drawMetricBox(doc: jsPDF, label: string, value: string, x: number, y: number, w: number, h = 24) {
  doc.setDrawColor(222, 231, 244);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(x, y, w, h, 3, 3, "FD");
  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(label, x + 4, y + 7);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(value, x + 4, y + 17);
}

function addBulletList(doc: jsPDF, items: unknown, x: number, y: number, width: number) {
  const list = Array.isArray(items) ? items : [];
  let cursor = y;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);
  for (const item of list.slice(0, 6)) {
    const text = splitText(doc, `• ${cleanText(item, 220)}`, width);
    doc.text(text, x, cursor);
    cursor += Math.max(6, text.length * 4.8 + 2);
  }
  return cursor;
}

function createStatsPdf(report: StatsReportData, insights: StatsAiInsights) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  let page = 1;

  doc.setFillColor(5, 10, 30);
  doc.rect(0, 0, 210, 297, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text("Bilan iNrStats", 18, 42);
  doc.setFontSize(16);
  doc.text(report.companyName || "Votre activité", 18, 55);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Période analysée : ${report.periodDays} derniers jours`, 18, 68);
  doc.text(`Généré le ${formatDateFr(report.generatedAt)}`, 18, 76);
  doc.setDrawColor(96, 165, 250);
  doc.setLineWidth(0.8);
  doc.line(18, 88, 192, 88);
  doc.setFontSize(13);
  const summaryLines = splitText(doc, insights.globalSummary || "Synthèse indisponible.", 170);
  doc.text(summaryLines, 18, 104);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Indicateurs clés", 18, 145);
  drawMetricBox(doc, "Canaux connectés", `${report.totals.connectedChannels}/${report.channels.length}`, 18, 154, 39);
  drawMetricBox(doc, "Stats actives", `${report.totals.statsConnectedChannels}`, 62, 154, 35);
  drawMetricBox(doc, "Opportunités", formatNumber(report.totals.opportunities), 102, 154, 39);
  drawMetricBox(doc, "Demandes 30j", formatNumber(report.totals.capturedLeadsMonth), 146, 154, 40);
  drawMetricBox(doc, "CA potentiel", formatCurrency(report.totals.estimatedValue), 18, 184, 55);
  if (report.mail) drawMetricBox(doc, "Destinataires mails 30j", formatNumber(report.mail.destinataires30), 78, 184, 54);
  if (report.badge) drawMetricBox(doc, "Score iNrBadge", `${report.badge.qualityScore}/100`, 137, 184, 49);

  doc.addPage();
  page += 1;
  addPageHeader(doc, "Analyse globale", page);
  let y = 32;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Points forts", 14, y);
  y = addBulletList(doc, insights.strengths, 16, y + 10, 176) + 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Points à surveiller", 14, y);
  y = addBulletList(doc, insights.weaknesses, 16, y + 10, 176) + 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Plan d’action recommandé", 14, y);
  addBulletList(doc, insights.recommendations, 16, y + 10, 176);

  doc.addPage();
  page += 1;
  addPageHeader(doc, "Analyse par canal", page);
  y = 31;
  for (const channel of report.channels) {
    if (y > 247) {
      doc.addPage();
      page += 1;
      addPageHeader(doc, "Analyse par canal", page);
      y = 31;
    }

    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(12, y - 6, 186, 30, 3, 3, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(channel.label, 17, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(channel.statusLabel, 17, y + 6);
    doc.text(`Opportunités : ${formatNumber(channel.opportunities)}`, 76, y);
    doc.text(`Demandes 30j : ${formatNumber(channel.capturedMonth)}`, 76, y + 6);
    doc.text(`CA potentiel : ${formatCurrency(channel.estimatedValue)}`, 76, y + 12);
    const channelNote = cleanText(asRecord(insights.channelNotes)[channel.key], 260) || channel.recommendation;
    addWrappedText(doc, channelNote, 17, y + 17, 168, 4.2);
    y += 38;
  }

  doc.addPage();
  page += 1;
  addPageHeader(doc, "Mails et iNrBadge", page);
  y = 33;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Mails / Propulser / Fidéliser", 14, y);
  y += 12;
  if (report.mail) {
    drawMetricBox(doc, "Boîtes connectées", `${report.mail.connectedCount}/${report.mail.maxAccounts}`, 14, y, 40);
    drawMetricBox(doc, "Contacts email CRM", formatNumber(report.mail.contactsEmail), 59, y, 43);
    drawMetricBox(doc, "Campagnes 30j", formatNumber(report.mail.campagnes30), 107, y, 38);
    drawMetricBox(doc, "Destinataires 30j", formatNumber(report.mail.destinataires30), 150, y, 45);
    y += 34;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Propulser : ${formatNumber(report.mail.propulsions30)} · Fidéliser : ${formatNumber(report.mail.fidelisations30)} · Mails simples : ${formatNumber(report.mail.mailsSimples30)}`, 14, y);
    y += 8;
    doc.text(`Rappels agenda : ${formatNumber(report.mail.agendaReminders30)} · Factures envoyées : ${formatNumber(report.mail.factures30)} · Devis envoyés : ${formatNumber(report.mail.devis30)}`, 14, y);
  } else {
    doc.setFont("helvetica", "normal");
    doc.text("Statistiques mails indisponibles au moment du bilan.", 14, y);
  }

  y += 26;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("iNrBadge", 14, y);
  y += 12;
  if (report.badge) {
    drawMetricBox(doc, "Vues 30j", formatNumber(report.badge.views30), 14, y, 36);
    drawMetricBox(doc, "Scans QR 30j", formatNumber(report.badge.qrScans30), 55, y, 38);
    drawMetricBox(doc, "Actions 30j", formatNumber(report.badge.actions30), 98, y, 38);
    drawMetricBox(doc, "Demandes 30j", formatNumber(report.badge.capturedLeads30), 141, y, 42);
    y += 34;
    drawMetricBox(doc, "Score qualité", `${report.badge.qualityScore}/100`, 14, y, 42);
    drawMetricBox(doc, "Opportunités iNrBadge", formatNumber(report.badge.opportunity30), 61, y, 52);
  } else {
    doc.setFont("helvetica", "normal");
    doc.text("Statistiques iNrBadge indisponibles au moment du bilan.", 14, y);
  }

  const buffer = Buffer.from(doc.output("arraybuffer") as ArrayBuffer);
  return buffer;
}

function buildStatsEmail(args: { report: StatsReportData; insights: StatsAiInsights; filename: string }) {
  const company = cleanText(args.report.companyName || "votre activité", 120);
  const safeCompany = escapeHtml(company);
  const safeProName = escapeHtml(args.report.proName);
  const safeSummary = escapeHtml(args.insights.globalSummary);
  const safeFilename = escapeHtml(args.filename);
  const text = [
    `Bonjour${args.report.proName ? ` ${args.report.proName}` : ""},`,
    "",
    `Votre bilan iNrStats est disponible en pièce jointe : ${args.filename}.`,
    "",
    cleanText(args.insights.globalSummary, 900),
    "",
    `Canaux connectés : ${args.report.totals.connectedChannels}/${args.report.channels.length}`,
    `Opportunités estimées : ${formatNumber(args.report.totals.opportunities)}`,
    `Demandes captées sur 30 jours : ${formatNumber(args.report.totals.capturedLeadsMonth)}`,
    "",
    "Mail automatique envoyé par iNr’Agent.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="fr">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
  <body style="margin:0;padding:0;background:#f4f7fb;background-color:#f4f7fb;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f4f7fb" style="background:#f4f7fb;background-color:#f4f7fb;">
      <tr><td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="max-width:640px;background:#ffffff;border-radius:16px;box-shadow:0 10px 30px rgba(15,23,42,.08);overflow:hidden;">
          <tr><td style="padding:24px 24px 8px 24px;">
            <img src="cid:inrcy-logo@inrcy" alt="iNrCy" width="108" height="41" style="display:block;width:108px;max-width:100%;height:auto;border:0;" />
            <h1 style="margin:18px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;color:#0f172a;line-height:1.25;">Votre bilan iNrStats est prêt</h1>
            <p style="margin:8px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#64748b;line-height:1.5;">Analyse automatique iNr’Agent pour ${safeCompany}</p>
          </td></tr>
          <tr><td style="padding:8px 24px 6px 24px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
            <p style="margin:12px 0 0 0;font-size:14px;line-height:1.65;">Bonjour${safeProName ? ` ${safeProName}` : ""},</p>
            <p style="margin:12px 0 0 0;font-size:14px;line-height:1.65;">Votre bilan iNrStats est disponible en pièce jointe. Il analyse vos canaux, vos demandes captées, vos opportunités et vos actions mails.</p>
            <div style="margin:18px 0;padding:16px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0;">
              <p style="margin:0;font-size:14px;line-height:1.65;color:#334155;">${safeSummary}</p>
            </div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:14px 0;border-collapse:separate;border-spacing:8px;">
              <tr>
                <td style="padding:12px;border-radius:12px;background:#eff6ff;font-family:Arial,Helvetica,sans-serif;"><strong style="display:block;font-size:18px;color:#0f172a;">${args.report.totals.connectedChannels}/${args.report.channels.length}</strong><span style="font-size:12px;color:#64748b;">Canaux connectés</span></td>
                <td style="padding:12px;border-radius:12px;background:#f5f3ff;font-family:Arial,Helvetica,sans-serif;"><strong style="display:block;font-size:18px;color:#0f172a;">${formatNumber(args.report.totals.opportunities)}</strong><span style="font-size:12px;color:#64748b;">Opportunités</span></td>
                <td style="padding:12px;border-radius:12px;background:#ecfdf5;font-family:Arial,Helvetica,sans-serif;"><strong style="display:block;font-size:18px;color:#0f172a;">${formatNumber(args.report.totals.capturedLeadsMonth)}</strong><span style="font-size:12px;color:#64748b;">Demandes 30j</span></td>
              </tr>
            </table>
            <p style="margin:12px 0 0 0;font-size:12px;color:#64748b;line-height:1.6;">Fichier joint : ${safeFilename}</p>
          </td></tr>
          <tr><td style="padding:18px 24px 22px 24px;">
            <div style="border-top:1px solid #eef2f7;height:1px;line-height:1px;font-size:0;">&nbsp;</div>
            <div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>
            <img src="cid:inrcy-signature@inrcy" alt="iNrCy — Service client" width="512" style="width:100%;max-width:512px;height:auto;display:block;border:0;" />
          </td></tr>
        </table>
        <p style="margin:14px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#94a3b8;text-align:center;">Mail automatique envoyé par iNr’Agent.</p>
      </td></tr>
    </table>
  </body>
</html>`;

  return { subject: `Votre bilan iNrStats - ${company}`, text, html };
}

export async function POST(request: Request) {
  const context = await resolveInrAgentActionRequest(request);
  if (context.errorResponse) return context.errorResponse;

  const { user, userId, isCron } = context;
  const rl = await enforceRateLimit({
    name: "inr_agent_stats_report",
    identifier: userId,
    limit: 2,
    window: "1 m",
  });
  if (rl) return rl;

  const automation = await loadStatsAutomationSettings(userId);

  const { origin } = new URL(request.url);
  const cookie = request.headers.get("cookie") || "";
  const now = new Date().toISOString();

  const [profileResult] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("admin_email, contact_email, first_name, last_name, company_legal_name")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const profile = asRecord(profileResult.data);
  const recipientEmail = cleanEmail(profile.contact_email) || cleanEmail(profile.admin_email) || cleanEmail((user as { email?: string | null }).email);
  if (!recipientEmail) {
    return NextResponse.json(
      { error: "Aucune adresse email pro n’est disponible pour envoyer le bilan." },
      { status: 400 },
    );
  }

  const proName = [cleanText(profile.first_name, 80), cleanText(profile.last_name, 100)].filter(Boolean).join(" ").trim();
  const companyName = cleanText(profile.company_legal_name, 140) || proName || "Votre activité";
  const stats = await buildReportData({
    origin,
    cookie,
    userEmail: recipientEmail,
    allowedThemes: automation.allowedThemes,
    cronUserId: isCron ? userId : undefined,
  });

  const report: StatsReportData = {
    generatedAt: now,
    periodDays: 30,
    recipientEmail,
    companyName,
    proName,
    channels: stats.channels,
    mail: automation.allowedThemes.includes("mails") || automation.allowedThemes.includes("vue_globale") ? stats.mail : null,
    badge: automation.allowedThemes.includes("inrbadge") || automation.allowedThemes.includes("vue_globale") ? stats.badge : null,
    totals: buildTotals(stats.channels),
  };

  const insights = await generateAiInsights(report);
  const pdfBuffer = createStatsPdf(report, insights);
  const dateKey = now.slice(0, 10);
  const filename = `bilan-inrstats-${dateKey}.pdf`;
  const mail = buildStatsEmail({ report, insights, filename });

  const actionPayload = {
    version: 1,
    source: "inr_agent_stats_report",
    generatedAt: now,
    periodDays: report.periodDays,
    report,
    insights,
    pdf: {
      filename,
      mimeType: "application/pdf",
      bytes: pdfBuffer.byteLength,
    },
    delivery: {
      to: recipientEmail,
      subject: mail.subject,
      sentAt: now,
    },
    partialErrors: stats.errors,
  };

  let insertedAction: unknown = null;
  try {
    const { data, error } = await supabaseAdmin
      .from("inr_agent_actions")
      .insert({
        user_id: userId,
        automation_key: "stats",
        action_type: "stats_report",
        target_tool: "inrstats",
        title: "Bilan iNrStats envoyé",
        summary: `Bilan PDF envoyé à ${recipientEmail}`,
        preview_text: cleanText(insights.globalSummary, 1200),
        target_channels: [],
        target_themes: automation.allowedThemes,
        recipients: [{ email: recipientEmail, type: "pro" }],
        image_assets: [],
        payload: actionPayload,
        validation_required: false,
        execution_policy: "automatic_after_settings",
        status: "executing",
        scheduled_for: null,
        prepared_at: now,
        validated_at: now,
        metadata: { preparedManually: !isCron, preparedByCron: isCron, automationFrequency: automation.frequency },
        created_at: now,
        updated_at: now,
      })
      .select(ACTION_SELECT)
      .single();

    if (error) throw error;
    insertedAction = data;
  } catch (error) {
    console.warn("[inr-agent-stats-report] action insert failed", error);
  }

  try {
    const inlineAttachments = await getInrcyBrandInlineAttachments();
    await sendTxMail({
      to: recipientEmail,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      attachments: [
        ...inlineAttachments,
        {
          filename,
          mimeType: "application/pdf",
          content: pdfBuffer,
        },
      ],
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Envoi email impossible";
    if (insertedAction && asRecord(insertedAction).id) {
      const { data } = await supabaseAdmin
        .from("inr_agent_actions")
        .update({
          status: "failed",
          last_error: errorMessage,
          payload: { ...actionPayload, delivery: { ...actionPayload.delivery, error: errorMessage } },
          updated_at: new Date().toISOString(),
        })
        .eq("id", String(asRecord(insertedAction).id))
        .eq("user_id", userId)
        .select(ACTION_SELECT)
        .maybeSingle();

      return NextResponse.json(
        {
          error: "Le PDF a été généré, mais l’envoi du mail a échoué.",
          detail: errorMessage,
          action: data ? rowToInrAgentAction(data as any) : null,
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: "Le PDF a été généré, mais l’envoi du mail a échoué.", detail: errorMessage },
      { status: 500 },
    );
  }

  const completedAt = new Date().toISOString();
  let action = insertedAction ? rowToInrAgentAction(insertedAction as any) : null;
  if (insertedAction && asRecord(insertedAction).id) {
    const { data } = await supabaseAdmin
      .from("inr_agent_actions")
      .update({
        status: "completed",
        completed_at: completedAt,
        payload: { ...actionPayload, delivery: { ...actionPayload.delivery, sentAt: completedAt } },
        updated_at: completedAt,
      })
      .eq("id", String(asRecord(insertedAction).id))
      .eq("user_id", userId)
      .select(ACTION_SELECT)
      .maybeSingle();

    if (data) action = rowToInrAgentAction(data as any);
  }

  await supabaseAdmin
    .from("inr_agent_automation_settings")
    .update({ last_prepared_at: now, last_executed_at: completedAt, updated_at: completedAt })
    .eq("user_id", userId)
    .eq("automation_key", "stats");

  return NextResponse.json({
    action,
    sent: true,
    recipientEmail,
    filename,
    pdfBytes: pdfBuffer.byteLength,
  });
}

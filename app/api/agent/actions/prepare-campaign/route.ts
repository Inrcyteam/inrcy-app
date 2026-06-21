import { NextResponse } from "next/server";
import { getTemplates, type TemplateAction } from "@/lib/messageTemplates";
import { textToRichMailHtml } from "@/lib/mailRichText";
import { normalizeMailSubject } from "@/lib/mailEncoding";
import { stripTemplateSignatureBlock } from "@/lib/mailTemplateCleanup";
import { resolveInrAgentActionRequest } from "@/lib/inrAgentRequest";
import { enforceRateLimit } from "@/lib/rateLimit";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decodeBusinessSector } from "@/lib/activitySectors";
import { getJobLabel } from "@/lib/activityCatalog";
import {
  sanitizeInrAgentAutomationSettings,
  type InrAgentAutomationKey,
  type InrAgentAutomationSettings,
  type InrAgentRecipientScope,
  type InrAgentTheme,
  type InrAgentValidationMode,
} from "@/lib/inrAgentSettings";
import { rowToInrAgentAction } from "@/lib/inrAgentActions";
import { generateTemplateAiContent, TemplateAiGenerationError } from "@/lib/templateAiGeneration";

export const maxDuration = 120;
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;
type CampaignAutomationKey = Extract<InrAgentAutomationKey, "grow" | "loyalty">;

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

type CampaignRecipient = {
  contact_id: string | null;
  display_name: string | null;
  email: string;
  contact_type?: string | null;
  company_name?: string | null;
};

const ACTION_SELECT =
  "id, automation_key, action_type, target_tool, title, summary, preview_text, target_channels, target_themes, recipients, image_assets, payload, validation_required, execution_policy, status, scheduled_for, prepared_at, validated_at, refused_at, completed_at, last_error, created_at, updated_at";

const campaignThemeMap = {
  grow: {
    validThemes: ["valoriser", "recolter", "offrir"],
    tool: "propulser",
    trackKind: "propulser",
    defaultScope: "all_crm",
    themes: {
      valoriser: {
        label: "Valoriser",
        templateAction: "valoriser",
        templateModule: "propulser",
        folder: "propulsions",
        trackType: "valorize",
      },
      recolter: {
        label: "Récolter",
        templateAction: "avis",
        templateModule: "propulser",
        folder: "propulsions",
        trackType: "review_mail",
      },
      offrir: {
        label: "Offrir",
        templateAction: "offres",
        templateModule: "propulser",
        folder: "propulsions",
        trackType: "promo_mail",
      },
    },
  },
  loyalty: {
    validThemes: ["informer", "enqueter", "suivre"],
    tool: "fideliser",
    trackKind: "fideliser",
    defaultScope: "clients",
    themes: {
      informer: {
        label: "Informer",
        templateAction: "informations",
        templateModule: "fideliser",
        folder: "fidelisations",
        trackType: "newsletter_mail",
      },
      enqueter: {
        label: "Enquêter",
        templateAction: "enquetes",
        templateModule: "fideliser",
        folder: "fidelisations",
        trackType: "satisfaction_mail",
      },
      suivre: {
        label: "Suivre",
        templateAction: "suivis",
        templateModule: "fideliser",
        folder: "fidelisations",
        trackType: "thanks_mail",
      },
    },
  },
} as const;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
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

function rowToAutomationSettings(
  key: CampaignAutomationKey,
  row: AutomationDbRow | null,
): InrAgentAutomationSettings {
  return sanitizeInrAgentAutomationSettings(key, {
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

async function loadCampaignAutomationSettings(
  userId: string,
  key: CampaignAutomationKey,
) {
  const { data } = await supabaseAdmin
    .from("inr_agent_automation_settings")
    .select(
      "enabled, frequency, day_of_week, time, validation_mode, allowed_channels, allowed_themes, use_image_bank, image_required, recipient_scope, source_strategy, last_prepared_at, last_executed_at, next_run_at, metadata",
    )
    .eq("user_id", userId)
    .eq("automation_key", key)
    .maybeSingle();

  return rowToAutomationSettings(key, (data as AutomationDbRow | null) ?? null);
}

function chooseTheme(
  key: CampaignAutomationKey,
  allowedThemes: InrAgentTheme[],
): InrAgentTheme {
  const map = campaignThemeMap[key];
  const available = allowedThemes.filter((theme) =>
    (map.validThemes as readonly string[]).includes(theme),
  );
  const fallback = map.validThemes[0];
  return (available[Math.floor(Math.random() * available.length)] || fallback) as InrAgentTheme;
}

type CampaignThemeConfig = {
  label: string;
  templateAction: TemplateAction;
  templateModule: string;
  folder: string;
  trackType: string;
};

function getCampaignThemeConfig(
  key: CampaignAutomationKey,
  theme: InrAgentTheme,
): CampaignThemeConfig {
  const map = campaignThemeMap[key] as unknown as {
    validThemes: readonly string[];
    themes: Record<string, CampaignThemeConfig>;
  };
  return map.themes[theme] || map.themes[map.validThemes[0]];
}

function getExecutionPolicy(validationMode: InrAgentValidationMode) {
  if (validationMode === "draft_only") return "draft_only";
  return "manual_validation";
}

function getInitialStatus(validationMode: InrAgentValidationMode) {
  return validationMode === "draft_only" ? "draft" : "pending_validation";
}

function buildDisplayName(row: JsonRecord) {
  const firstName = cleanText(row.first_name, 80);
  const lastName = cleanText(row.last_name, 100);
  const company = cleanText(row.company_name, 140);
  const person = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (person && company) return `${person} · ${company}`;
  return person || company || cleanText(row.email, 160);
}

async function fetchRecipients(args: {
  userId: string;
  scope: InrAgentRecipientScope;
}): Promise<CampaignRecipient[]> {
  let query = supabaseAdmin
    .from("crm_contacts")
    .select("id,first_name,last_name,company_name,email,contact_type,created_at")
    .eq("user_id", args.userId)
    .not("email", "is", null)
    .limit(args.scope === "recent_contacts" ? 80 : 500);

  if (args.scope === "clients") query = query.eq("contact_type", "client");
  if (args.scope === "prospects") query = query.eq("contact_type", "prospect");

  query = query.order("created_at", {
    ascending: args.scope === "inactive_contacts",
  });

  const { data, error } = await query;
  if (error || !Array.isArray(data)) return [];

  const seen = new Set<string>();
  const recipients: CampaignRecipient[] = [];

  for (const raw of data) {
    const row = asRecord(raw);
    if (!row) continue;
    const email = cleanEmail(row.email);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    recipients.push({
      contact_id: cleanText(row.id, 120) || null,
      display_name: buildDisplayName(row),
      email,
      contact_type: cleanText(row.contact_type, 80) || null,
      company_name: cleanText(row.company_name, 140) || null,
    });
  }

  return recipients;
}

async function fetchMailAccount(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("integrations")
    .select("id,provider,resource_label,status,settings")
    .eq("user_id", userId)
    .eq("category", "mail")
    .eq("status", "connected")
    .limit(1);

  if (error || !Array.isArray(data) || !data[0]?.id) return null;
  const row = data[0] as JsonRecord;
  return {
    id: cleanText(row.id, 120),
    provider: cleanText(row.provider, 80),
    label: cleanText(row.resource_label || row.provider || "Boîte mail", 180),
  };
}

function pickTemplate(args: {
  templateAction: TemplateAction;
  sectorCategory: unknown;
  profession: unknown;
}) {
  const templates = getTemplates(
    args.templateAction,
    undefined,
    (args.sectorCategory || null) as never,
    cleanText(args.profession, 120) || null,
  );
  const categoryMap = new Map<string, (typeof templates)[number]>();
  for (const template of templates) {
    if (!categoryMap.has(template.category)) categoryMap.set(template.category, template);
  }
  const candidates = Array.from(categoryMap.values());
  return candidates[Math.floor(Math.random() * candidates.length)] || templates[0] || null;
}

async function generateCampaignContent(args: {
  supabase: any;
  userId: string;
  templateModule: string;
  mission: string;
  templateKey: string;
  templateTitle: string;
  templateCategory: string;
  subject: string;
  body: string;
}) {
  const payload = await generateTemplateAiContent({
    supabase: args.supabase,
    userId: args.userId,
    input: {
      module: args.templateModule,
      mission: args.mission,
      template_key: args.templateKey,
      template_title: args.templateTitle,
      template_category: args.templateCategory,
      subject: args.subject,
      body: args.body,
      attachments: [],
    },
  });

  return {
    subject: normalizeMailSubject(cleanText(payload.subject, 220) || args.subject),
    bodyText: stripTemplateSignatureBlock(
      cleanText(payload.body_text, 6000) || args.body,
    ),
  };
}

function buildPreviewText(subject: string, bodyText: string, recipients: CampaignRecipient[]) {
  return [
    `Objet : ${subject}`,
    bodyText,
    `Destinataires proposés : ${recipients.length} contact${recipients.length > 1 ? "s" : ""} CRM`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildSummary(args: {
  automationKey: CampaignAutomationKey;
  mission: string;
  templateTitle: string;
  recipients: CampaignRecipient[];
  accountLabel: string;
}) {
  const toolLabel = args.automationKey === "grow" ? "Propulser" : "Fidéliser";
  return `${toolLabel} · ${args.mission} préparé depuis le modèle “${args.templateTitle}” avec ${args.recipients.length} destinataire${args.recipients.length > 1 ? "s" : ""} CRM via ${args.accountLabel}.`;
}

export async function POST(request: Request) {
  const context = await resolveInrAgentActionRequest(request);
  if (context.errorResponse) return context.errorResponse;

  const { supabase, userId, isCron } = context;
  const body = context.body as {
    automationKey?: unknown;
  } | null;
  const automationKeyRaw = cleanText(body?.automationKey, 40);
  const automationKey: CampaignAutomationKey =
    automationKeyRaw === "loyalty" ? "loyalty" : "grow";

  const rl = await enforceRateLimit({
    name: `inr_agent_prepare_${automationKey}`,
    identifier: userId,
    limit: 4,
    window: "1 m",
    failClosed: false,
  });
  if (rl) return rl;

  const automation = await loadCampaignAutomationSettings(userId, automationKey);
  if (!automation.enabled) {
    return NextResponse.json(
      {
        error:
          automationKey === "grow"
            ? "L’automatisation Propulser est désactivée."
            : "L’automatisation Fidéliser les contacts est désactivée.",
      },
      { status: 400 },
    );
  }

  const mailAllowed = automation.allowedChannels.includes("mails");
  if (!mailAllowed) {
    return NextResponse.json(
      { error: "Le canal Mails doit être autorisé pour cette automatisation." },
      { status: 400 },
    );
  }

  const [profileRes, businessRes, mailAccount] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("business_profiles").select("*").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    fetchMailAccount(userId),
  ]);

  if (!mailAccount?.id) {
    return NextResponse.json(
      {
        error:
          "Aucune boîte mail connectée. Connecte une boîte dans Mails avant de laisser iNr’Agent préparer une campagne.",
      },
      { status: 400 },
    );
  }

  const business = asRecord(businessRes.data);
  const decodedSector = decodeBusinessSector(String(business?.sector || ""));
  const professionLabel =
    getJobLabel(decodedSector.sectorCategory, decodedSector.profession) ||
    decodedSector.profession;
  const profile = asRecord(profileRes.data);

  const theme = chooseTheme(automationKey, automation.allowedThemes);
  const themeConfig = getCampaignThemeConfig(automationKey, theme);
  const template = pickTemplate({
    templateAction: themeConfig.templateAction,
    sectorCategory: decodedSector.sectorCategory,
    profession: decodedSector.profession,
  });

  if (!template) {
    return NextResponse.json(
      { error: "Aucun template d’origine n’a été trouvé pour cette campagne." },
      { status: 400 },
    );
  }

  const scope =
    automation.recipientScope === "none" || automation.recipientScope === "manual_selection"
      ? (campaignThemeMap[automationKey].defaultScope as InrAgentRecipientScope)
      : automation.recipientScope;
  const recipients = await fetchRecipients({ userId, scope });
  if (!recipients.length) {
    return NextResponse.json(
      {
        error:
          automationKey === "loyalty"
            ? "Aucun client avec email n’est disponible dans le CRM pour préparer cette campagne Fidéliser."
            : "Aucun contact avec email n’est disponible dans le CRM pour préparer cette campagne Propulser.",
      },
      { status: 400 },
    );
  }

  let generated: Awaited<ReturnType<typeof generateCampaignContent>>;
  try {
    generated = await generateCampaignContent({
      supabase,
      userId,
      templateModule: themeConfig.templateModule,
      mission: themeConfig.label,
      templateKey: template.key,
      templateTitle: template.title,
      templateCategory: template.category,
      subject: template.subject,
      body: template.body,
    });
  } catch (error) {
    if (error instanceof TemplateAiGenerationError) {
      return NextResponse.json(
        { error: error.message, ...(error.code ? { code: error.code } : {}) },
        { status: error.status, headers: error.headers },
      );
    }
    console.error("agent/prepare-campaign generate", error);
    return NextResponse.json(
      { error: "La génération IA de la campagne a échoué." },
      { status: 500 },
    );
  }

  const now = new Date().toISOString();
  const bodyHtml = textToRichMailHtml(generated.bodyText);
  const title = `Campagne ${themeConfig.label} prête`;
  const summary = buildSummary({
    automationKey,
    mission: themeConfig.label,
    templateTitle: template.title,
    recipients,
    accountLabel: mailAccount.label,
  });
  const signatureAutomatic = automation.metadata?.signatureAutomatic !== false;

  const payload = {
    version: 1,
    source: "inr_agent_campaign_preparer",
    executionTarget: "crm_campaign",
    automationKey,
    mission: themeConfig.label,
    theme,
    templateModule: themeConfig.templateModule,
    templateAction: themeConfig.templateAction,
    sourceTemplate: {
      key: template.key,
      title: template.title,
      category: template.category,
      subject: template.subject,
      body: template.body,
      profession: professionLabel || null,
      sectorCategory: decodedSector.sectorCategory || null,
    },
    subject: generated.subject,
    campaignSubject: generated.subject,
    bodyText: generated.bodyText,
    campaignBody: generated.bodyText,
    bodyHtml,
    folder: themeConfig.folder,
    trackKind: campaignThemeMap[automationKey].trackKind,
    trackType: themeConfig.trackType,
    templateKey: template.key,
    signatureAutomatic,
    accountId: mailAccount.id,
    mailAccount: mailAccount,
    recipientScope: scope,
    recipientCount: recipients.length,
    recipients,
    profile: {
      company: cleanText(
        profile?.company_legal_name || profile?.company_name || business?.company_name,
        160,
      ),
      city: cleanText(profile?.hq_city || profile?.hqCity, 100),
    },
  };

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("inr_agent_actions")
    .insert({
      user_id: userId,
      automation_key: automationKey,
      action_type: automationKey === "loyalty" ? "loyalty" : "campaign",
      target_tool: campaignThemeMap[automationKey].tool,
      title,
      summary,
      preview_text: buildPreviewText(generated.subject, generated.bodyText, recipients),
      target_channels: ["mails"],
      target_themes: [theme],
      recipients,
      image_assets: [],
      payload,
      validation_required: automation.validationMode !== "draft_only",
      execution_policy: getExecutionPolicy(automation.validationMode),
      status: getInitialStatus(automation.validationMode),
      scheduled_for: null,
      prepared_at: now,
      metadata: {
        automationFrequency: automation.frequency,
        preparedManually: !isCron,
        preparedByCron: isCron,
        templateKey: template.key,
        recipientCount: recipients.length,
        signatureAutomatic,
      },
      created_at: now,
      updated_at: now,
    })
    .select(ACTION_SELECT)
    .single();

  if (insertError) {
    return NextResponse.json(
      {
        error: "Impossible d’enregistrer la campagne préparée iNr’Agent.",
        detail: insertError.message,
      },
      { status: 500 },
    );
  }

  await supabaseAdmin
    .from("inr_agent_automation_settings")
    .update({ last_prepared_at: now, updated_at: now })
    .eq("user_id", userId)
    .eq("automation_key", automationKey);

  return NextResponse.json({
    action: rowToInrAgentAction(inserted as any),
    prepared: true,
  });
}

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  INR_AGENT_AUTOMATION_KEYS,
  automationSettingsToDbRow,
  sanitizeInrAgentAutomationSettings,
  sanitizeInrAgentSettings,
  type InrAgentAutomationKey,
  type InrAgentAutomationSettings,
  type InrAgentSettings,
} from "@/lib/inrAgentSettings";

type DbAgentGlobalSettingsRow = {
  global_enabled?: boolean | null;
  tone?: string | null;
  timezone?: string | null;
  metadata?: Record<string, unknown> | null;
};

type DbAgentAutomationSettingsRow = {
  automation_key?: string | null;
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

const GLOBAL_SELECT = "global_enabled, tone, timezone, metadata";
const AUTOMATION_SELECT = "automation_key, enabled, frequency, day_of_week, time, validation_mode, allowed_channels, allowed_themes, use_image_bank, image_required, recipient_scope, source_strategy, last_prepared_at, last_executed_at, next_run_at, metadata";

function isMissingSchemaError(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42P01" || error?.code === "42703" || error?.code === "PGRST205" || message.includes("inr_agent_settings") || message.includes("inr_agent_automation_settings");
}

function rowToAutomation(row: DbAgentAutomationSettingsRow | null | undefined): Partial<InrAgentAutomationSettings> {
  return {
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
  };
}

function rowsToSettings(globalRow: DbAgentGlobalSettingsRow | null | undefined, automationRows: DbAgentAutomationSettingsRow[]): InrAgentSettings {
  const automations = Object.fromEntries(
    INR_AGENT_AUTOMATION_KEYS.map((key) => {
      const row = automationRows.find((item) => item.automation_key === key);
      return [key, sanitizeInrAgentAutomationSettings(key, rowToAutomation(row))];
    }),
  ) as InrAgentSettings["automations"];

  return sanitizeInrAgentSettings({
    globalEnabled: globalRow?.global_enabled ?? undefined,
    tone: globalRow?.tone as InrAgentSettings["tone"],
    timezone: globalRow?.timezone ?? undefined,
    automations,
  });
}

export async function GET() {
  const { user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const { data: globalData, error: globalError } = await supabaseAdmin
    .from("inr_agent_settings")
    .select(GLOBAL_SELECT)
    .eq("user_id", user.id)
    .maybeSingle();

  if (globalError) {
    if (isMissingSchemaError(globalError)) {
      return NextResponse.json({ settings: sanitizeInrAgentSettings(null), tableMissing: true });
    }
    console.warn("[inr-agent-settings] global read failed", globalError);
    return NextResponse.json({ error: "Lecture de la configuration globale iNr'Agent impossible" }, { status: 500 });
  }

  const { data: automationData, error: automationError } = await supabaseAdmin
    .from("inr_agent_automation_settings")
    .select(AUTOMATION_SELECT)
    .eq("user_id", user.id);

  if (automationError) {
    if (isMissingSchemaError(automationError)) {
      return NextResponse.json({ settings: sanitizeInrAgentSettings(null), tableMissing: true });
    }
    console.warn("[inr-agent-settings] automations read failed", automationError);
    return NextResponse.json({ error: "Lecture des automatisations iNr'Agent impossible" }, { status: 500 });
  }

  return NextResponse.json({
    settings: rowsToSettings(globalData as DbAgentGlobalSettingsRow | null, Array.isArray(automationData) ? automationData as DbAgentAutomationSettingsRow[] : []),
    tableMissing: false,
  });
}

export async function POST(request: Request) {
  const { user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const settings = sanitizeInrAgentSettings((body as { settings?: Partial<InrAgentSettings> } | null)?.settings);
  const now = new Date().toISOString();

  const globalPayload = {
    user_id: user.id,
    global_enabled: settings.globalEnabled,
    tone: settings.tone,
    timezone: settings.timezone,
    metadata: {
      version: 2,
      legacy: {
        goal: settings.goal,
        allowedActions: settings.allowedActions,
        allowAiImages: settings.allowAiImages,
      },
    },
    updated_at: now,
  };

  const { error: globalError } = await supabaseAdmin
    .from("inr_agent_settings")
    .upsert(globalPayload, { onConflict: "user_id" });

  if (globalError) {
    if (isMissingSchemaError(globalError)) {
      return NextResponse.json({ error: "Les tables iNr'Agent V2 doivent être créées dans Supabase avant d'enregistrer.", tableMissing: true }, { status: 500 });
    }
    console.warn("[inr-agent-settings] global save failed", globalError);
    return NextResponse.json({ error: "Enregistrement de la configuration globale iNr'Agent impossible" }, { status: 500 });
  }

  const automationPayloads = INR_AGENT_AUTOMATION_KEYS.map((key: InrAgentAutomationKey) => automationSettingsToDbRow(user.id, key, settings.automations[key]));
  const { error: automationError } = await supabaseAdmin
    .from("inr_agent_automation_settings")
    .upsert(automationPayloads, { onConflict: "user_id,automation_key" });

  if (automationError) {
    if (isMissingSchemaError(automationError)) {
      return NextResponse.json({ error: "La table inr_agent_automation_settings doit être créée dans Supabase avant d'enregistrer.", tableMissing: true }, { status: 500 });
    }
    console.warn("[inr-agent-settings] automations save failed", automationError);
    return NextResponse.json({ error: "Enregistrement des automatisations iNr'Agent impossible" }, { status: 500 });
  }

  return NextResponse.json({ settings, saved: true, tableMissing: false });
}

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sanitizeInrAgentSettings, type InrAgentSettings } from "@/lib/inrAgentSettings";

type DbAgentSettingsRow = {
  enabled?: boolean | null;
  frequency?: string | null;
  day_of_week?: number | null;
  time?: string | null;
  mode?: string | null;
  goal?: string | null;
  tone?: string | null;
  allowed_actions?: string[] | null;
  allowed_channels?: string[] | null;
  use_media_library?: boolean | null;
  allow_ai_images?: boolean | null;
};

function rowToSettings(row: DbAgentSettingsRow | null | undefined): InrAgentSettings {
  return sanitizeInrAgentSettings({
    enabled: Boolean(row?.enabled),
    frequency: row?.frequency as InrAgentSettings["frequency"],
    dayOfWeek: row?.day_of_week ?? undefined,
    time: row?.time ?? undefined,
    mode: row?.mode as InrAgentSettings["mode"],
    goal: row?.goal as InrAgentSettings["goal"],
    tone: row?.tone as InrAgentSettings["tone"],
    allowedActions: row?.allowed_actions as InrAgentSettings["allowedActions"],
    allowedChannels: row?.allowed_channels as InrAgentSettings["allowedChannels"],
    useMediaLibrary: row?.use_media_library ?? undefined,
    allowAiImages: row?.allow_ai_images ?? undefined,
  });
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42P01" || error?.code === "PGRST205" || message.includes("inr_agent_settings");
}

export async function GET() {
  const { user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const { data, error } = await supabaseAdmin
    .from("inr_agent_settings")
    .select("enabled, frequency, day_of_week, time, mode, goal, tone, allowed_actions, allowed_channels, use_media_library, allow_ai_images")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ settings: sanitizeInrAgentSettings(null), tableMissing: true });
    }
    console.warn("[inr-agent-settings] read failed", error);
    return NextResponse.json({ error: "Lecture de la configuration iNr'Agent impossible" }, { status: 500 });
  }

  return NextResponse.json({ settings: rowToSettings(data as DbAgentSettingsRow | null), tableMissing: false });
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
  const payload = {
    user_id: user.id,
    enabled: settings.enabled,
    frequency: settings.frequency,
    day_of_week: settings.dayOfWeek,
    time: settings.time,
    mode: settings.mode,
    goal: settings.goal,
    tone: settings.tone,
    allowed_actions: settings.allowedActions,
    allowed_channels: settings.allowedChannels,
    use_media_library: settings.useMediaLibrary,
    allow_ai_images: settings.allowAiImages,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("inr_agent_settings")
    .upsert(payload, { onConflict: "user_id" })
    .select("enabled, frequency, day_of_week, time, mode, goal, tone, allowed_actions, allowed_channels, use_media_library, allow_ai_images")
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ error: "La table inr_agent_settings doit être créée dans Supabase avant d'enregistrer.", tableMissing: true }, { status: 500 });
    }
    console.warn("[inr-agent-settings] save failed", error);
    return NextResponse.json({ error: "Enregistrement de la configuration iNr'Agent impossible" }, { status: 500 });
  }

  return NextResponse.json({ settings: rowToSettings(data as DbAgentSettingsRow), saved: true });
}

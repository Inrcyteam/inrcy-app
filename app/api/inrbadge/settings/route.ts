import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import {
  normalizeInrBadgeAppointmentSettings,
  normalizeInrBadgeShareSettings,
  sanitizeInrBadgeAppointmentSettingsPayload,
  sanitizeInrBadgeShareSettingsPayload,
} from "@/lib/inrBadgeSettings";

function safeObj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function GET() {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const { data, error } = await supabase
    .from("pro_tools_configs")
    .select("settings")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return jsonUserFacingError(error, { status: 500 });

  const rootSettings = safeObj(data?.settings);
  return NextResponse.json({
    ok: true,
    settings: normalizeInrBadgeShareSettings(rootSettings.inrBadgeShareSettings),
    appointmentSettings: normalizeInrBadgeAppointmentSettings(rootSettings.inrBadgeAppointmentSettings),
  });
}

export async function PATCH(req: Request) {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => ({}));
  const input = safeObj(body);

  const { data: current, error: currentError } = await supabase
    .from("pro_tools_configs")
    .select("settings")
    .eq("user_id", user.id)
    .maybeSingle();

  if (currentError) return jsonUserFacingError(currentError, { status: 500 });

  const currentSettings = safeObj(current?.settings);
  const hasShareSettings = Object.prototype.hasOwnProperty.call(input, "settings");
  const hasAppointmentSettings = Object.prototype.hasOwnProperty.call(input, "appointmentSettings");
  const nextShareSettings = hasShareSettings
    ? sanitizeInrBadgeShareSettingsPayload(input.settings)
    : normalizeInrBadgeShareSettings(currentSettings.inrBadgeShareSettings);
  const nextAppointmentSettings = hasAppointmentSettings
    ? sanitizeInrBadgeAppointmentSettingsPayload(input.appointmentSettings)
    : normalizeInrBadgeAppointmentSettings(currentSettings.inrBadgeAppointmentSettings);

  const nextSettings = {
    ...currentSettings,
    inrBadgeShareSettings: nextShareSettings,
    inrBadgeAppointmentSettings: nextAppointmentSettings,
  };

  const { error } = await supabase
    .from("pro_tools_configs")
    .upsert({ user_id: user.id, settings: nextSettings }, { onConflict: "user_id" });

  if (error) return jsonUserFacingError(error, { status: 500 });

  return NextResponse.json({ ok: true, settings: nextShareSettings, appointmentSettings: nextAppointmentSettings });
}

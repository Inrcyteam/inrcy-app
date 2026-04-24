import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";

const DEFAULT_REMINDER_OFFSETS_MINUTES = [1440, 120];
const ALLOWED_REMINDER_OFFSETS_MINUTES = [2880, 1440, 120];

function safeObj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function hasOwn(obj: unknown, key: string) {
  return Object.prototype.hasOwnProperty.call(safeObj(obj), key);
}

function normalizeReminderOffsets(value: unknown) {
  if (!Array.isArray(value)) return DEFAULT_REMINDER_OFFSETS_MINUTES;
  return Array.from(
    new Set(
      value
        .map((item) => Number(item))
        .filter((item) => ALLOWED_REMINDER_OFFSETS_MINUTES.includes(item))
    )
  );
}

type MailIntegrationRow = {
  id: string;
  provider: string | null;
  account_email: string | null;
  settings: unknown;
};

export async function GET() {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const [accountsRes, settingsRes] = await Promise.all([
    supabase
      .from("integrations")
      .select("id, provider, account_email, settings, status, created_at")
      .eq("user_id", user.id)
      .eq("category", "mail")
      .eq("status", "connected")
      .in("provider", ["gmail", "microsoft", "imap"])
      .order("created_at", { ascending: true }),
    supabase.from("pro_tools_configs").select("settings").eq("user_id", user.id).maybeSingle(),
  ]);

  if (accountsRes.error) return jsonUserFacingError(accountsRes.error, { status: 500 });
  if (settingsRes.error) return jsonUserFacingError(settingsRes.error, { status: 500 });

  const rootSettings = safeObj(settingsRes.data?.settings);
  const inrcalendar = safeObj(rootSettings.inrcalendar);
  const selectedMailAccountId = typeof inrcalendar.selected_mail_account_id === "string" ? inrcalendar.selected_mail_account_id : "";
  const sendConfirmationOnSave = inrcalendar.send_confirmation_on_save === true;
  const reminderOffsetsMinutes = normalizeReminderOffsets(inrcalendar.reminder_offsets_minutes);

  const accounts = (accountsRes.data ?? []).map((row: MailIntegrationRow) => {
    const settings = safeObj(row.settings);
    return {
      id: row.id,
      provider: row.provider,
      email_address: row.account_email || "",
      display_name: typeof settings.display_name === "string" ? settings.display_name : null,
    };
  });

  return NextResponse.json({
    ok: true,
    selectedMailAccountId,
    sendConfirmationOnSave,
    reminderOffsetsMinutes,
    accounts,
  });
}

export async function PATCH(req: Request) {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => ({}));

  const { data: current, error: currentError } = await supabase
    .from("pro_tools_configs")
    .select("settings")
    .eq("user_id", user.id)
    .maybeSingle();
  if (currentError) return jsonUserFacingError(currentError, { status: 500 });

  const currentSettings = safeObj(current?.settings);
  const currentInrCalendar = safeObj(currentSettings.inrcalendar);

  const selectedMailAccountId = hasOwn(body, "selectedMailAccountId")
    ? String(body?.selectedMailAccountId || "").trim()
    : typeof currentInrCalendar.selected_mail_account_id === "string"
      ? currentInrCalendar.selected_mail_account_id
      : "";

  if (selectedMailAccountId) {
    const { data: exists, error: existsError } = await supabase
      .from("integrations")
      .select("id")
      .eq("id", selectedMailAccountId)
      .eq("user_id", user.id)
      .eq("category", "mail")
      .eq("status", "connected")
      .maybeSingle();

    if (existsError) return jsonUserFacingError(existsError, { status: 500 });
    if (!exists?.id) return NextResponse.json({ ok: false, error: "Boîte d’envoi introuvable." }, { status: 404 });
  }

  const sendConfirmationOnSave = hasOwn(body, "sendConfirmationOnSave")
    ? body?.sendConfirmationOnSave === true
    : currentInrCalendar.send_confirmation_on_save === true;

  const reminderOffsetsMinutes = hasOwn(body, "reminderOffsetsMinutes")
    ? normalizeReminderOffsets(body?.reminderOffsetsMinutes)
    : normalizeReminderOffsets(currentInrCalendar.reminder_offsets_minutes);

  const nextSettings = {
    ...currentSettings,
    inrcalendar: {
      ...currentInrCalendar,
      selected_mail_account_id: selectedMailAccountId || null,
      send_confirmation_on_save: sendConfirmationOnSave,
      reminder_offsets_minutes: reminderOffsetsMinutes,
    },
  };

  const { error } = await supabase.from("pro_tools_configs").upsert({ user_id: user.id, settings: nextSettings }, { onConflict: "user_id" });
  if (error) return jsonUserFacingError(error, { status: 500 });

  return NextResponse.json({
    ok: true,
    selectedMailAccountId: selectedMailAccountId || "",
    sendConfirmationOnSave,
    reminderOffsetsMinutes,
  });
}

import { NextResponse } from "next/server";
import { buildInternalCronHeaders, getAppOriginFromRequest, isAuthorizedCronRequest } from "@/lib/cronAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { InrAgentAutomationKey, InrAgentFrequency } from "@/lib/inrAgentSettings";

export const runtime = "nodejs";

const AUTOMATION_KEYS: InrAgentAutomationKey[] = ["publish", "grow", "loyalty", "stats"];
const OPEN_ACTION_STATUSES = ["prepared", "pending_validation", "pending", "draft", "scheduled", "validated", "executing"];
const AUTOMATION_SELECT = "user_id, automation_key, enabled, frequency, day_of_week, time, next_run_at, last_prepared_at, last_executed_at, metadata";

type AutomationRow = {
  user_id: string;
  automation_key: InrAgentAutomationKey;
  enabled: boolean | null;
  frequency: InrAgentFrequency | null;
  day_of_week: number | null;
  time: string | null;
  next_run_at: string | null;
  last_prepared_at: string | null;
  last_executed_at: string | null;
  metadata: Record<string, unknown> | null;
};

type CronRunResult = {
  userId: string;
  automationKey: InrAgentAutomationKey;
  status: "prepared" | "sent" | "skipped" | "failed" | "dry_run";
  reason?: string;
  actionId?: string | null;
  nextRunAt?: string | null;
  error?: string;
};

function isMissingSchemaError(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42P01" || error?.code === "42703" || error?.code === "PGRST205" || message.includes("inr_agent_");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeTime(value: unknown) {
  const text = String(value || "09:00").trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : "09:00";
}

function normalizeDay(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 6 ? Math.round(n) : 1;
}

function normalizeFrequency(value: unknown): InrAgentFrequency {
  const text = String(value || "weekly") as InrAgentFrequency;
  return ["weekly", "twice_weekly", "biweekly", "monthly", "quarterly", "one_off"].includes(text) ? text : "weekly";
}

function getLocalParts(date: Date, timeZone = "Europe/Paris") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: weekdayMap[map.weekday] ?? 1,
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getLocalParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

function zonedTimeToUtc(parts: { year: number; month: number; day: number; hour: number; minute: number }, timeZone: string) {
  let utc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  for (let index = 0; index < 3; index += 1) {
    const offset = getTimeZoneOffsetMs(new Date(utc), timeZone);
    utc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0) - offset;
  }
  return new Date(utc);
}

function addLocalDays(base: ReturnType<typeof getLocalParts>, days: number) {
  const d = new Date(Date.UTC(base.year, base.month - 1, base.day + days, 12, 0, 0));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function timeParts(time: string) {
  const [hourRaw, minuteRaw] = normalizeTime(time).split(":");
  return { hour: Number(hourRaw), minute: Number(minuteRaw) };
}

function scheduledWeekdays(frequency: InrAgentFrequency, dayOfWeek: number) {
  if (frequency === "twice_weekly") return Array.from(new Set([dayOfWeek, (dayOfWeek + 3) % 7]));
  return [dayOfWeek];
}

function isFirstScheduledWeekdayOfMonth(local: ReturnType<typeof getLocalParts>, dayOfWeek: number) {
  return local.weekday === dayOfWeek && local.day <= 7;
}

function isThirdScheduledWeekdayOfMonth(local: ReturnType<typeof getLocalParts>, dayOfWeek: number) {
  return local.weekday === dayOfWeek && local.day >= 15 && local.day <= 21;
}

function isScheduledDate(local: ReturnType<typeof getLocalParts>, frequency: InrAgentFrequency, dayOfWeek: number) {
  if (frequency === "twice_weekly") return scheduledWeekdays(frequency, dayOfWeek).includes(local.weekday);
  if (frequency === "biweekly") return isFirstScheduledWeekdayOfMonth(local, dayOfWeek) || isThirdScheduledWeekdayOfMonth(local, dayOfWeek);
  if (frequency === "monthly") return isFirstScheduledWeekdayOfMonth(local, dayOfWeek);
  if (frequency === "quarterly") return [1, 4, 7, 10].includes(local.month) && isFirstScheduledWeekdayOfMonth(local, dayOfWeek);
  return local.weekday === dayOfWeek;
}

function localBucket(date: Date, timeZone: string, frequency: InrAgentFrequency) {
  const local = getLocalParts(date, timeZone);
  const y = String(local.year);
  const m = String(local.month).padStart(2, "0");
  const d = String(local.day).padStart(2, "0");
  if (frequency === "monthly") return `${y}-${m}`;
  if (frequency === "quarterly") return `${y}-Q${Math.floor((local.month - 1) / 3) + 1}`;
  if (frequency === "biweekly") return `${y}-${m}-${local.day <= 14 ? "H1" : "H2"}`;
  return `${y}-${m}-${d}`;
}

function referenceDate(row: AutomationRow) {
  const ref = row.automation_key === "stats" ? row.last_executed_at : row.last_prepared_at;
  const parsed = ref ? Date.parse(ref) : NaN;
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

function isDue(row: AutomationRow, now: Date, timeZone: string) {
  if (!row.enabled) return false;
  const nextRun = row.next_run_at ? Date.parse(row.next_run_at) : NaN;
  if (Number.isFinite(nextRun)) return nextRun <= now.getTime();

  const frequency = normalizeFrequency(row.frequency);
  if (frequency === "one_off" && referenceDate(row)) return false;

  const local = getLocalParts(now, timeZone);
  const schedule = timeParts(row.time || "09:00");
  const minuteNow = local.hour * 60 + local.minute;
  const minuteSchedule = schedule.hour * 60 + schedule.minute;
  if (minuteNow < minuteSchedule) return false;

  const day = normalizeDay(row.day_of_week);
  if (!isScheduledDate(local, frequency, day)) return false;

  const ref = referenceDate(row);
  if (!ref) return true;
  return localBucket(ref, timeZone, frequency) !== localBucket(now, timeZone, frequency);
}

function computeNextRunAt(row: AutomationRow, after: Date, timeZone: string) {
  const frequency = normalizeFrequency(row.frequency);
  if (frequency === "one_off") return null;

  const start = getLocalParts(new Date(after.getTime() + 60 * 1000), timeZone);
  const dayOfWeek = normalizeDay(row.day_of_week);
  const schedule = timeParts(row.time || "09:00");
  for (let offset = 0; offset <= 110; offset += 1) {
    const localDate = addLocalDays(start, offset);
    const candidateUtc = zonedTimeToUtc({ ...localDate, ...schedule }, timeZone);
    if (candidateUtc.getTime() <= after.getTime()) continue;
    const candidateLocal = getLocalParts(candidateUtc, timeZone);
    if (isScheduledDate(candidateLocal, frequency, dayOfWeek)) return candidateUtc.toISOString();
  }
  return null;
}

function dedupeSince(row: AutomationRow, now: Date) {
  const frequency = normalizeFrequency(row.frequency);
  const days = frequency === "twice_weekly" ? 3 : frequency === "weekly" ? 7 : frequency === "biweekly" ? 15 : frequency === "monthly" ? 31 : frequency === "quarterly" ? 95 : 1;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function hasOpenPreparedAction(row: AutomationRow, now: Date) {
  if (row.automation_key === "stats") return false;
  const { data, error } = await supabaseAdmin
    .from("inr_agent_actions")
    .select("id")
    .eq("user_id", row.user_id)
    .eq("automation_key", row.automation_key)
    .in("status", OPEN_ACTION_STATUSES)
    .gte("created_at", dedupeSince(row, now))
    .limit(1);

  if (error) return false;
  return Boolean(Array.isArray(data) && data.length > 0);
}

function endpointForAutomation(key: InrAgentAutomationKey) {
  if (key === "publish") return "/api/agent/actions/prepare-publish";
  if (key === "stats") return "/api/agent/actions/send-stats-report";
  return "/api/agent/actions/prepare-campaign";
}

async function triggerAutomation(args: { origin: string; row: AutomationRow; timeoutMs: number }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    const url = `${args.origin}${endpointForAutomation(args.row.automation_key)}`;
    const body: Record<string, unknown> = { cronUserId: args.row.user_id, triggeredBy: "inr_agent_cron" };
    if (args.row.automation_key === "grow" || args.row.automation_key === "loyalty") body.automationKey = args.row.automation_key;

    const response = await fetch(url, {
      method: "POST",
      headers: buildInternalCronHeaders(args.row.user_id),
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      const message = String(asRecord(payload).error || asRecord(payload).detail || response.statusText || "Action impossible");
      return { ok: false, payload, error: message };
    }
    return { ok: true, payload, error: null };
  } catch (error) {
    return { ok: false, payload: null, error: error instanceof Error ? error.message : "Action impossible" };
  } finally {
    clearTimeout(timeout);
  }
}

async function updateAutomationAfterRun(row: AutomationRow, nextRunAt: string | null, extraMetadata: Record<string, unknown>) {
  const now = new Date().toISOString();
  const metadata = { ...asRecord(row.metadata), ...extraMetadata };
  await supabaseAdmin
    .from("inr_agent_automation_settings")
    .update({ next_run_at: nextRunAt, metadata, updated_at: now })
    .eq("user_id", row.user_id)
    .eq("automation_key", row.automation_key);
}

function getActionId(payload: Record<string, unknown> | null) {
  const action = asRecord(payload?.action);
  return typeof action.id === "string" ? action.id : null;
}

async function processAutomation(args: { row: AutomationRow; origin: string; now: Date; timeZone: string; dryRun: boolean; timeoutMs: number }): Promise<CronRunResult> {
  const { row, now, timeZone } = args;
  const nextRunAt = computeNextRunAt(row, now, timeZone);

  if (!isDue(row, now, timeZone)) {
    if (!args.dryRun && !row.next_run_at && nextRunAt) {
      await updateAutomationAfterRun(row, nextRunAt, {
        lastCronSkip: "not_due",
        lastCronSkipAt: now.toISOString(),
      });
    }
    return { userId: row.user_id, automationKey: row.automation_key, status: "skipped", reason: "not_due", nextRunAt: row.next_run_at || nextRunAt };
  }

  if (await hasOpenPreparedAction(row, now)) {
    await updateAutomationAfterRun(row, nextRunAt, {
      lastCronSkip: "open_action_already_pending",
      lastCronSkipAt: now.toISOString(),
    });
    return { userId: row.user_id, automationKey: row.automation_key, status: "skipped", reason: "open_action_already_pending", nextRunAt };
  }

  if (args.dryRun) {
    return { userId: row.user_id, automationKey: row.automation_key, status: "dry_run", reason: "would_trigger", nextRunAt };
  }

  const triggered = await triggerAutomation({ origin: args.origin, row, timeoutMs: args.timeoutMs });
  if (!triggered.ok) {
    await updateAutomationAfterRun(row, nextRunAt, {
      lastCronStatus: "failed",
      lastCronError: triggered.error,
      lastCronErrorAt: now.toISOString(),
    });
    return { userId: row.user_id, automationKey: row.automation_key, status: "failed", error: triggered.error || "Action impossible", nextRunAt };
  }

  await updateAutomationAfterRun(row, nextRunAt, {
    lastCronStatus: "success",
    lastCronError: null,
    lastCronSuccessAt: now.toISOString(),
  });

  return {
    userId: row.user_id,
    automationKey: row.automation_key,
    status: row.automation_key === "stats" ? "sent" : "prepared",
    actionId: getActionId(triggered.payload),
    nextRunAt,
  };
}

export async function POST(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const url = new URL(req.url);
  const now = new Date();
  const origin = getAppOriginFromRequest(req);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const maxRows = Math.min(100, Math.max(1, Number(url.searchParams.get("max") || 30)));
  const timeoutMs = Math.min(120_000, Math.max(15_000, Number(url.searchParams.get("timeoutMs") || 60_000)));

  const { data: globalRows, error: globalError } = await supabaseAdmin
    .from("inr_agent_settings")
    .select("user_id, global_enabled, timezone")
    .eq("global_enabled", true)
    .limit(maxRows);

  if (globalError) {
    if (isMissingSchemaError(globalError)) {
      return NextResponse.json({ success: false, tableMissing: true, error: "Tables iNr’Agent V2 manquantes." }, { status: 500 });
    }
    return NextResponse.json({ success: false, error: globalError.message }, { status: 500 });
  }

  const userTimezone = new Map<string, string>();
  const userIds = (Array.isArray(globalRows) ? globalRows : [])
    .map((row: any) => {
      const userId = String(row.user_id || "");
      if (userId) userTimezone.set(userId, String(row.timezone || "Europe/Paris"));
      return userId;
    })
    .filter(Boolean);

  if (!userIds.length) {
    return NextResponse.json({ success: true, processed: 0, results: [], dryRun });
  }

  const { data: automationRows, error: automationError } = await supabaseAdmin
    .from("inr_agent_automation_settings")
    .select(AUTOMATION_SELECT)
    .in("user_id", userIds)
    .in("automation_key", AUTOMATION_KEYS)
    .eq("enabled", true)
    .order("next_run_at", { ascending: true, nullsFirst: true })
    .limit(maxRows * AUTOMATION_KEYS.length);

  if (automationError) {
    if (isMissingSchemaError(automationError)) {
      return NextResponse.json({ success: false, tableMissing: true, error: "Table inr_agent_automation_settings manquante." }, { status: 500 });
    }
    return NextResponse.json({ success: false, error: automationError.message }, { status: 500 });
  }

  const rows = (Array.isArray(automationRows) ? automationRows : []) as AutomationRow[];
  const results: CronRunResult[] = [];

  for (const row of rows) {
    const timeZone = userTimezone.get(row.user_id) || "Europe/Paris";
    results.push(await processAutomation({ row, origin, now, timeZone, dryRun, timeoutMs }));
  }

  const summary = results.reduce<Record<string, number>>((acc, result) => {
    acc[result.status] = (acc[result.status] || 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    success: true,
    dryRun,
    processed: results.length,
    summary,
    results,
  });
}

export async function GET(req: Request) {
  return POST(req);
}

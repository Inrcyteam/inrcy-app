import { NextResponse } from "next/server";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { requireUser } from "@/lib/requireUser";
import { getIsoWeekStart, getIsoWeekId } from "@/lib/weeklyGoals";

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

type EventRow = {
  type: "newsletter_mail" | "thanks_mail" | "satisfaction_mail";
  created_at: string;
  payload: unknown;
};

type CampaignRow = {
  track_kind: string | null;
  track_type: string | null;
  folder: string | null;
  created_at: string;
  sent_count: number | null;
  total_count: number | null;
};

function daysAgoISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function positiveNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function eventRecipients(payload: Record<string, unknown>) {
  // An app_event is created only after a successful direct send.
  // Old tracked events did not always store recipients, so fallback to 1.
  return positiveNumber(payload["recipients"], 1);
}

function rememberLatest(target: { last_sent_at: string | null }, iso: string) {
  if (!target.last_sent_at || new Date(iso) > new Date(target.last_sent_at)) {
    target.last_sent_at = iso;
  }
}

function matchesCampaignType(row: CampaignRow, type: "newsletter_mail" | "thanks_mail" | "satisfaction_mail") {
  const kind = String(row.track_kind || "").toLowerCase();
  const trackType = String(row.track_type || "").toLowerCase();
  const folder = String(row.folder || "").toLowerCase();
  const expectedFolder =
    type === "newsletter_mail" ? "informations" :
    type === "thanks_mail" ? "suivis" :
    "enquetes";

  if (kind === "fideliser" && trackType === type) return true;
  if (kind === "fideliser" && !trackType && folder === expectedFolder) return true;
  if (!kind && trackType === type) return true;
  if (!kind && !trackType && folder === expectedFolder) return true;
  return false;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days") ?? 30)));

  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;
  const userId = user.id;
  const sinceMonth = daysAgoISO(days);
  const sinceWeek = getIsoWeekStart();

  const eventsPromise = supabase
    .from("app_events")
    .select("type, created_at, payload")
    .eq("user_id", userId)
    .eq("module", "fideliser")
    .gte("created_at", sinceMonth)
    .order("created_at", { ascending: false });

  const campaignsPromise = supabase
    .from("mail_campaigns")
    .select("track_kind, track_type, folder, created_at, sent_count, total_count")
    .eq("user_id", userId)
    .gte("created_at", sinceMonth)
    .gt("sent_count", 0)
    .order("created_at", { ascending: false });

  const [{ data: rows, error }, { data: campaignRows, error: campaignError }] = await Promise.all([
    eventsPromise,
    campaignsPromise,
  ]);

  if (error) return jsonUserFacingError(error, { status: 500 });
  if (campaignError) return jsonUserFacingError(campaignError, { status: 500 });

  const events = (rows ?? []) as EventRow[];
  const campaigns = (campaignRows ?? []) as CampaignRow[];

  const init = () => ({
    month: 0,
    week: 0,
    sent: 0,
    last_sent_at: null as string | null,
  });

  const newsletter_mail = init();
  const thanks_mail = init();
  const satisfaction_mail = init();

  const isWeek = (iso: string) => new Date(iso) >= sinceWeek;

  for (const e of events) {
    const inWeek = isWeek(e.created_at);
    const recipients = eventRecipients(asRecord(e.payload));

    if (e.type === "newsletter_mail") {
      newsletter_mail.month += 1;
      if (inWeek) newsletter_mail.week += 1;
      newsletter_mail.sent += recipients;
      rememberLatest(newsletter_mail, e.created_at);
    }

    if (e.type === "thanks_mail") {
      thanks_mail.month += 1;
      if (inWeek) thanks_mail.week += 1;
      thanks_mail.sent += recipients;
      rememberLatest(thanks_mail, e.created_at);
    }

    if (e.type === "satisfaction_mail") {
      satisfaction_mail.month += 1;
      if (inWeek) satisfaction_mail.week += 1;
      satisfaction_mail.sent += recipients;
      rememberLatest(satisfaction_mail, e.created_at);
    }
  }

  for (const campaign of campaigns) {
    const sent = positiveNumber(campaign.sent_count);
    if (sent <= 0) continue;
    const inWeek = isWeek(campaign.created_at);

    if (matchesCampaignType(campaign, "newsletter_mail")) {
      newsletter_mail.month += 1;
      if (inWeek) newsletter_mail.week += 1;
      newsletter_mail.sent += sent;
      rememberLatest(newsletter_mail, campaign.created_at);
    }

    if (matchesCampaignType(campaign, "thanks_mail")) {
      thanks_mail.month += 1;
      if (inWeek) thanks_mail.week += 1;
      thanks_mail.sent += sent;
      rememberLatest(thanks_mail, campaign.created_at);
    }

    if (matchesCampaignType(campaign, "satisfaction_mail")) {
      satisfaction_mail.month += 1;
      if (inWeek) satisfaction_mail.week += 1;
      satisfaction_mail.sent += sent;
      rememberLatest(satisfaction_mail, campaign.created_at);
    }
  }

  return NextResponse.json({
    range_days: days,
    week_id: getIsoWeekId(),
    week_start: sinceWeek.toISOString(),
    newsletter_mail: {
      month: newsletter_mail.month,
      week: newsletter_mail.week,
      sent: newsletter_mail.sent,
      last_sent_at: newsletter_mail.last_sent_at,
      opened: 0,
      clicked: 0,
      unsub: 0,
    },
    thanks_mail: {
      month: thanks_mail.month,
      week: thanks_mail.week,
      sent: thanks_mail.sent,
      last_sent_at: thanks_mail.last_sent_at,
      opened: 0,
      clicked: 0,
      replies: 0,
    },
    satisfaction_mail: {
      month: satisfaction_mail.month,
      week: satisfaction_mail.week,
      sent: satisfaction_mail.sent,
      last_sent_at: satisfaction_mail.last_sent_at,
      opened: 0,
      reviews: 0,
      scores: 0,
    },
  });
}

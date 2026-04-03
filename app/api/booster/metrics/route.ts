import { NextResponse } from "next/server";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { requireUser } from "@/lib/requireUser";
import { getIsoWeekStart, getIsoWeekId } from "@/lib/weeklyGoals";

type JsonRecord = Record<string, unknown>;
const asRecord = (v: unknown): JsonRecord =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as JsonRecord) : {};

type EventRow = {
  type: "publish" | "review_mail" | "promo_mail";
  created_at: string;
  payload: unknown;
};

function daysAgoISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days") ?? 30)));

  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;
  const userId = user.id;

  const sinceMonth = daysAgoISO(days);
  const sinceWeek = getIsoWeekStart();

  const { data: rows, error } = await supabase
    .from("app_events")
    .select("type, created_at, payload")
    .eq("user_id", userId)
    .eq("module", "booster")
    .gte("created_at", sinceMonth)
    .order("created_at", { ascending: false });

  if (error) return jsonUserFacingError(error, { status: 500 });

  const events = (rows ?? []) as EventRow[];

  const init = () => ({
    month: 0,
    week: 0,
    channels: { inrcy_site: 0, site_web: 0, gmb: 0, facebook: 0, instagram: 0, linkedin: 0 } as Record<string, number>,
    sent: 0,
  });

  const publish = init();
  const review_mail = init();
  const promo_mail = init();

  const isWeek = (iso: string) => new Date(iso) >= sinceWeek;

  for (const e of events) {
    const payload = asRecord(e.payload);
    const inWeek = isWeek(e.created_at);

    if (e.type === "publish") {
      publish.month += 1;
      if (inWeek) publish.week += 1;

      const ch = Array.isArray(payload["channels"]) ? (payload["channels"] as unknown[]) : [];
      for (const c of ch) {
        if (typeof c === "string") {
          publish.channels[c] = (publish.channels[c] ?? 0) + 1;
        }
      }
    }

    if (e.type === "review_mail") {
      review_mail.month += 1;
      if (inWeek) review_mail.week += 1;
      review_mail.sent += Number(payload["recipients"] ?? 0);
    }

    if (e.type === "promo_mail") {
      promo_mail.month += 1;
      if (inWeek) promo_mail.week += 1;
      promo_mail.sent += Number(payload["recipients"] ?? 0);
    }
  }

  return NextResponse.json({
    range_days: days,
    week_id: getIsoWeekId(),
    week_start: sinceWeek.toISOString(),
    publish: {
      month: publish.month,
      week: publish.week,
      channels: publish.channels,
    },
    review_mail: {
      month: review_mail.month,
      week: review_mail.week,
      sent: review_mail.sent,
      opened: 0,
      clicked: 0,
      reviews: 0,
    },
    promo_mail: {
      month: promo_mail.month,
      week: promo_mail.week,
      sent: promo_mail.sent,
      opened: 0,
      clicked: 0,
      leads: 0,
    },
  });
}

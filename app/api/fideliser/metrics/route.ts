import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

type EventRow = {
  type: "newsletter_mail" | "thanks_mail" | "satisfaction_mail";
  created_at: string;
  payload: any;
};

function daysAgoISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days") ?? 30)));

  const supabase = await createSupabaseServer();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sinceMonth = daysAgoISO(days);
  const sinceWeek = daysAgoISO(7);

  const { data: rows, error } = await supabase
    .from("fideliser_events")
    .select("type, created_at, payload")
    .eq("user_id", userData.user.id)
    .gte("created_at", sinceMonth)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const events = (rows ?? []) as EventRow[];

  const init = () => ({
    month: 0,
    week: 0,
    sent: 0,
  });

  const newsletter_mail = init();
  const thanks_mail = init();
  const satisfaction_mail = init();

  const isWeek = (iso: string) => new Date(iso).toISOString() >= sinceWeek;

  for (const e of events) {
    const inWeek = isWeek(e.created_at);
    const recipients = Number(e.payload?.recipients ?? 0);

    if (e.type === "newsletter_mail") {
      newsletter_mail.month += 1;
      if (inWeek) newsletter_mail.week += 1;
      newsletter_mail.sent += recipients;
    }

    if (e.type === "thanks_mail") {
      thanks_mail.month += 1;
      if (inWeek) thanks_mail.week += 1;
      thanks_mail.sent += recipients;
    }

    if (e.type === "satisfaction_mail") {
      satisfaction_mail.month += 1;
      if (inWeek) satisfaction_mail.week += 1;
      satisfaction_mail.sent += recipients;
    }
  }

  return NextResponse.json({
    range_days: days,
    newsletter_mail: {
      month: newsletter_mail.month,
      week: newsletter_mail.week,
      sent: newsletter_mail.sent,
      opened: 0,
      clicked: 0,
      unsub: 0,
    },
    thanks_mail: {
      month: thanks_mail.month,
      week: thanks_mail.week,
      sent: thanks_mail.sent,
      opened: 0,
      clicked: 0,
      replies: 0,
    },
    satisfaction_mail: {
      month: satisfaction_mail.month,
      week: satisfaction_mail.week,
      sent: satisfaction_mail.sent,
      opened: 0,
      reviews: 0,
      scores: 0,
    },
  });
}

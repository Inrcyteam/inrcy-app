import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireEnv } from "@/lib/env";
import { sendTxMail } from "@/lib/txMailer";

export const runtime = "nodejs";

function daysBetween(a: Date, b: Date) {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (24 * 3600 * 1000));
}

export async function GET(req: Request) {
  // Simple auth for cron
  const secret = requireEnv("CRON_SECRET");
  const got = req.headers.get("x-cron-secret") || "";
  if (got !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();

  // 1) Trial reminders (J20, J23, J27)
  const { data: trials, error: tErr } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id, contact_email, trial_start_at, trial_end_at, status, last_trial_reminder_day")
    .eq("status", "essai");

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

  const remindDays = [20, 23, 27];
  let sent = 0;

  for (const s of trials || []) {
    const start = s.trial_start_at ? new Date(s.trial_start_at) : null;
    const end = s.trial_end_at ? new Date(s.trial_end_at) : null;
    if (!start || !end) continue;

    // expired trials handled below
    if (now >= end) continue;

    const d = daysBetween(start, now);
    if (!remindDays.includes(d)) continue;

    const already = Number(s.last_trial_reminder_day || 0);
    if (already >= d) continue;

    const to = s.contact_email;
    if (!to) continue;

    await sendTxMail({
      to,
      subject: `iNrCy — Ton essai se termine bientôt`,
      text: `Hello !\n\nTon essai iNrCy arrive à la fin (${end.toLocaleDateString("fr-FR")}).\n\nPour continuer après l'essai, connecte-toi et clique sur “S’abonner”.\n\nÀ très vite !`,
    });

    await supabaseAdmin
      .from("subscriptions")
      .update({ last_trial_reminder_day: d, last_reminder_at: new Date().toISOString() })
      .eq("user_id", s.user_id);

    sent++;
  }

  // 2) Auto delete after day 30 if not subscribed
  const { data: maybeExpired, error: eErr } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id, trial_end_at, status")
    .in("status", ["essai", "suspendu", "résilié"]);

  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });

  let deleted = 0;
  for (const s of maybeExpired || []) {
    const end = s.trial_end_at ? new Date(s.trial_end_at) : null;
    if (!end) continue;
    if (now < end) continue;

    // If still not active at trial end -> delete user + subscription row
    // (Your other tables should be ON DELETE CASCADE from user_id)
    try {
      await supabaseAdmin.from("subscriptions").delete().eq("user_id", s.user_id);
      await supabaseAdmin.auth.admin.deleteUser(s.user_id);
      deleted++;
    } catch {
      // ignore single user failures
    }
  }

  return NextResponse.json({ ok: true, sent, deleted });
}

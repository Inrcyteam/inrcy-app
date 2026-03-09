import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type PrefRow = {
  user_id: string;
  performance_enabled: boolean;
  action_enabled: boolean;
  information_enabled: boolean;
  digest_every_hours: number;
};

type SnapshotRow = {
  user_id: string;
  snapshot_date: string;
  connected_tools_count: number | null;
  demandes_captees_total: number | null;
  opportunites_activables_total: number | null;
  details: Record<string, unknown> | null;
};

function isAuthorizedCron(req: Request) {
  const cronSecret = process.env.VERCEL_CRON_SECRET || process.env.CRON_SECRET || "";
  if (!cronSecret) return false;
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerSecret = (req.headers.get("x-cron-secret") || "").trim();
  const querySecret = new URL(req.url).searchParams.get("secret") || "";
  return bearer === cronSecret || headerSecret === cronSecret || querySecret === cronSecret;
}

function toInt(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function dedupeWindowKey(prefix: string) {
  const now = new Date();
  const yy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const bucket = Math.floor((now.getUTCDate() - 1) / 2) + 1;
  return `${prefix}:${yy}-${mm}-${dd}:b${bucket}`;
}

async function hasRecentCategoryNotification(userId: string, category: string, hours: number) {
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("category", category)
    .gte("created_at", since)
    .limit(1);
  if (error) return false;
  return Boolean(data && data.length > 0);
}

async function insertNotification(row: Record<string, unknown>) {
  const { error } = await supabaseAdmin.from("notifications").insert(row);
  if (error && error.code !== "23505") {
    throw new Error(`notifications_insert_failed:${error.message}`);
  }
}

async function buildPerformanceNotification(userId: string, digestHours: number) {
  if (await hasRecentCategoryNotification(userId, "performance", digestHours)) return false;
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from("daily_metrics_summary")
    .select("user_id, snapshot_date, connected_tools_count, demandes_captees_total, opportunites_activables_total, details")
    .eq("user_id", userId)
    .gte("snapshot_date", since)
    .order("snapshot_date", { ascending: false });
  if (error || !data || data.length === 0) return false;

  const snapshots = data as SnapshotRow[];
  const latest = snapshots[0];
  const demandes = snapshots.reduce((sum, row) => sum + toInt(row.demandes_captees_total), 0);
  const opportunities = toInt(latest.opportunites_activables_total);

  if (demandes <= 0 && opportunities <= 0) return false;

  const title = opportunities > 0
    ? `+ ${opportunities} opportunités activables : on se lance ?`
    : `${demandes} demandes générées cette semaine sur vos canaux`;

  const body = opportunities > 0
    ? `Vos canaux ont encore du potentiel. Activez un mouvement simple cette semaine pour transformer ${opportunities} opportunités en demandes concrètes.`
    : `Votre machine a généré ${demandes} demandes sur les 7 derniers jours. C’est le bon moment pour amplifier ce qui fonctionne déjà.`;

  await insertNotification({
    user_id: userId,
    category: "performance",
    kind: opportunities > 0 ? "opportunities_weekly" : "demandes_weekly",
    title,
    body,
    cta_label: opportunities > 0 ? "Ouvrir Booster" : "Voir mes stats",
    cta_url: opportunities > 0 ? "/dashboard/booster" : "/dashboard/stats",
    meta: { demandes, opportunities, connected_tools_count: latest.connected_tools_count ?? 0 },
    dedupe_key: dedupeWindowKey(`performance:${userId}`),
  });
  return true;
}

async function buildActionNotification(userId: string, digestHours: number) {
  if (await hasRecentCategoryNotification(userId, "action", digestHours)) return false;
  const { data: integrations } = await supabaseAdmin
    .from("integrations")
    .select("provider, category, product, status")
    .eq("user_id", userId)
    .eq("status", "connected");

  const connected = Array.isArray(integrations) ? integrations.length : 0;
  const missingCore = Math.max(0, 4 - connected);
  const { data: latest } = await supabaseAdmin
    .from("daily_metrics_summary")
    .select("opportunites_activables_total, connected_tools_count")
    .eq("user_id", userId)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const opportunities = toInt(latest?.opportunites_activables_total);
  const connectedTools = toInt(latest?.connected_tools_count);

  let title = "Il est temps de lancer une action booster";
  let body = "Un petit mouvement aujourd’hui peut relancer votre machine business sans vous submerger.";
  let ctaLabel = "Lancer Booster";
  let ctaUrl = "/dashboard/booster";

  if (missingCore > 0) {
    title = `${missingCore} connexion${missingCore > 1 ? "s" : ""} encore activable${missingCore > 1 ? "s" : ""}`;
    body = `Votre générateur peut encore monter en puissance. Connectez un canal clé pour capter plus d’opportunités dans les 48 prochaines heures.`;
    ctaLabel = "Configurer mes canaux";
    ctaUrl = "/dashboard";
  } else if (opportunities > 0 || connectedTools >= 3) {
    title = `Votre machine est prête : passez à l’action`;
    body = `Vous avez ${opportunities} opportunités activables et ${connectedTools} canaux bien branchés. Le bon levier maintenant : lancer une action booster.`;
  }

  await insertNotification({
    user_id: userId,
    category: "action",
    kind: missingCore > 0 ? "connect_channels" : "launch_booster",
    title,
    body,
    cta_label: ctaLabel,
    cta_url: ctaUrl,
    meta: { connected_integrations: connected, connected_tools: connectedTools, opportunities },
    dedupe_key: dedupeWindowKey(`action:${userId}`),
  });
  return true;
}

async function buildInformationNotification(userId: string, digestHours: number) {
  if (await hasRecentCategoryNotification(userId, "information", digestHours)) return false;
  const { data: latest } = await supabaseAdmin
    .from("daily_metrics_summary")
    .select("connected_tools_count, demandes_captees_total, opportunites_activables_total")
    .eq("user_id", userId)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const connectedTools = toInt(latest?.connected_tools_count);
  const demandes = toInt(latest?.demandes_captees_total);
  const opportunities = toInt(latest?.opportunites_activables_total);

  const title = connectedTools > 0
    ? `Votre cockpit iNrCy suit ${connectedTools} canal${connectedTools > 1 ? "x" : ""}`
    : `Votre espace iNrCy est prêt à être animé`;
  const body = connectedTools > 0
    ? `Petit point de passage : ${demandes} demandes captees récemment, ${opportunities} opportunités activables, et un GPS d’utilisation à consulter pour garder le rythme.`
    : `Activez quelques canaux puis laissez iNrCy vous guider. Vos prochaines actions clés apparaîtront ensuite dans votre cloche.`;

  await insertNotification({
    user_id: userId,
    category: "information",
    kind: "cockpit_status",
    title,
    body,
    cta_label: connectedTools > 0 ? "Ouvrir le GPS" : "Ouvrir le dashboard",
    cta_url: connectedTools > 0 ? "/dashboard/gps" : "/dashboard",
    meta: { connected_tools: connectedTools, demandes, opportunities },
    dedupe_key: dedupeWindowKey(`information:${userId}`),
  });
  return true;
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("notification_preferences")
    .select("user_id, performance_enabled, action_enabled, information_enabled, digest_every_hours");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const prefs = (data ?? []) as PrefRow[];
  let generated = 0;
  const errors: Array<{ user_id: string; message: string }> = [];

  for (const pref of prefs) {
    try {
      const hours = Math.max(24, Math.min(168, pref.digest_every_hours || 48));
      if (pref.performance_enabled) generated += (await buildPerformanceNotification(pref.user_id, hours)) ? 1 : 0;
      if (pref.action_enabled) generated += (await buildActionNotification(pref.user_id, hours)) ? 1 : 0;
      if (pref.information_enabled) generated += (await buildInformationNotification(pref.user_id, hours)) ? 1 : 0;
    } catch (e: unknown) {
      errors.push({ user_id: pref.user_id, message: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ ok: true, users: prefs.length, generated, errors });
}

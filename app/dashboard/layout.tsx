export const dynamic = "force-dynamic";
export const revalidate = 0;

import React from "react";
import { unstable_noStore as noStore } from "next/cache";
import styles from "./dashboard.module.css";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getMaintenanceState, isAdminUser } from "@/lib/maintenance";
import ProfileRealtimeBridge from "./_components/ProfileRealtimeBridge";
import LastActiveTracker from "./_components/LastActiveTracker";
import { ensureProfileRow } from "@/lib/ensureProfileRow";
import { resolveInrcyAccountScopeForUser } from "@/lib/multicompte/server";
import ActiveAccountTabSync from "./_components/ActiveAccountTabSync";
import ResponsiveBottomNav from "./_components/ResponsiveBottomNav";
import DashboardUnsavedNavigationProvider from "./_components/DashboardUnsavedNavigationProvider";


type SubscriptionGateRow = {
  status?: string | null;
  trial_end_at?: string | null;
  start_date?: string | null;
};

const TRIAL_DURATION_DAYS = 21;
const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeSubscriptionStatus(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function parseDateMs(value?: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function isTrialStillValid(subscription?: SubscriptionGateRow | null) {
  if (normalizeSubscriptionStatus(subscription?.status) !== "trialing") return false;

  const trialEndMs = parseDateMs(subscription?.trial_end_at);
  if (trialEndMs !== null) return trialEndMs > Date.now();

  const startMs = parseDateMs(subscription?.start_date);
  if (startMs !== null) return startMs + TRIAL_DURATION_DAYS * DAY_MS > Date.now();

  return false;
}

function hasDashboardAccess(subscription?: SubscriptionGateRow | null) {
  const status = normalizeSubscriptionStatus(subscription?.status);
  return status === "active" || isTrialStillValid(subscription);
}

const DASHBOARD_CRITICAL_IMAGE_PRELOADS = [
  "/logo-inrcy.png",
  "/icons/inrbadge-dashboard.png",
  "/icons/mails-inrcy-dashboard-v2.png",
  "/icons/inrcy.png",
  "/icons/site-web.jpg",
  "/icons/google.jpg",
  "/icons/facebook.png",
  "/icons/instagram.jpg",
  "/icons/linkedin.png",
  "/icons/tiktok.png",
  "/icons/youtube-shorts.png",
  "/agent/inr-agent-robot-cutout.webp",
  "/icons/inr-agent-header.png",
  "/icons/inr-agent.png",
  "/inrcalendar-logo.png",
  "/inrstats-logo.png",
  "/inrcrm-logo.png",
  "/inrsend-logo.png",
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  noStore();

  const supabase = await createSupabaseServer();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  const accountScope = await resolveInrcyAccountScopeForUser(supabase, user);
  await ensureProfileRow(user, accountScope.activeUserId).catch(() => null);

  const { data: subscription } = await supabaseAdmin
    .from("subscriptions")
    .select("status, trial_end_at, start_date")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!hasDashboardAccess(subscription)) {
    redirect("/compte-bloque");
  }

  // Vérifie l'état maintenance
  const maintenance = await getMaintenanceState();

  if (maintenance.enabled) {
    const admin = await isAdminUser(user.id);

    if (!admin) {
      redirect("/maintenance");
    }
  }

  return (
    <div className={styles.shell}>
      {DASHBOARD_CRITICAL_IMAGE_PRELOADS.map((src) => (
        <link key={src} rel="preload" as="image" href={src} />
      ))}
      <div className={styles.bg} />
      <div className={styles.noise} />
      <ActiveAccountTabSync />
      <ProfileRealtimeBridge />
      <LastActiveTracker />

      <DashboardUnsavedNavigationProvider>
        <div className={styles.mobileViewport}>
          {children}
        </div>
        <ResponsiveBottomNav />
      </DashboardUnsavedNavigationProvider>
    </div>
  );
}

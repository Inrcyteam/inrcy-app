export const dynamic = "force-dynamic";
export const revalidate = 0;

import React from "react";
import { unstable_noStore as noStore } from "next/cache";
import styles from "./dashboard.module.css";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getMaintenanceState, isAdminUser } from "@/lib/maintenance";
import ProfileRealtimeBridge from "./_components/ProfileRealtimeBridge";
import LastActiveTracker from "./_components/LastActiveTracker";
import { ensureProfileRow } from "@/lib/ensureProfileRow";

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

  await ensureProfileRow(user).catch(() => null);

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
      <ProfileRealtimeBridge />
      <LastActiveTracker />

      {children}
    </div>
  );
}
export const dynamic = "force-dynamic";
export const revalidate = 0;

import React from "react";
import { unstable_noStore as noStore } from "next/cache";
import styles from "./dashboard.module.css";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getMaintenanceState, isAdminUser } from "@/lib/maintenance";
import ProfileRealtimeBridge from "./_components/ProfileRealtimeBridge";

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
      <div className={styles.bg} />
      <div className={styles.noise} />
      <ProfileRealtimeBridge />

      {children}
    </div>
  );
}
import React from "react";
import styles from "./dashboard.module.css";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getMaintenanceState, isAdminUser } from "@/lib/maintenance";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    redirect("/login");
  }

  const maintenance = await getMaintenanceState();
  const isAdmin = await isAdminUser(data.user.id);

  if (maintenance.enabled && !isAdmin) {
    redirect("/maintenance");
  }

  return (
    <div className={styles.shell}>
      <div className={styles.bg} />
      <div className={styles.noise} />

      {children}
    </div>
  );
}





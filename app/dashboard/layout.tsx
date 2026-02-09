import React from "react";
import styles from "./dashboard.module.css";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabaseServer";
import ImapKickoff from "./ImapKickoff";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    redirect("/login");
  }

  return (
    <div className={styles.shell}>
      <div className={styles.bg} />
      <div className={styles.noise} />

      {/* Lance une sync IMAP dès l’arrivée sur /dashboard */}
      <ImapKickoff />

      {children}
    </div>
  );
}





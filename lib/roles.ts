import "server-only";

import { createSupabaseServer } from "@/lib/supabaseServer";

// ✅ iNrCy: comptes staff/admin autorisés à voir le dashboard admin
// Tu peux en ajouter d'autres (staff) plus tard.
export const ADMIN_USER_IDS = ["670b527d-5e08-42b4-ba95-e58e812339eb"] as const;

export type AppRole = "user" | "staff" | "admin";

export function isStaffRole(role: string | null | undefined): role is "staff" | "admin" {
  return role === "staff" || role === "admin";
}

export async function getMyRole(): Promise<{ role: AppRole | null; isStaff: boolean }> {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) return { role: null, isStaff: false };

  // Hard allow-list for your main admin account (useful even if role column isn't deployed yet)
  if (ADMIN_USER_IDS.includes(user.id as any)) {
    return { role: "admin", isStaff: true };
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return { role: null, isStaff: false };
  const role = (profile?.role as AppRole | undefined) ?? null;
  return { role, isStaff: isStaffRole(role) };
}

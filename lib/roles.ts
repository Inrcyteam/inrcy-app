import "server-only";

import { createSupabaseServer } from "@/lib/supabaseServer";

// ✅ iNrCy: comptes admin autorisés à voir la zone Admin iNrCy.
// Staff reste un rôle possible pour plus tard, mais les pages / API admin sont verrouillées admin-only.
export const ADMIN_USER_IDS = ["670b527d-5e08-42b4-ba95-e58e812339eb"] as const;

export type AppRole = "user" | "staff" | "admin";

export function isAdminRole(role: string | null | undefined): role is "admin" {
  return role === "admin";
}

export function isStaffRole(role: string | null | undefined): role is "staff" | "admin" {
  return role === "staff" || role === "admin";
}

export async function getMyRole(): Promise<{ role: AppRole | null; isStaff: boolean; isAdmin: boolean }> {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) return { role: null, isStaff: false, isAdmin: false };

  // Hard allow-list for your main admin account (useful even if role column isn't deployed yet)
  if (ADMIN_USER_IDS.includes(user.id as any)) {
    return { role: "admin", isStaff: true, isAdmin: true };
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return { role: null, isStaff: false, isAdmin: false };
  const role = (profile?.role as AppRole | undefined) ?? null;
  return { role, isStaff: isStaffRole(role), isAdmin: isAdminRole(role) };
}

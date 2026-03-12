import "server-only";

import { ADMIN_USER_IDS } from "@/lib/roles";

export type MaintenanceState = {
  enabled: boolean;
  title: string | null;
  message: string | null;
  updatedAt: string | null;
};

function getSupabaseRestHeaders() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = serviceRoleKey || anonKey;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !token) {
    throw new Error("Missing Supabase env for maintenance mode");
  }

  return {
    apikey: token,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function getMaintenanceState(): Promise<MaintenanceState> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const url = new URL(`${supabaseUrl}/rest/v1/app_settings`);
    url.searchParams.set(
      "select",
      "maintenance_mode,maintenance_title,maintenance_message,updated_at"
    );
    url.searchParams.set("id", "eq.1");
    url.searchParams.set("limit", "1");

    const res = await fetch(url.toString(), {
      headers: getSupabaseRestHeaders(),
      cache: "no-store",
    });

    if (!res.ok) {
      return { enabled: false, title: null, message: null, updatedAt: null };
    }

    const rows = (await res.json()) as Array<{
      maintenance_mode?: boolean;
      maintenance_title?: string | null;
      maintenance_message?: string | null;
      updated_at?: string | null;
    }>;

    const row = rows[0];

    return {
      enabled: Boolean(row?.maintenance_mode),
      title: row?.maintenance_title ?? null,
      message: row?.maintenance_message ?? null,
      updatedAt: row?.updated_at ?? null,
    };
  } catch {
    return { enabled: false, title: null, message: null, updatedAt: null };
  }
}

export async function isAdminUser(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  if (ADMIN_USER_IDS.includes(userId as (typeof ADMIN_USER_IDS)[number])) return true;

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const url = new URL(`${supabaseUrl}/rest/v1/profiles`);
    url.searchParams.set("select", "role");
    url.searchParams.set("user_id", `eq.${userId}`);
    url.searchParams.set("limit", "1");

    const res = await fetch(url.toString(), {
      headers: getSupabaseRestHeaders(),
      cache: "no-store",
    });

    if (!res.ok) return false;

    const rows = (await res.json()) as Array<{ role?: string | null }>;
    const role = rows[0]?.role;
    return role === "admin" || role === "staff";
  } catch {
    return false;
  }
}
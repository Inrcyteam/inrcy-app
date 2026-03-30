import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type NotificationCategory = "performance" | "action" | "information";

export type NotificationPreferenceRow = {
  user_id: string;
  in_app_enabled: boolean;
  email_enabled: boolean;
  performance_enabled: boolean;
  action_enabled: boolean;
  information_enabled: boolean;
  digest_every_hours: number;
  created_at?: string;
  updated_at?: string;
};

export type NotificationRow = {
  id: string;
  user_id: string;
  category: NotificationCategory;
  kind: string;
  title: string;
  body: string;
  cta_label: string | null;
  cta_url: string | null;
  read_at: string | null;
  meta: Record<string, unknown> | null;
  dedupe_key: string | null;
  created_at: string;
};

export function defaultNotificationPreferences(userId: string): NotificationPreferenceRow {
  return {
    user_id: userId,
    in_app_enabled: true,
    email_enabled: true,
    performance_enabled: true,
    action_enabled: true,
    information_enabled: true,
    digest_every_hours: 48,
  };
}

export async function ensureNotificationPreferences(userId: string) {
  const payload = {
    ...defaultNotificationPreferences(userId),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("notification_preferences")
    .upsert(payload, { onConflict: "user_id" })
    .select("user_id, in_app_enabled, email_enabled, performance_enabled, action_enabled, information_enabled, digest_every_hours, created_at, updated_at")
    .single();

  if (error) {
    throw new Error(`notification_preferences_upsert_failed:${error.message}`);
  }

  return data as NotificationPreferenceRow;
}

export function getCategoryLabel(category: NotificationCategory) {
  if (category === "performance") return "Performance";
  if (category === "action") return "Action";
  return "Information";
}

export function getCategoryAccent(category: NotificationCategory) {
  if (category === "performance") return "rgba(56,189,248,0.18)";
  if (category === "action") return "rgba(244,114,182,0.18)";
  return "rgba(251,146,60,0.16)";
}

export function safeMeta(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function formatRelativeDate(iso: string) {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "À l’instant";
  const delta = Date.now() - ts;
  const minutes = Math.round(delta / 60000);
  if (minutes <= 1) return "À l’instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `Il y a ${days} j`;
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(new Date(ts));
}

export function toNotificationPayload(row: NotificationRow) {
  return {
    ...row,
    categoryLabel: getCategoryLabel(row.category),
    relativeDate: formatRelativeDate(row.created_at),
    unread: !row.read_at,
  };
}

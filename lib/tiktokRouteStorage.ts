import "server-only";

import { normalizeTiktokSettings, type TiktokMockSettings } from "@/lib/tiktokMockSettings";

export async function readTiktokSettings(supabase: any, userId: string): Promise<{ root: Record<string, unknown>; tiktok: TiktokMockSettings }> {
  const { data } = await supabase
    .from("pro_tools_configs")
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();

  const root = data?.settings && typeof data.settings === "object" && !Array.isArray(data.settings)
    ? (data.settings as Record<string, unknown>)
    : {};

  return {
    root,
    tiktok: normalizeTiktokSettings(root.tiktok),
  };
}

export async function saveTiktokSettings(supabase: any, userId: string, root: Record<string, unknown>, tiktok: TiktokMockSettings) {
  const settings = { ...root, tiktok };
  const { error } = await supabase
    .from("pro_tools_configs")
    .upsert({ user_id: userId, settings }, { onConflict: "user_id" });

  if (error) throw error;
  return settings;
}

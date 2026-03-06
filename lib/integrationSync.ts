import { asRecord } from "@/lib/tsSafe";

export async function invalidateUserIntegrationCaches(supabase: any, userId: string) {
  try {
    await supabase.from("stats_cache").delete().eq("user_id", userId);
  } catch {}
  try {
    await supabase.from("stats_snapshot").delete().eq("user_id", userId);
  } catch {}
  try {
    await supabase.from("cache_statistiques").delete().eq("id_de_l_utilisateur", userId);
  } catch {}
  try {
    await supabase.from("cache_statistiques").delete().eq("id_utilisateur", userId);
  } catch {}
  try {
    await supabase.from("cache_statistiques").delete().eq("user_id", userId);
  } catch {}
}

export async function mergeProToolSettings(
  supabase: any,
  userId: string,
  moduleKey: string,
  modulePatch: Record<string, unknown>
) {
  const { data: scRow } = await supabase.from("pro_tools_configs").select("settings").eq("user_id", userId).maybeSingle();
  const current = asRecord(asRecord(scRow)["settings"]);
  const currentModule = asRecord(current[moduleKey]);
  const merged = {
    ...current,
    [moduleKey]: {
      ...currentModule,
      ...modulePatch,
    },
  };

  await supabase.from("pro_tools_configs").upsert({ user_id: userId, settings: merged }, { onConflict: "user_id" });
}

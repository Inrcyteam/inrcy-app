export async function clearAllToolCaches(supabase: any, userId: string) {
  try {
    await supabase.from("stats_cache").delete().eq("user_id", userId);
  } catch {}
}

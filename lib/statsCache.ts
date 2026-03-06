export async function clearAllToolCaches(supabase: any, userId: string) {
  try {
    await supabase.from("stats_cache").delete().eq("user_id", userId);
  } catch {}
  for (const col of ["user_id", "id_utilisateur", "id_de_l_utilisateur"]) {
    try {
      await supabase.from("cache_statistiques").delete().eq(col, userId);
    } catch {}
  }
}

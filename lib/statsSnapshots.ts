import "server-only";

export type SnapshotSource = "site_inrcy" | "site_web" | "facebook" | "instagram" | "linkedin" | "gmb";

type SaveSnapshotArgs = {
  supabase: any;
  userId: string;
  source: SnapshotSource;
  connected: boolean;
  metrics: Record<string, unknown>;
  demandesCaptees: number;
  opportunites: number;
  snapshotDate?: string;
};

export async function saveSnapshot({
  supabase,
  userId,
  source,
  connected,
  metrics,
  demandesCaptees,
  opportunites,
  snapshotDate,
}: SaveSnapshotArgs) {
  const payload = {
    user_id: userId,
    snapshot_date: snapshotDate ?? new Date().toISOString().slice(0, 10),
    source,
    connected,
    metrics,
    demandes_captees: demandesCaptees,
    opportunites_activables: opportunites,
  };

  const { error } = await supabase.from("stats_snapshots").upsert(payload, {
    onConflict: "user_id,snapshot_date,source",
  });

  if (error) {
    throw new Error(`stats_snapshots upsert failed for ${source}: ${error.message}`);
  }
}

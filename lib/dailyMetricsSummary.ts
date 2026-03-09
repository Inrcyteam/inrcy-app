import "server-only";

export type SnapshotSource = "site_inrcy" | "site_web" | "facebook" | "instagram" | "linkedin" | "gmb";

export type SnapshotDetail = {
  connected: boolean;
  metrics: Record<string, unknown>;
  demandes_captees: number;
  opportunites_activables: number;
};

type SaveDailyMetricsSummaryArgs = {
  supabase: any;
  userId: string;
  snapshotDate?: string;
  details: Partial<Record<SnapshotSource, SnapshotDetail>>;
};

function toSafeInt(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

export async function saveDailyMetricsSummary({
  supabase,
  userId,
  snapshotDate,
  details,
}: SaveDailyMetricsSummaryArgs) {
  const normalizedDetails = Object.fromEntries(
    Object.entries(details).map(([source, raw]) => {
      const detail = raw ?? {
        connected: false,
        metrics: {},
        demandes_captees: 0,
        opportunites_activables: 0,
      };

      return [
        source,
        {
          connected: Boolean(detail.connected),
          metrics: detail.metrics && typeof detail.metrics === "object" && !Array.isArray(detail.metrics) ? detail.metrics : {},
          demandes_captees: toSafeInt(detail.demandes_captees),
          opportunites_activables: toSafeInt(detail.opportunites_activables),
        },
      ];
    })
  ) as Record<string, SnapshotDetail>;

  const values = Object.values(normalizedDetails);
  const connectedToolsCount = values.filter((item) => item.connected).length;
  const demandesCapteesTotal = values.reduce((sum, item) => sum + toSafeInt(item.demandes_captees), 0);
  const opportunitesActivablesTotal = values.reduce((sum, item) => sum + toSafeInt(item.opportunites_activables), 0);

  const payload = {
    user_id: userId,
    snapshot_date: snapshotDate ?? new Date().toISOString().slice(0, 10),
    connected_tools_count: connectedToolsCount,
    demandes_captees_total: demandesCapteesTotal,
    opportunites_activables_total: opportunitesActivablesTotal,
    details: normalizedDetails,
  };

  const { error } = await supabase.from("daily_metrics_summary").upsert(payload, {
    onConflict: "user_id,snapshot_date",
  });

  if (error) {
    throw new Error(`daily_metrics_summary upsert failed: ${error.message}`);
  }
}

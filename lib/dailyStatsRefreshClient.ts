export type CubeKey = "site_inrcy" | "site_web" | "gmb" | "facebook" | "instagram" | "linkedin";

export type DailyRefreshBulkPayload = {
  period: number;
  overviews?: Record<CubeKey, unknown>;
  opportunities?: {
    total?: number;
    byCube?: Partial<Record<CubeKey, number>>;
  };
  profile?: {
    lead_conversion_rate?: number;
    avg_basket?: number;
  };
  estimatedByCube?: Partial<Record<CubeKey, number>>;
  meta?: {
    generatedAt?: string;
    snapshotDate?: string | null;
    live?: boolean;
  };
};

export type DailyStatsRefreshBootstrapResponse = {
  ok: boolean;
  ran: boolean;
  inProgress: boolean;
  snapshotDate: string | null;
  syncAt: number;
  generator?: any;
  inrstats?: Record<string, DailyRefreshBulkPayload>;
};

export async function runDailyStatsRefreshBootstrap(): Promise<DailyStatsRefreshBootstrapResponse> {
  const res = await fetch("/api/stats/daily-refresh", {
    method: "POST",
    cache: "no-store",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "run" }),
  });

  const json = (await res.json().catch(() => null)) as DailyStatsRefreshBootstrapResponse | null;
  if (!res.ok) {
    const message = typeof (json as any)?.error === "string" ? (json as any).error : `daily refresh bootstrap failed: ${res.status}`;
    throw new Error(message);
  }

  return json ?? {
    ok: false,
    ran: false,
    inProgress: false,
    snapshotDate: null,
    syncAt: Date.now(),
  };
}

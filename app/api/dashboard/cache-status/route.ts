import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

const CACHE_TTL_MS = 36 * 60 * 60 * 1000;
const PERIODS = [7, 30] as const;

type PeriodKey = (typeof PERIODS)[number];

type AnyRec = Record<string, unknown>;

function asRecord(value: unknown): AnyRec {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as AnyRec) : {};
}

function toTs(value: unknown): number {
  const raw = typeof value === "string" || typeof value === "number" ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(raw) ? raw : 0;
}

function inferSnapshotTs(row: AnyRec): number {
  const payload = asRecord(row.payload);
  const meta = asRecord(payload.meta);
  const generatedAt = toTs(meta.generatedAt);
  if (generatedAt > 0) return generatedAt;

  const expiresAt = toTs(row.expires_at);
  if (expiresAt > 0) return Math.max(0, expiresAt - CACHE_TTL_MS);
  return 0;
}

export async function GET() {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }

    const nowIso = new Date().toISOString();
    const { data: rows = [] } = await supabase
      .from("stats_cache")
      .select("source, range_key, payload, expires_at")
      .eq("user_id", user.id)
      .in("source", ["metrics_summary", "overview"])
      .gt("expires_at", nowIso);

    let generatorSyncedAt = 0;
    const inrstats: Record<PeriodKey, number> = { 7: 0, 30: 0 };

    for (const row of Array.isArray(rows) ? rows : []) {
      const rec = asRecord(row);
      const source = String(rec.source ?? "");
      const ts = inferSnapshotTs(rec);
      if (ts <= 0) continue;

      if (source === "metrics_summary") {
        if (ts > generatorSyncedAt) generatorSyncedAt = ts;
        continue;
      }

      if (source !== "overview") continue;
      const rangeKey = String(rec.range_key ?? "");
      const match = rangeKey.match(/(?:^|\|)days=(\d+)(?:\||$)/);
      const period = match ? Number(match[1]) : 0;
      if (period === 7 || period === 30) {
        inrstats[period] = Math.max(inrstats[period], ts);
      }
    }

    return NextResponse.json({
      generator: { syncedAt: generatorSyncedAt },
      inrstats,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossible de lire l'état du cache." },
      { status: 500 },
    );
  }
}

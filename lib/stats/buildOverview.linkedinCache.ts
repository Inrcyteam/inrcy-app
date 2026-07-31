import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  asRecord,
  hasDetailedLinkedInMetrics,
  hasLinkedInMetricErrors,
  hasLinkedInOpportunityMetrics,
  hasUsableLinkedInMetrics,
} from "@/lib/stats/buildOverview.shared";

const LINKEDIN_METRICS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const LINKEDIN_LAST_GOOD_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LINKEDIN_METRICS_SOURCE = "linkedin_metrics";
const LINKEDIN_LAST_GOOD_METRICS_SOURCE = "linkedin_metrics_last_good";
const LINKEDIN_OPPORTUNITY_LAST_GOOD_SOURCE = "linkedin_opportunity_last_good";
const LINKEDIN_QUOTA_GUARD_SOURCE = "linkedin_quota_guard";

export function createLinkedInOverviewCache({
  supabase,
  userId,
  days,
  snapshotDate,
  getLinkedInNextUtcResetIso,
}: {
  supabase: SupabaseClient;
  userId: string;
  days: number;
  snapshotDate: string | null;
  getLinkedInNextUtcResetIso: () => string;
}) {
  function normalizeLinkedInCachePart(value: unknown) {
    return String(value || "none")
      .trim()
      .replace(/[^a-zA-Z0-9:_-]+/g, "_")
      .slice(0, 160);
  }

  function buildLinkedInMetricsCacheKey(authorUrn: string, orgUrn: string) {
    return [
      `days=${days}`,
      `snapshot=${snapshotDate || "live"}`,
      `person=${normalizeLinkedInCachePart(authorUrn)}`,
      `org=${normalizeLinkedInCachePart(orgUrn)}`,
    ].join("|");
  }

  function buildLinkedInSourceMetricsCacheKey(
    source: "member" | "organization",
    urn: string,
  ) {
    return [
      `days=${days}`,
      `snapshot=${snapshotDate || "live"}`,
      `linkedin_source=${source}`,
      source === "member"
        ? `person=${normalizeLinkedInCachePart(urn)}`
        : `org=${normalizeLinkedInCachePart(urn)}`,
    ].join("|");
  }

  function annotateLinkedInMetrics(metrics: unknown, cacheMode: string, extra?: Record<string, unknown>) {
    const rec = asRecord(metrics);
    return {
      ...rec,
      raw: {
        ...asRecord(rec["raw"]),
        cache: {
          mode: cacheMode,
          usedAt: new Date().toISOString(),
          ...(extra || {}),
        },
      },
    };
  }

  async function readLinkedInMetricsCache(cacheKey: string, options?: { allowExpired?: boolean }) {
    try {
      let query = supabase
        .from("stats_cache")
        .select("payload, expires_at")
        .eq("user_id", userId)
        .eq("source", LINKEDIN_METRICS_SOURCE)
        .eq("range_key", cacheKey)
        .order("expires_at", { ascending: false })
        .limit(1);

      if (!options?.allowExpired) {
        query = query.gt("expires_at", new Date().toISOString());
      }

      const { data } = await query.maybeSingle();
      const payload = asRecord(asRecord(data)["payload"]);
      return Object.keys(payload).length ? payload : null;
    } catch {
      return null;
    }
  }

  function isLastGoodLinkedInMetrics(metrics: unknown) {
    return hasUsableLinkedInMetrics(metrics) && !hasLinkedInMetricErrors(metrics);
  }

  async function readLastGoodLinkedInMetrics(
    authorUrn: string,
    orgUrn: string,
    cacheKey?: string,
  ) {
    const identityPrefix = [
      `days=${days}`,
      `snapshot=`,
    ].join("|");
    const person = normalizeLinkedInCachePart(authorUrn);
    const org = normalizeLinkedInCachePart(orgUrn);
    const orgPattern = orgUrn ? org : "%";

    async function firstUsableFrom(source: string, query: "exact" | "identity") {
      try {
        let request = supabase
          .from("stats_cache")
          .select("payload, expires_at, range_key")
          .eq("user_id", userId)
          .eq("source", source);

        if (query === "exact" && cacheKey) {
          request = request.eq("range_key", cacheKey);
        } else {
          request = request.like(
            "range_key",
            `${identityPrefix}%person=${person}|org=${orgPattern}`,
          );
        }

        const { data: rows = [] } = await request
          .order("expires_at", { ascending: false })
          .limit(12);

        for (const row of Array.isArray(rows) ? rows : []) {
          const payload = asRecord(asRecord(row)["payload"]);
          if (isLastGoodLinkedInMetrics(payload)) return payload;
        }
      } catch {}
      return null;
    }

    if (cacheKey) {
      const exactLastGood = await firstUsableFrom(
        LINKEDIN_LAST_GOOD_METRICS_SOURCE,
        "exact",
      );
      if (exactLastGood) return exactLastGood;
    }

    const identityLastGood = await firstUsableFrom(
      LINKEDIN_LAST_GOOD_METRICS_SOURCE,
      "identity",
    );
    if (identityLastGood) return identityLastGood;

    if (cacheKey) {
      const exactLegacy = await firstUsableFrom(LINKEDIN_METRICS_SOURCE, "exact");
      if (exactLegacy) return exactLegacy;
    }

    return firstUsableFrom(LINKEDIN_METRICS_SOURCE, "identity");
  }

  async function readLastGoodLinkedInOpportunityMetrics(
    authorUrn: string,
    orgUrn: string,
    cacheKey?: string,
  ) {
    const identityPrefix = [
      `days=${days}`,
      `snapshot=`,
    ].join("|");
    const person = normalizeLinkedInCachePart(authorUrn);
    const org = normalizeLinkedInCachePart(orgUrn);
    const orgPattern = orgUrn ? org : "%";

    async function firstOpportunityFrom(source: string, query: "exact" | "identity") {
      try {
        let request = supabase
          .from("stats_cache")
          .select("payload, expires_at, range_key")
          .eq("user_id", userId)
          .eq("source", source);

        if (query === "exact" && cacheKey) {
          request = request.eq("range_key", cacheKey);
        } else {
          request = request.like(
            "range_key",
            `${identityPrefix}%person=${person}|org=${orgPattern}`,
          );
        }

        const { data: rows = [] } = await request
          .order("expires_at", { ascending: false })
          .limit(12);

        for (const row of Array.isArray(rows) ? rows : []) {
          const payload = asRecord(asRecord(row)["payload"]);
          if (hasLinkedInOpportunityMetrics(payload)) return payload;
        }
      } catch {}
      return null;
    }

    for (const source of [
      LINKEDIN_OPPORTUNITY_LAST_GOOD_SOURCE,
      LINKEDIN_LAST_GOOD_METRICS_SOURCE,
      LINKEDIN_METRICS_SOURCE,
    ]) {
      if (cacheKey) {
        const exact = await firstOpportunityFrom(source, "exact");
        if (exact) return exact;
      }
      const identity = await firstOpportunityFrom(source, "identity");
      if (identity) return identity;
    }

    return null;
  }

  async function writeLinkedInMetricsCache(cacheKey: string, payload: unknown) {
    try {
      await supabase.from("stats_cache").upsert(
        {
          user_id: userId,
          source: LINKEDIN_METRICS_SOURCE,
          range_key: cacheKey,
          payload,
          expires_at: new Date(Date.now() + LINKEDIN_METRICS_CACHE_TTL_MS).toISOString(),
        },
        { onConflict: "user_id,source,range_key" },
      );
    } catch {}
  }

  async function writeLastGoodLinkedInMetricsCache(cacheKey: string, payload: unknown) {
    if (!isLastGoodLinkedInMetrics(payload)) return;
    try {
      await supabase.from("stats_cache").upsert(
        {
          user_id: userId,
          source: LINKEDIN_LAST_GOOD_METRICS_SOURCE,
          range_key: cacheKey,
          payload,
          expires_at: new Date(Date.now() + LINKEDIN_LAST_GOOD_CACHE_TTL_MS).toISOString(),
        },
        { onConflict: "user_id,source,range_key" },
      );
    } catch {}
  }

  async function writeLastGoodLinkedInOpportunityCache(cacheKey: string, payload: unknown) {
    if (!hasLinkedInOpportunityMetrics(payload)) return;
    try {
      await supabase.from("stats_cache").upsert(
        {
          user_id: userId,
          source: LINKEDIN_OPPORTUNITY_LAST_GOOD_SOURCE,
          range_key: cacheKey,
          payload,
          expires_at: new Date(Date.now() + LINKEDIN_LAST_GOOD_CACHE_TTL_MS).toISOString(),
        },
        { onConflict: "user_id,source,range_key" },
      );
    } catch {}
  }

  async function resolveLinkedInCachedMetrics(
    cacheKey: string,
    authorUrn: string,
    orgUrn: string,
  ) {
    const cached = await readLinkedInMetricsCache(cacheKey);
    if (cached && isLastGoodLinkedInMetrics(cached)) {
      return { metrics: cached, mode: "fresh_linkedin_cache" };
    }

    const lastGood = await readLastGoodLinkedInMetrics(authorUrn, orgUrn, cacheKey);
    if (lastGood) {
      return {
        metrics: lastGood,
        mode: cached ? "last_good_over_partial_cache" : "last_good_cache",
      };
    }

    if (cached && hasDetailedLinkedInMetrics(cached)) {
      return {
        metrics: cached,
        mode: hasLinkedInMetricErrors(cached)
          ? "usable_partial_linkedin_cache"
          : "valid_partial_linkedin_cache",
      };
    }

    if (cached && !hasLinkedInMetricErrors(cached)) {
      return { metrics: cached, mode: "valid_partial_linkedin_cache" };
    }

    return null;
  }

  async function readLinkedInQuotaGuard() {
    try {
      const { data } = await supabase
        .from("stats_cache")
        .select("payload, expires_at")
        .eq("user_id", userId)
        .eq("source", LINKEDIN_QUOTA_GUARD_SOURCE)
        .eq("range_key", "application")
        .gt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const payload = asRecord(asRecord(data)["payload"]);
      const expiresAt = String(asRecord(data)["expires_at"] || payload["blockedUntil"] || "");
      return expiresAt ? { payload, expiresAt } : null;
    } catch {
      return null;
    }
  }

  async function writeLinkedInQuotaGuard(errorMessage: string) {
    const blockedUntil = getLinkedInNextUtcResetIso();
    try {
      await supabase.from("stats_cache").upsert(
        {
          user_id: userId,
          source: LINKEDIN_QUOTA_GUARD_SOURCE,
          range_key: "application",
          payload: {
            blockedUntil,
            error: errorMessage,
            reason: "linkedin_api_quota",
          },
          expires_at: blockedUntil,
        },
        { onConflict: "user_id,source,range_key" },
      );
    } catch {}
    return blockedUntil;
  }

  return {
    buildLinkedInMetricsCacheKey,
    buildLinkedInSourceMetricsCacheKey,
    annotateLinkedInMetrics,
    readLastGoodLinkedInMetrics,
    readLastGoodLinkedInOpportunityMetrics,
    writeLinkedInMetricsCache,
    writeLastGoodLinkedInMetricsCache,
    writeLastGoodLinkedInOpportunityCache,
    resolveLinkedInCachedMetrics,
    readLinkedInQuotaGuard,
    writeLinkedInQuotaGuard,
    isLastGoodLinkedInMetrics,
  };
}

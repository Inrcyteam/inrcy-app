"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import styles from "./stats.module.css";
import Image from "next/image";
import { useRouter } from "next/navigation";
import ResponsiveActionButton from "../_components/ResponsiveActionButton";
import HelpButton from "../_components/HelpButton";
import HelpModal from "../_components/HelpModal";
import { getSimpleFrenchApiError, getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import { PROFILE_VERSION_EVENT, type ProfileVersionChangeDetail } from "@/lib/profileVersioning";
import { type DashboardChannelKey, isDashboardChannelKey } from "@/lib/dashboardChannels";
import { markDailyStatsRefreshBootstrapChecked, markServerCacheSyncChecked, runDailyStatsRefreshBootstrap, wasDailyStatsRefreshBootstrapCheckedRecently, wasServerCacheSyncCheckedRecently, type DailyStatsRefreshBootstrapResponse } from "@/lib/dailyStatsRefreshClient";
import { markChannelsSynced, mergeChannelBlockIntoCachedSnapshots, readCachedChannelSyncAt, syncGeneratorOpportunitiesFromStatsSummary, type StatsWarmPeriod } from "../dashboard.client-cache";
import {
  AVAILABLE_PERIODS,
  buildCubeModel,
  buildSummaryActionItems,
  cubeSessionKey,
  emptyCubeState,
  expectedUiSnapshotDate,
  fmtInt,
  getLocalPeriodSyncAt,
  getOverviewSnapshotDate,
  getStatsLastChannelSyncAt,
  hasCapturedLeadsBlocks,
  hasFreshLocalPeriodSnapshot,
  parseCachedCubeSnapshot,
  parseCachedSummarySnapshot,
  readUiCacheValue,
  removeUiCacheValue,
  safeNum,
  summarySessionKey,
  writeUiCacheValue,
  type BulkFetchResult,
  type CapturedLeads,
  type ChannelRefreshResponse,
  type CubeKey,
  type CubeModel,
  type CubeState,
  type Overview,
  type Period,
  type StatsBulkResponse,
} from "./stats.shared";
import { Cube } from "./stats.ui";

const useBrowserLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

type StatsPanelKey = "all" | CubeKey;

function PlugIcon() {
  return (
    <svg className={styles.plugSvgIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 3v5" />
      <path d="M15 3v5" />
      <path d="M8 8h8v4a4 4 0 0 1-4 4h0a4 4 0 0 1-4-4V8Z" />
      <path d="M12 16v5" />
      <path d="M9.5 21h5" />
    </svg>
  );
}

function normalizeCapturedLeads(raw: unknown, fallback?: CapturedLeads): CapturedLeads {
  const value = raw && typeof raw === "object" ? raw as Partial<CapturedLeads> : {};
  return {
    week: Math.max(0, Math.round(safeNum(value.week, fallback?.week ?? 0))),
    month: Math.max(0, Math.round(safeNum(value.month, fallback?.month ?? 0))),
  };
}

export default function StatsClient() {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null);


  // ✅ Période globale (7j / 30j) pour éviter un mix incohérent entre blocs.
  const period: Period = 30;

  const [dataByCube, setDataByCube] = useState<Record<CubeKey, CubeState>>(emptyCubeState);

  const [summaryOpp, setSummaryOpp] = useState<{ loading: boolean; total: number; byCube: Record<CubeKey, number> }>({
    loading: true,
    total: 0,
    byCube: { site_inrcy: 0, site_web: 0, gmb: 0, facebook: 0, instagram: 0, linkedin: 0, tiktok: 0 },
  });
  const [summaryProfile, setSummaryProfile] = useState<{ lead_conversion_rate: number; avg_basket: number }>({ lead_conversion_rate: 0, avg_basket: 0 });
  const [summaryEstimatedByCube, setSummaryEstimatedByCube] = useState<Record<CubeKey, number>>({
    site_inrcy: 0,
    site_web: 0,
    gmb: 0,
    facebook: 0,
    instagram: 0,
    linkedin: 0,
    tiktok: 0,
  });
  const [, setSummaryHydrated] = useState(false);
  const [activeStatsPanel, setActiveStatsPanel] = useState<StatsPanelKey>("all");
  const [statsMenuOpen, setStatsMenuOpen] = useState(false);
  const [dailyBootReady, setDailyBootReady] = useState(false);

  const scrollTo = (key: CubeKey) => {
    setActiveStatsPanel(key);
    setStatsMenuOpen(false);
  };

  // In-memory cache to avoid duplicate fetch bursts (React strict-mode/dev & quick navigations)
  const periodCacheRef = useRef(new Map<number, Record<CubeKey, Overview>>());
  const [refreshNonce, setRefreshNonce] = useState(0);
  const hydratedPeriodsRef = useRef(new Set<number>());
  const lastAutoRefreshAtRef = useRef(0);
  const refreshTimeoutRef = useRef<number | null>(null);
  const lastServerCacheCheckAtRef = useRef(0);
  const serverCacheCheckPromiseRef = useRef<Promise<void> | null>(null);

  useBrowserLayoutEffect(() => {
    const cachedCube = parseCachedCubeSnapshot(readUiCacheValue(cubeSessionKey(period)));
    const cachedSummary = parseCachedSummarySnapshot(readUiCacheValue(summarySessionKey(period)));

    if (cachedCube?.overviews && hasCapturedLeadsBlocks(cachedCube.blocks)) {
      periodCacheRef.current.set(period, cachedCube.overviews);
      setDataByCube((prev) => {
        const next: typeof prev = { ...prev };
        for (const k of Object.keys(cachedCube.overviews) as CubeKey[]) {
          next[k] = {
            ov: cachedCube.overviews[k] ?? null,
            loading: false,
            error: undefined,
            capturedLeads: normalizeCapturedLeads(cachedCube.blocks?.[k]?.capturedLeads, prev[k]?.capturedLeads),
          };
        }
        return next;
      });
    }

    if (cachedSummary) {
      const byCubePartial = cachedSummary.byCube || {};
      const estimatedByCubePartial = cachedSummary.estimatedByCube || {};
      setSummaryHydrated(true);
      setSummaryOpp({
        loading: false,
        total: safeNum(cachedSummary.total),
        byCube: {
          site_inrcy: safeNum(byCubePartial.site_inrcy),
          site_web: safeNum(byCubePartial.site_web),
          gmb: safeNum(byCubePartial.gmb),
          facebook: safeNum(byCubePartial.facebook),
          instagram: safeNum(byCubePartial.instagram),
          linkedin: safeNum(byCubePartial.linkedin),
          tiktok: safeNum(byCubePartial.tiktok),
        },
      });
      setSummaryProfile({
        lead_conversion_rate: safeNum(cachedSummary.profile?.lead_conversion_rate),
        avg_basket: safeNum(cachedSummary.profile?.avg_basket),
      });
      setSummaryEstimatedByCube({
        site_inrcy: safeNum(estimatedByCubePartial.site_inrcy),
        site_web: safeNum(estimatedByCubePartial.site_web),
        gmb: safeNum(estimatedByCubePartial.gmb),
        facebook: safeNum(estimatedByCubePartial.facebook),
        instagram: safeNum(estimatedByCubePartial.instagram),
        linkedin: safeNum(estimatedByCubePartial.linkedin),
        tiktok: safeNum(estimatedByCubePartial.tiktok),
      });
    }
  }, [period]);

  const clearCachedSnapshots = useCallback(() => {
    periodCacheRef.current.clear();
    try {
      for (const p of AVAILABLE_PERIODS) {
        removeUiCacheValue(cubeSessionKey(p));
        removeUiCacheValue(summarySessionKey(p));
      }
    } catch {
      // ignore
    }
  }, []);

  const triggerRefresh = useCallback((reason: "manual" | "channels") => {
    clearCachedSnapshots();
    setIsRefreshing(true);
    setLastRefreshAt(Date.now());
    setRefreshNonce((prev) => prev + 1);
  }, [clearCachedSnapshots]);

  const applyBulkPayload = useCallback((targetPeriod: Period, next: BulkFetchResult, syncedAt: number) => {
    const snap = next.overviews as Record<CubeKey, Overview>;
    periodCacheRef.current.set(targetPeriod, snap);
    try {
      writeUiCacheValue(cubeSessionKey(targetPeriod), JSON.stringify({ syncedAt, snapshotDate: next.snapshotDate, overviews: snap, blocks: next.blocks }));
      writeUiCacheValue(
        summarySessionKey(targetPeriod),
        JSON.stringify({
          syncedAt,
          snapshotDate: next.snapshotDate,
          ...next.summary,
          profile: next.profile,
          estimatedByCube: next.estimatedByCube,
        }),
      );
      if (targetPeriod === 30) {
        syncGeneratorOpportunitiesFromStatsSummary({
          byCube: next.summary.byCube,
          estimatedByCube: next.estimatedByCube,
          profile: next.profile,
          syncedAt,
          snapshotDate: next.snapshotDate,
          channelBlocks: next.blocks,
        });
      }
    } catch {
      // ignore
    }

    if (targetPeriod !== period) return;

    setDataByCube((prev) => {
      const updated: any = { ...prev };
      for (const k of Object.keys(snap) as CubeKey[]) {
        updated[k] = {
          ov: snap[k] ?? null,
          loading: false,
          error: undefined,
          capturedLeads: normalizeCapturedLeads(next.blocks?.[k]?.capturedLeads, prev[k]?.capturedLeads),
        };
      }
      return updated;
    });
    setSummaryHydrated(true);
    setSummaryOpp({ loading: false, total: next.summary.total, byCube: next.summary.byCube });
    setSummaryProfile(next.profile);
    setSummaryEstimatedByCube(next.estimatedByCube);
    setLastRefreshAt(Date.now());
    setIsRefreshing(false);
  }, [period]);

  const applyChannelRefreshPayload = useCallback((channel: DashboardChannelKey, payload: ChannelRefreshResponse | null | undefined, fallbackSyncAt?: number) => {
    const syncAt = Number.isFinite(Number(fallbackSyncAt)) ? Number(fallbackSyncAt) : Date.now();
    let latestSyncAt = syncAt;

    for (const targetPeriod of [7, 30] as const) {
      const periodPayload = payload?.periods?.[String(targetPeriod)];
      const block = periodPayload?.block;
      if (!block || typeof block !== "object") continue;

      const periodSyncAt = Number.isFinite(Number(periodPayload?.syncedAt)) ? Number(periodPayload?.syncedAt) : (block.syncAt ?? syncAt);
      latestSyncAt = Math.max(latestSyncAt, periodSyncAt);

      mergeChannelBlockIntoCachedSnapshots({
        period: targetPeriod,
        channel,
        block,
        overview: periodPayload?.overview,
        syncedAt: periodSyncAt,
        snapshotDate: typeof periodPayload?.snapshotDate === "string" ? periodPayload.snapshotDate : block.snapshotDate ?? null,
      });

      if (targetPeriod !== period) continue;

      setDataByCube((prev) => ({
        ...prev,
        [channel]: {
          ov: ((periodPayload?.overview as Overview | undefined) ?? (block.overview as Overview | null | undefined) ?? prev[channel]?.ov ?? null),
          loading: false,
          error: block.error ?? undefined,
          capturedLeads: normalizeCapturedLeads(block.capturedLeads, prev[channel]?.capturedLeads),
        },
      }));

      const cachedSummary = parseCachedSummarySnapshot(readUiCacheValue(summarySessionKey(targetPeriod)));
      if (cachedSummary) {
        setSummaryHydrated(true);
        setSummaryOpp({
          loading: false,
          total: safeNum(cachedSummary.total),
          byCube: {
            site_inrcy: safeNum(cachedSummary.byCube?.site_inrcy),
            site_web: safeNum(cachedSummary.byCube?.site_web),
            gmb: safeNum(cachedSummary.byCube?.gmb),
            facebook: safeNum(cachedSummary.byCube?.facebook),
            instagram: safeNum(cachedSummary.byCube?.instagram),
            linkedin: safeNum(cachedSummary.byCube?.linkedin),
          tiktok: safeNum(cachedSummary.byCube?.tiktok),
          },
        });
        setSummaryProfile({
          lead_conversion_rate: safeNum(cachedSummary.profile?.lead_conversion_rate),
          avg_basket: safeNum(cachedSummary.profile?.avg_basket),
        });
        setSummaryEstimatedByCube({
          site_inrcy: safeNum(cachedSummary.estimatedByCube?.site_inrcy),
          site_web: safeNum(cachedSummary.estimatedByCube?.site_web),
          gmb: safeNum(cachedSummary.estimatedByCube?.gmb),
          facebook: safeNum(cachedSummary.estimatedByCube?.facebook),
          instagram: safeNum(cachedSummary.estimatedByCube?.instagram),
          linkedin: safeNum(cachedSummary.estimatedByCube?.linkedin),
        tiktok: safeNum(cachedSummary.estimatedByCube?.tiktok),
        });
      }

      if (targetPeriod === 30 && cachedSummary) {
        syncGeneratorOpportunitiesFromStatsSummary({
          byCube: {
            site_inrcy: safeNum(cachedSummary.byCube?.site_inrcy),
            site_web: safeNum(cachedSummary.byCube?.site_web),
            gmb: safeNum(cachedSummary.byCube?.gmb),
            facebook: safeNum(cachedSummary.byCube?.facebook),
            instagram: safeNum(cachedSummary.byCube?.instagram),
            linkedin: safeNum(cachedSummary.byCube?.linkedin),
          tiktok: safeNum(cachedSummary.byCube?.tiktok),
          },
          estimatedByCube: {
            site_inrcy: safeNum(cachedSummary.estimatedByCube?.site_inrcy),
            site_web: safeNum(cachedSummary.estimatedByCube?.site_web),
            gmb: safeNum(cachedSummary.estimatedByCube?.gmb),
            facebook: safeNum(cachedSummary.estimatedByCube?.facebook),
            instagram: safeNum(cachedSummary.estimatedByCube?.instagram),
            linkedin: safeNum(cachedSummary.estimatedByCube?.linkedin),
        tiktok: safeNum(cachedSummary.estimatedByCube?.tiktok),
          },
          profile: cachedSummary.profile,
          syncedAt: periodSyncAt,
          snapshotDate: typeof periodPayload?.snapshotDate === "string" ? periodPayload.snapshotDate : block.snapshotDate ?? null,
        });
      }
    }

    markChannelsSynced([channel], latestSyncAt);
    setLastRefreshAt(Date.now());
    setIsRefreshing(false);
    return latestSyncAt;
  }, [period]);

  const refreshChannelFromApi = useCallback(async (channel: DashboardChannelKey, fallbackSyncAt?: number) => {
    const res = await fetch("/api/stats/channel-refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel }),
      cache: "no-store",
      credentials: "include",
    });
    if (!res.ok) {
      throw new Error(await getSimpleFrenchApiError(res));
    }
    const json = await res.json().catch(() => null) as ChannelRefreshResponse | null;
    return applyChannelRefreshPayload(channel, json, fallbackSyncAt);
  }, [applyChannelRefreshPayload]);

  const applyBootstrapPayload = useCallback((bootstrap: DailyStatsRefreshBootstrapResponse) => {
    const syncAt = Number.isFinite(Number(bootstrap?.syncAt)) ? Number(bootstrap.syncAt) : Date.now();
    const bootstrapSnapshotDate = typeof bootstrap?.snapshotDate === "string"
      ? bootstrap.snapshotDate
      : expectedUiSnapshotDate();

    markDailyStatsRefreshBootstrapChecked({ snapshotDate: bootstrapSnapshotDate, checkedAt: Date.now(), syncAt });

    if (!bootstrap?.ran) {
      return { syncAt, bootstrapSnapshotDate };
    }

    const generator = bootstrap.generator;

    if (generator) {
      const oppMonth = Number(generator?.details?.opportunities?.month);
      if (Number.isFinite(oppMonth)) {
        try {
          writeUiCacheValue("inrcy_opp30_total_v1", String(oppMonth));
        } catch {
          // ignore
        }
      }

      try {
        const generatorSnapshotDate = typeof generator?.meta?.snapshotDate === "string"
          ? generator.meta.snapshotDate
          : bootstrapSnapshotDate ?? null;
        writeUiCacheValue(
          "inrcy_generator_kpis_v1",
          JSON.stringify({ syncedAt: syncAt, snapshotDate: generatorSnapshotDate, payload: generator })
        );
      } catch {
        // ignore
      }
    }

    for (const [periodKey, rawPayload] of Object.entries(bootstrap.inrstats || {})) {
      const payload = rawPayload as any;
      const targetPeriod = Number(periodKey) as Period;
      const overviews = (payload?.overviews || {}) as Partial<Record<CubeKey, Overview>>;
      const payloadSnapshotDate = typeof payload?.meta?.snapshotDate === "string"
        ? payload.meta.snapshotDate
        : getOverviewSnapshotDate(overviews) || bootstrapSnapshotDate || null;
      const next: BulkFetchResult = {
        overviews,
        summary: {
          total: safeNum(payload?.opportunities?.total),
          byCube: {
            site_inrcy: safeNum(payload?.opportunities?.byCube?.site_inrcy),
            site_web: safeNum(payload?.opportunities?.byCube?.site_web),
            gmb: safeNum(payload?.opportunities?.byCube?.gmb),
            facebook: safeNum(payload?.opportunities?.byCube?.facebook),
            instagram: safeNum(payload?.opportunities?.byCube?.instagram),
            linkedin: safeNum(payload?.opportunities?.byCube?.linkedin),
            tiktok: safeNum(payload?.opportunities?.byCube?.tiktok),
          },
        },
        profile: {
          lead_conversion_rate: safeNum(payload?.profile?.lead_conversion_rate),
          avg_basket: safeNum(payload?.profile?.avg_basket),
        },
        estimatedByCube: {
          site_inrcy: safeNum(payload?.estimatedByCube?.site_inrcy),
          site_web: safeNum(payload?.estimatedByCube?.site_web),
          gmb: safeNum(payload?.estimatedByCube?.gmb),
          facebook: safeNum(payload?.estimatedByCube?.facebook),
          instagram: safeNum(payload?.estimatedByCube?.instagram),
          linkedin: safeNum(payload?.estimatedByCube?.linkedin),
          tiktok: safeNum(payload?.estimatedByCube?.tiktok),
        },
        blocks: payload?.blocks,
        snapshotDate: payloadSnapshotDate ?? null,
      };
      applyBulkPayload(targetPeriod, next, syncAt);
    }

    return { syncAt, bootstrapSnapshotDate };
  }, [applyBulkPayload]);

  const syncFromServerCacheIfNeeded = useCallback(async (force = false) => {
    if (typeof window === "undefined") return;
    const now = Date.now();
    const snapshotDate = expectedUiSnapshotDate();
    if (!force) {
      if (now - lastServerCacheCheckAtRef.current < 60_000) return;
      if (wasServerCacheSyncCheckedRecently("stats", { snapshotDate })) return;
    }
    if (serverCacheCheckPromiseRef.current) {
      await serverCacheCheckPromiseRef.current;
      return;
    }

    const job = (async () => {
      lastServerCacheCheckAtRef.current = now;
      try {
        const res = await fetch("/api/dashboard/cache-status", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json().catch(() => null);
        if (json?.connections?.needsRefresh === true) {
          const bootstrap = await runDailyStatsRefreshBootstrap({ announce: true, force: true });
          applyBootstrapPayload(bootstrap);
          markServerCacheSyncChecked("stats", { snapshotDate, checkedAt: Date.now(), syncAt: Number(bootstrap?.syncAt ?? Date.now()) });
          return;
        }

        const periodStatuses: Partial<Record<Period, { syncedAt?: number; channels?: Partial<Record<DashboardChannelKey, number>> }>> = {
          7: json?.inrstats?.[7] ?? json?.inrstats?.["7"] ?? null,
          30: json?.inrstats?.[30] ?? json?.inrstats?.["30"] ?? null,
        };
        const staleChannelsByPeriod = ([7, 30] as Period[]).reduce((acc, days) => {
          const channels = periodStatuses[days]?.channels;
          acc[days] = !channels || typeof channels !== "object"
            ? []
            : Object.entries(channels)
                .filter(([channel, serverTs]) => Number(serverTs ?? 0) > readCachedChannelSyncAt(days as StatsWarmPeriod, channel as DashboardChannelKey))
                .map(([channel]) => channel as DashboardChannelKey);
          return acc;
        }, {} as Partial<Record<Period, DashboardChannelKey[]>>);
        const periodsToRefresh = ([7, 30] as Period[])
          .map((days) => ({
            days,
            syncedAt: Number(periodStatuses[days]?.syncedAt ?? 0),
            staleChannels: staleChannelsByPeriod[days] || [],
          }))
          .filter((item) => item.syncedAt > getLocalPeriodSyncAt(item.days) && (getLocalPeriodSyncAt(item.days) === 0 || item.staleChannels.length === 0));
        const staleChannels = Array.from(new Set((([7, 30] as Period[])
          .filter((days) => !periodsToRefresh.some((item) => item.days === days))
          .flatMap((days) => staleChannelsByPeriod[days] || []))));

        for (const item of periodsToRefresh) {
          const next = await fetchBulkStats(item.days, false);
          applyBulkPayload(item.days, next, item.syncedAt);
        }

        for (const channel of staleChannels) {
          await refreshChannelFromApi(channel);
        }
        markServerCacheSyncChecked("stats", { snapshotDate, checkedAt: Date.now() });
      } catch {
        // ignore lightweight sync errors
      }
    })();

    serverCacheCheckPromiseRef.current = job;
    try {
      await job;
    } finally {
      serverCacheCheckPromiseRef.current = null;
    }
  }, [applyBootstrapPayload, applyBulkPayload, refreshChannelFromApi]);

  const handleSharedStatsRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setLastRefreshAt(Date.now());

    try {
      const bootstrap = await runDailyStatsRefreshBootstrap({ announce: true, force: true });
      applyBootstrapPayload(bootstrap);

      if (!bootstrap?.ran) {
        await syncFromServerCacheIfNeeded(true);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsRefreshing(false);
    }
  }, [applyBootstrapPayload, syncFromServerCacheIfNeeded]);




  const hydrateFromSessionCache = useCallback((targetPeriod: Period) => {
    const lastChannelSyncAt = getStatsLastChannelSyncAt();
    const cachedCube = parseCachedCubeSnapshot(readUiCacheValue(cubeSessionKey(targetPeriod)));
    const cachedSummary = parseCachedSummarySnapshot(readUiCacheValue(summarySessionKey(targetPeriod)));
    const expectedSnapshotDate = expectedUiSnapshotDate();
    const cubeFresh = !!cachedCube?.overviews && cachedCube.syncedAt >= lastChannelSyncAt && cachedCube.snapshotDate === expectedSnapshotDate;
    const cubeBlocksFresh = hasCapturedLeadsBlocks(cachedCube?.blocks);
    const summaryFresh = !!cachedSummary && cachedSummary.syncedAt >= lastChannelSyncAt && cachedSummary.snapshotDate === expectedSnapshotDate;
    if (!cubeFresh || !cubeBlocksFresh || !summaryFresh) return false;

    periodCacheRef.current.set(targetPeriod, cachedCube.overviews);
    setDataByCube((prev) => {
      const next: any = { ...prev };
      for (const k of Object.keys(cachedCube.overviews) as CubeKey[]) {
        next[k] = {
          ov: (cachedCube.overviews as any)[k],
          loading: false,
          error: undefined,
          capturedLeads: normalizeCapturedLeads(cachedCube.blocks?.[k]?.capturedLeads, prev[k]?.capturedLeads),
        };
      }
      return next;
    });

    const byCubePartial = cachedSummary?.byCube || {};
    const estimatedByCubePartial = cachedSummary?.estimatedByCube || {};
    setSummaryHydrated(true);
    setSummaryOpp({
      loading: false,
      total: safeNum(cachedSummary?.total),
      byCube: {
        site_inrcy: safeNum(byCubePartial.site_inrcy),
        site_web: safeNum(byCubePartial.site_web),
        gmb: safeNum(byCubePartial.gmb),
        facebook: safeNum(byCubePartial.facebook),
        instagram: safeNum(byCubePartial.instagram),
        linkedin: safeNum(byCubePartial.linkedin),
          tiktok: safeNum(byCubePartial.tiktok),
      },
    });
    setSummaryProfile({
      lead_conversion_rate: safeNum(cachedSummary?.profile?.lead_conversion_rate),
      avg_basket: safeNum(cachedSummary?.profile?.avg_basket),
    });
    setSummaryEstimatedByCube({
      site_inrcy: safeNum(estimatedByCubePartial.site_inrcy),
      site_web: safeNum(estimatedByCubePartial.site_web),
      gmb: safeNum(estimatedByCubePartial.gmb),
      facebook: safeNum(estimatedByCubePartial.facebook),
      instagram: safeNum(estimatedByCubePartial.instagram),
      linkedin: safeNum(estimatedByCubePartial.linkedin),
        tiktok: safeNum(estimatedByCubePartial.tiktok),
    });
    return true;
  }, []);


  const fetchBulkStats = async (period: Period, forceFresh = false): Promise<BulkFetchResult> => {
    const params = new URLSearchParams({ days: String(period) });
    const expectedSnapshotDate = expectedUiSnapshotDate();
    if (forceFresh) params.set("fresh", "1");
    if (expectedSnapshotDate) params.set("snapshotDate", expectedSnapshotDate);
    const r = await fetch(`/api/stats/dashboard-bulk?${params.toString()}`, { cache: "no-store" });
    if (!r.ok) {
      throw new Error(await getSimpleFrenchApiError(r));
    }
    const json = (await r.json()) as StatsBulkResponse;
    const overviews = (json?.overviews || {}) as Partial<Record<CubeKey, Overview>>;
    const byCubePartial = json?.opportunities?.byCube || {};
    const snapshotDate = typeof json?.meta?.snapshotDate === "string" ? json.meta.snapshotDate : getOverviewSnapshotDate(overviews) || expectedSnapshotDate;
    return {
      overviews,
      summary: {
        total: safeNum(json?.opportunities?.total),
        byCube: {
          site_inrcy: safeNum(byCubePartial.site_inrcy),
          site_web: safeNum(byCubePartial.site_web),
          gmb: safeNum(byCubePartial.gmb),
          facebook: safeNum(byCubePartial.facebook),
          instagram: safeNum(byCubePartial.instagram),
          linkedin: safeNum(byCubePartial.linkedin),
          tiktok: safeNum(byCubePartial.tiktok),
        } as Record<CubeKey, number>,
      },
      profile: {
        lead_conversion_rate: safeNum(json?.profile?.lead_conversion_rate),
        avg_basket: safeNum(json?.profile?.avg_basket),
      },
      estimatedByCube: {
        site_inrcy: safeNum(json?.estimatedByCube?.site_inrcy),
        site_web: safeNum(json?.estimatedByCube?.site_web),
        gmb: safeNum(json?.estimatedByCube?.gmb),
        facebook: safeNum(json?.estimatedByCube?.facebook),
        instagram: safeNum(json?.estimatedByCube?.instagram),
        linkedin: safeNum(json?.estimatedByCube?.linkedin),
        tiktok: safeNum(json?.estimatedByCube?.tiktok),
      } as Record<CubeKey, number>,
      blocks: json?.blocks as any,
      snapshotDate: snapshotDate ?? null,
    };
  };

  useEffect(() => {
    const snapshotDate = expectedUiSnapshotDate();
    const hasFreshLocalStats = hasFreshLocalPeriodSnapshot(period);

    if (hasFreshLocalStats) {
      try {
        hydrateFromSessionCache(period);
      } catch {
        // ignore
      }
    }

    if (hasFreshLocalStats && wasDailyStatsRefreshBootstrapCheckedRecently({ snapshotDate })) {
      setDailyBootReady(true);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const bootstrap = await runDailyStatsRefreshBootstrap();
        if (cancelled) return;

        applyBootstrapPayload(bootstrap);

        if (!bootstrap.ran && !hasFreshLocalStats) {
          await syncFromServerCacheIfNeeded(true);
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (!cancelled) setDailyBootReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyBootstrapPayload, hydrateFromSessionCache, period, syncFromServerCacheIfNeeded]);

  useEffect(() => {
    if (!dailyBootReady) return;
    if (hydratedPeriodsRef.current.has(period)) return;
    hydratedPeriodsRef.current.add(period);

    try {
      hydrateFromSessionCache(period);
    } catch {
      // ignore
    }
  }, [dailyBootReady, hydrateFromSessionCache, period]);

useEffect(() => {
  if (!dailyBootReady) return;
  let cancelled = false;
  const keys: CubeKey[] = ["site_inrcy", "site_web", "gmb", "facebook", "instagram", "linkedin", "tiktok"];

  (async () => {
    // Fast path: cached data for this period
    const cached = periodCacheRef.current.get(period);
    const cachedCubeSnapshot = parseCachedCubeSnapshot(readUiCacheValue(cubeSessionKey(period)));
    const lastChannelSyncAt = getStatsLastChannelSyncAt();
    const cachedSummary = parseCachedSummarySnapshot(readUiCacheValue(summarySessionKey(period)));
    const hasFreshCachedSummary = !!cachedSummary && cachedSummary.syncedAt >= lastChannelSyncAt && cachedSummary.snapshotDate === expectedUiSnapshotDate();
    const hasFreshCapturedLeads = hasCapturedLeadsBlocks(cachedCubeSnapshot?.blocks);
    if (cached && hasFreshCachedSummary && hasFreshCapturedLeads) {
      setDataByCube((prev) => {
        const next: any = { ...prev };
        for (const k of Object.keys(cached) as CubeKey[]) {
          next[k] = {
            ov: (cached as any)[k],
            loading: false,
            error: undefined,
            capturedLeads: normalizeCapturedLeads(cachedCubeSnapshot?.blocks?.[k]?.capturedLeads, prev[k]?.capturedLeads),
          };
        }
        return next;
      });
      return;
    }
    if (hydrateFromSessionCache(period)) {
      return;
    }
    if (cached && cachedSummary && hasFreshCapturedLeads) {
      setDataByCube((prev) => {
        const next: any = { ...prev };
        for (const k of Object.keys(cached) as CubeKey[]) {
          next[k] = {
            ov: (cached as any)[k],
            loading: false,
            error: undefined,
            capturedLeads: normalizeCapturedLeads(cachedCubeSnapshot?.blocks?.[k]?.capturedLeads, prev[k]?.capturedLeads),
          };
        }
        return next;
      });
      setSummaryOpp({
        loading: false,
        total: safeNum(cachedSummary.total),
        byCube: {
          site_inrcy: safeNum(cachedSummary.byCube?.site_inrcy),
          site_web: safeNum(cachedSummary.byCube?.site_web),
          gmb: safeNum(cachedSummary.byCube?.gmb),
          facebook: safeNum(cachedSummary.byCube?.facebook),
          instagram: safeNum(cachedSummary.byCube?.instagram),
          linkedin: safeNum(cachedSummary.byCube?.linkedin),
          tiktok: safeNum(cachedSummary.byCube?.tiktok),
        },
      });
      setSummaryProfile({
        lead_conversion_rate: safeNum(cachedSummary.profile?.lead_conversion_rate),
        avg_basket: safeNum(cachedSummary.profile?.avg_basket),
      });
      setSummaryEstimatedByCube({
        site_inrcy: safeNum(cachedSummary.estimatedByCube?.site_inrcy),
        site_web: safeNum(cachedSummary.estimatedByCube?.site_web),
        gmb: safeNum(cachedSummary.estimatedByCube?.gmb),
        facebook: safeNum(cachedSummary.estimatedByCube?.facebook),
        instagram: safeNum(cachedSummary.estimatedByCube?.instagram),
        linkedin: safeNum(cachedSummary.estimatedByCube?.linkedin),
        tiktok: safeNum(cachedSummary.estimatedByCube?.tiktok),
      });
      return;
    }

    setDataByCube((prev) => {
      const next: any = { ...prev };
      for (const k of keys) next[k] = { ...next[k], loading: true, error: undefined };
      return next;
    });
    setSummaryOpp((prev) => ({ ...prev, loading: true }));

    try {
      const next = await fetchBulkStats(period, refreshNonce > 0);
      if (cancelled) return;
      try {
        const syncedAt = Date.now();
        applyBulkPayload(period, next, syncedAt);
      } catch {}
    } catch (e: any) {
      if (cancelled) return;

      const msg = getSimpleFrenchErrorMessage(e, "Impossible de charger les statistiques pour le moment.");
      setDataByCube((prev) => {
        const updated: any = { ...prev };
        for (const k of keys) {
          updated[k] = { ...updated[k], loading: false, error: updated[k]?.ov ? undefined : msg };
        }
        return updated;
      });
      setSummaryOpp((prev) => ({ ...prev, loading: false }));
    }
  })();

  return () => {
    cancelled = true;
  };
}, [dailyBootReady, hydrateFromSessionCache, period, refreshNonce]);

  useEffect(() => {
    if (!isRefreshing) return;
    if (refreshTimeoutRef.current) {
      window.clearTimeout(refreshTimeoutRef.current);
    }
    refreshTimeoutRef.current = window.setTimeout(() => {
      setIsRefreshing(false);
      refreshTimeoutRef.current = null;
    }, 900);

    return () => {
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    };
  }, [isRefreshing, refreshNonce]);

  useEffect(() => {
    const runSilentSync = async (force: boolean) => {
      const now = Date.now();
      // Evite les rafales quand plusieurs evenements arrivent au retour sur iNrStats.
      if (now - lastAutoRefreshAtRef.current < 1500) return;
      lastAutoRefreshAtRef.current = now;

      // Si le cache local est deja aligne, on ne montre rien et on ne force aucun recalcul.
      if (hydrateFromSessionCache(period)) {
        setIsRefreshing(false);
        return;
      }

      // Controle serveur silencieux : pas de label "Actualisation..." pour un simple check.
      await syncFromServerCacheIfNeeded(force);
    };

    const handleChannelUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ channel?: DashboardChannelKey }>).detail;
      void runSilentSync(isDashboardChannelKey(detail?.channel));
    };

    const handleChannelsUpdated = () => {
      void runSilentSync(true);
    };

    window.addEventListener("inrcy:channel-updated", handleChannelUpdated as EventListener);
    window.addEventListener("inrcy:channels-updated", handleChannelsUpdated as EventListener);
    return () => {
      window.removeEventListener("inrcy:channel-updated", handleChannelUpdated as EventListener);
      window.removeEventListener("inrcy:channels-updated", handleChannelsUpdated as EventListener);
    };
  }, [hydrateFromSessionCache, period, syncFromServerCacheIfNeeded]);

  useEffect(() => {
    const handleProfileVersionChange = (event: Event) => {
      const detail = (event as CustomEvent<ProfileVersionChangeDetail>).detail;
      if (detail?.field !== "stats_version") return;

      // Mise a jour inter-appareil silencieuse : on garde le systeme de synchro
      // sans afficher un refresh utilisateur a chaque retour sur la page.
      void syncFromServerCacheIfNeeded(true);
    };

    window.addEventListener(PROFILE_VERSION_EVENT, handleProfileVersionChange as EventListener);
    return () => {
      window.removeEventListener(PROFILE_VERSION_EVENT, handleProfileVersionChange as EventListener);
    };
  }, [syncFromServerCacheIfNeeded]);


  useEffect(() => {
    if (!dailyBootReady) return;
    void syncFromServerCacheIfNeeded(false);

    const handleFocus = () => {
      void syncFromServerCacheIfNeeded(false);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void syncFromServerCacheIfNeeded(false);
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [dailyBootReady, syncFromServerCacheIfNeeded]);


  const models: CubeModel[] = useMemo(() => ([
    buildCubeModel("site_inrcy", "Site iNrCy", "Optimisé pour convertir", period, dataByCube.site_inrcy, summaryOpp.byCube),
    buildCubeModel("site_web", "Site Web", "Votre image", period, dataByCube.site_web, summaryOpp.byCube),
    buildCubeModel("gmb", "Google Business", "Visibilité locale", period, dataByCube.gmb, summaryOpp.byCube),
    buildCubeModel("facebook", "Facebook", "Visibilité sociale", period, dataByCube.facebook, summaryOpp.byCube),
    buildCubeModel("instagram", "Instagram", "Visibilité de marque", period, dataByCube.instagram, summaryOpp.byCube),
    buildCubeModel("linkedin", "LinkedIn", "Visibilité professionnelle", period, dataByCube.linkedin, summaryOpp.byCube),
    buildCubeModel("tiktok", "TikTok", "Photos & vidéos courtes", period, dataByCube.tiktok, summaryOpp.byCube),
  ]), [dataByCube, period, summaryOpp.byCube]);

  const centralPotential30 = summaryOpp.total;
  const centralByCube = summaryOpp.byCube;

  const computedEstimatedByCube = useMemo<Record<CubeKey, number>>(() => {
    const rate = Math.max(0, safeNum(summaryProfile.lead_conversion_rate)) / 100;
    const basket = Math.max(0, safeNum(summaryProfile.avg_basket));
    const estimate = (opportunities: number) => Math.round(Math.max(0, safeNum(opportunities)) * rate * basket);

    return {
      site_inrcy: estimate(centralByCube.site_inrcy),
      site_web: estimate(centralByCube.site_web),
      gmb: estimate(centralByCube.gmb),
      facebook: estimate(centralByCube.facebook),
      instagram: estimate(centralByCube.instagram),
      linkedin: estimate(centralByCube.linkedin),
      tiktok: estimate(centralByCube.tiktok),
    };
  }, [centralByCube, summaryProfile.avg_basket, summaryProfile.lead_conversion_rate]);

  const summaryActionItems = useMemo(() => buildSummaryActionItems({
    centralByCube,
    computedEstimatedByCube,
    models,
    summaryEstimatedByCube,
  }), [centralByCube, computedEstimatedByCube, models, summaryEstimatedByCube]);

  const summaryActionByChannel = useMemo(() => {
    return new Map(summaryActionItems.map((item) => [item.key, item]));
  }, [summaryActionItems]);

  const connectedChannelsCount = useMemo(() => {
    return models.reduce((total, model) => {
      const isSite = model.key === "site_inrcy" || model.key === "site_web";
      const connected = isSite ? !!model.connections.ga4 || !!model.connections.gsc : !!model.connections.main;
      return total + (connected ? 1 : 0);
    }, 0);
  }, [models]);

  const totalCapturedLeads30 = useMemo(() => {
    return models.reduce((total, model) => total + safeNum(model.capturedLeads.month), 0);
  }, [models]);

  const activeModel = activeStatsPanel === "all"
    ? null
    : models.find((model) => model.key === activeStatsPanel) ?? models[0] ?? null;

  const navigateFromStats = (href: string) => {
    if (href.startsWith("/api/")) window.location.href = href;
    else router.push(href);
  };

  const selectStatsPanel = (panel: StatsPanelKey) => {
    setActiveStatsPanel(panel);
    setStatsMenuOpen(false);
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.brand}>
            <Image
              src="/inrstats-logo.png"
              alt="iNrStats"
              width={154}
              height={64}
              style={{ width: 154, height: "auto" }}
              priority
            />
            <div className={`${styles.tagline} ${styles.taglineDesktop}`}>Vos données analysées en mode business.</div>
          </div>

          <div className={styles.headerActions}>
            <div className={styles.headerCloseControls}>
              <HelpButton onClick={() => setHelpOpen(true)} title="Aide iNr’Stats" />
              <button
                type="button"
                className={styles.statsMobileNavButton}
                onClick={() => setStatsMenuOpen(true)}
                aria-label="Ouvrir les canaux iNrStats"
                title="Canaux"
              >
                ☰
              </button>
              <ResponsiveActionButton
                desktopLabel={isRefreshing ? "Actualisation…" : "Actualiser"}
                mobileIcon="↻"
                onClick={() => {
                  void handleSharedStatsRefresh();
                }}
                ariaLabel="Actualiser les données iNrStats"
                title={lastRefreshAt ? `Dernière actualisation : ${new Date(lastRefreshAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Actualiser les données iNrStats"}
              />
              <ResponsiveActionButton desktopLabel="Fermer" mobileIcon="✕" onClick={() => router.push("/dashboard")} />
            </div>
          </div>
        </div>
        <div className={`${styles.tagline} ${styles.taglineMobile}`}>Vos données analysées en mode business.</div>
      </div>

      <HelpModal open={helpOpen} title="iNr’Stats" onClose={() => setHelpOpen(false)}>
        <p style={{ marginTop: 0 }}>
          iNr’Stats analyse les données récupérées sur vos canaux (site, Google, réseaux…) et les transforme en analyse business.
        </p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>Comprenez votre potentiel d’opportunités sur les 30 jours à venir.</li>
          <li>Identifiez les actions à mener pour capter ce potentiel.</li>
          <li>Suivez l’évolution par canal et identifiez les actions à mener sur les 30 jours à venir.</li>
        </ul>
      </HelpModal>

      {statsMenuOpen ? (
        <div className={styles.statsMobileDrawerOverlay} role="presentation" onClick={() => setStatsMenuOpen(false)}>
          <aside className={styles.statsMobileDrawer} aria-label="Choisir une vue iNrStats" onClick={(event) => event.stopPropagation()}>
            <div className={styles.statsMobileDrawerHead}>
              <strong>Canaux</strong>
              <button type="button" onClick={() => setStatsMenuOpen(false)} aria-label="Fermer le menu des canaux">×</button>
            </div>

            <div className={styles.statsMobileDrawerList}>
              <button
                type="button"
                className={`${styles.statsMobileDrawerItem} ${styles.statsRailItemGlobal} ${connectedChannelsCount > 0 ? styles.statsRailItemConnected : styles.statsRailItemOff} ${activeStatsPanel === "all" ? styles.statsMobileDrawerItemActive : ""}`}
                onClick={() => selectStatsPanel("all")}
              >
                <span className={styles.statsRailDot} aria-hidden />
                <span className={styles.statsRailText}>
                  <b>Tous</b>
                  <small>Vue globale</small>
                </span>
                <span className={styles.statsRailValue}>+{fmtInt(centralPotential30)}</span>
              </button>

              {models.map((model) => {
                const isSite = model.key === "site_inrcy" || model.key === "site_web";
                const isTikTokComingSoon = model.key === "tiktok";
                const connected = !isTikTokComingSoon && (isSite ? !!model.connections.ga4 || !!model.connections.gsc : !!model.connections.main);
                const isActive = activeStatsPanel === model.key;

                return (
                  <button
                    type="button"
                    key={model.key}
                    className={`${styles.statsMobileDrawerItem} ${isActive ? styles.statsMobileDrawerItemActive : ""} ${isTikTokComingSoon ? styles.statsRailItemDisabled : connected ? styles.statsRailItemConnected : styles.statsRailItemOff}`}
                    onClick={() => selectStatsPanel(model.key)}
                  >
                    <span className={styles.statsRailDot} aria-hidden />
                    <span className={styles.statsRailText}>
                      <b>{model.title}</b>
                      <small>{isTikTokComingSoon ? "Arrive bientôt" : connected ? "Connecté" : "À connecter"}</small>
                    </span>
                    <span className={styles.statsRailValue}>+{fmtInt(model.opportunity30)}</span>
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      ) : null}

      <div className={styles.statsWorkspace}>
        <aside className={styles.statsRail} aria-label="Canaux iNrStats">
          <button
            type="button"
            className={`${styles.statsRailItem} ${styles.statsRailItemGlobal} ${connectedChannelsCount > 0 ? styles.statsRailItemConnected : styles.statsRailItemOff} ${activeStatsPanel === "all" ? styles.statsRailItemActive : ""}`}
            onClick={() => selectStatsPanel("all")}
          >
            <span className={styles.statsRailDot} aria-hidden />
            <span className={styles.statsRailText}>
              <b>Tous</b>
              <small>Vue globale</small>
            </span>
            <span className={styles.statsRailValue}>+{fmtInt(centralPotential30)}</span>
          </button>

          {models.map((model) => {
            const isSite = model.key === "site_inrcy" || model.key === "site_web";
            const isTikTokComingSoon = model.key === "tiktok";
            const connected = !isTikTokComingSoon && (isSite ? !!model.connections.ga4 || !!model.connections.gsc : !!model.connections.main);
            const isActive = activeStatsPanel === model.key;

            return (
              <button
                key={model.key}
                type="button"
                className={`${styles.statsRailItem} ${isActive ? styles.statsRailItemActive : ""} ${isTikTokComingSoon ? styles.statsRailItemDisabled : connected ? styles.statsRailItemConnected : styles.statsRailItemOff}`}
                onClick={() => selectStatsPanel(model.key)}
              >
                <span className={styles.statsRailDot} aria-hidden />
                <span className={styles.statsRailText}>
                  <b>{model.title}</b>
                  <small>{isTikTokComingSoon ? "Arrive bientôt" : connected ? "Connecté" : "À connecter"}</small>
                </span>
                <span className={styles.statsRailValue}>+{fmtInt(model.opportunity30)}</span>
              </button>
            );
          })}
        </aside>

        <main className={styles.statsPanel}>
          {activeStatsPanel === "all" ? (
            <section className={styles.allStatsPanel} aria-label="Vue globale iNrStats">
              <div className={styles.allStatsHero}>
                <div>
                  <div className={styles.allStatsEyebrow}>Vue globale</div>
                  <h2 className={styles.allStatsTitle}>Tous vos canaux en un coup d’œil</h2>
                  <p className={styles.allStatsText}>
                    Synthèse par canal : opportunités activables, CA potentiel et outil recommandé.
                  </p>
                </div>

                <div className={styles.allStatsKpis}>
                  <div className={`${styles.allStatsKpi} ${styles.kpiToneBlue}`}>
                    <span>Opportunités</span>
                    <b>+{fmtInt(centralPotential30)}</b>
                  </div>
                  <div className={`${styles.allStatsKpi} ${styles.kpiTonePurple}`}>
                    <span>CA potentiel</span>
                    <b>+{fmtInt(summaryActionItems.reduce((total, item) => total + safeNum(item.revenue), 0))} €</b>
                  </div>
                  <div className={`${styles.allStatsKpi} ${styles.kpiToneGreen}`}>
                    <span>Demandes captées 30 j</span>
                    <b>{fmtInt(totalCapturedLeads30)}</b>
                  </div>
                  <div className={`${styles.allStatsKpi} ${styles.kpiToneSlate}`}>
                    <span>Canaux</span>
                    <b>{models.length}</b>
                  </div>
                </div>
              </div>

              <div className={styles.allStatsActions}>
                {models.map((model) => {
                  const actionItem = summaryActionByChannel.get(model.key);
                  const revenue = summaryEstimatedByCube[model.key] || computedEstimatedByCube[model.key] || actionItem?.revenue || 0;
                  const actionHref = model.action?.href || "#";
                  const channelText = model.insights.find((text) => !text.toLowerCase().startsWith("recommandation")) || model.capturedLeadsHint || model.subtitle;
                  const actionText = actionItem?.kicker || model.action.title;
                  const isSite = model.key === "site_inrcy" || model.key === "site_web";
                  const isTikTokComingSoon = model.key === "tiktok";
                  const connected = !isTikTokComingSoon && (isSite ? !!model.connections.ga4 || !!model.connections.gsc : !!model.connections.main);

                  return (
                    <article
                      key={model.key}
                      className={`${styles.allStatsActionCard} ${isTikTokComingSoon ? styles.allStatsActionCardDisabled : connected ? styles.allStatsActionCardConnected : styles.allStatsActionCardOff}`}
                    >
                      <button
                        type="button"
                        className={styles.allStatsDetailArrow}
                        onClick={() => scrollTo(model.key)}
                        aria-label={`Voir le détail ${model.title}`}
                        title="Voir le détail"
                      >
                        ↗
                      </button>

                      <button type="button" className={styles.allStatsChannelButton} onClick={() => scrollTo(model.key)}>
                        <span className={styles.allStatsChannelName}>{model.title}</span>
                      </button>

                      <div className={styles.allStatsMetrics}>
                        <span>
                          <small>Opportunités</small>
                          <b>+{fmtInt(model.opportunity30)}</b>
                        </span>
                        <span>
                          <small>CA potentiel</small>
                          <b>+{fmtInt(revenue)} €</b>
                        </span>
                      </div>

                      <div className={styles.allStatsRecommendedAction}>
                        <span className={`${styles.allStatsToolBadge} ${connected ? "" : styles.allStatsToolBadgeConnect}`}>
                          {isTikTokComingSoon ? "Arrive bientôt" : actionItem?.badge ?? model.action.pill}
                        </span>
                      </div>

                      <button
                        type="button"
                        className={`${styles.allStatsGoButton} ${isTikTokComingSoon ? styles.allStatsGoButtonDisabled : connected ? styles.allStatsGoButtonOn : styles.allStatsGoButtonConnect}`}
                        onClick={() => isTikTokComingSoon ? undefined : actionHref && actionHref !== "#" ? navigateFromStats(actionHref) : scrollTo(model.key)}
                        disabled={isTikTokComingSoon}
                        title={isTikTokComingSoon ? "TikTok arrive bientôt" : connected ? "Lancer l’action recommandée" : "Configurer ce canal"}
                      >
                        {isTikTokComingSoon ? "Bientôt" : connected ? "GO ⚡" : <>GO <PlugIcon /></>}
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : activeModel ? (
            <section className={styles.channelStatsPanel} aria-label={`Données ${activeModel.title}`}>
              <div className={styles.channelStatsHeader}>
                <div className={styles.channelStatsTitleBlock}>
                  <div className={styles.allStatsEyebrow}>Canal actif</div>
                  <h2 className={styles.allStatsTitle}>{activeModel.title}</h2>
                  <p className={styles.allStatsText}>{activeModel.subtitle}</p>
                </div>

                <div className={`${styles.allStatsKpis} ${styles.channelStatsKpis}`}>
                  <div className={`${styles.allStatsKpi} ${styles.kpiToneBlue}`}>
                    <span>Opportunités</span>
                    <b>+{fmtInt(activeModel.opportunity30)}</b>
                  </div>
                  <div className={`${styles.allStatsKpi} ${styles.kpiTonePurple}`}>
                    <span>CA potentiel</span>
                    <b>+{fmtInt(summaryEstimatedByCube[activeModel.key] || computedEstimatedByCube[activeModel.key] || 0)} €</b>
                  </div>
                  <div className={`${styles.allStatsKpi} ${styles.kpiToneGreen} ${styles.channelDemandesKpi}`}>
                    <span className={styles.channelDemandesKpiLabel}>Demandes captées 7j / 30j</span>
                    <b>{activeModel.capturedLeadsUnavailable ? "—" : `${fmtInt(activeModel.capturedLeads.week)} / ${fmtInt(activeModel.capturedLeads.month)}`}</b>
                  </div>
                </div>
              </div>

              <Cube
                model={activeModel}
                onNavigate={navigateFromStats}
                forceOpen
                hideDetailsToggle
                estimatedRevenue={summaryEstimatedByCube[activeModel.key] || computedEstimatedByCube[activeModel.key] || 0}
              />
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}

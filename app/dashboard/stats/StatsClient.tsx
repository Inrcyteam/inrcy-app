"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import styles from "./stats.module.css";
import Image from "next/image";
import { useRouter } from "next/navigation";
import ResponsiveActionButton from "../_components/ResponsiveActionButton";
import HelpButton from "../_components/HelpButton";
import HelpModal from "../_components/HelpModal";
import { getSimpleFrenchApiError, getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import { decideAction, type DecisionResult } from "@/lib/decision/decisionEngine";
import { getDefaultSnapshotDate } from "@/lib/stats/snapshotWindow";
import { PROFILE_VERSION_EVENT, type ProfileVersionChangeDetail } from "@/lib/profileVersioning";
import { readAccountCacheValue, removeAccountCacheValue, writeAccountCacheValue } from "@/lib/browserAccountCache";
import { type DashboardChannelKey, isDashboardChannelKey } from "@/lib/dashboardChannels";
import { type InrstatsChannelBlock } from "@/lib/inrstats/channelBlocks";
import { markDailyStatsRefreshBootstrapChecked, markServerCacheSyncChecked, runDailyStatsRefreshBootstrap, wasDailyStatsRefreshBootstrapCheckedRecently, wasServerCacheSyncCheckedRecently, type DailyStatsRefreshBootstrapResponse } from "@/lib/dailyStatsRefreshClient";
import { markChannelsSynced, mergeChannelBlockIntoCachedSnapshots, readCachedChannelSyncAt, type StatsWarmPeriod } from "../dashboard.client-cache";

const useBrowserLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

type Overview = {
  inrcySiteOwnership?: "none" | "sold" | "rented";
  days: number;
  business?: { sectorCategory?: string | null; profession?: string | null };
  totals: {
    users: number;
    sessions: number;
    pageviews: number;
    engagementRate: number;
    avgSessionDuration: number;
    clicks: number;
    impressions: number;
    ctr: number;
  };
  topPages: Array<{ path: string; views: number }>;
  channels: Array<{ channel: string; sessions: number }>;
  topQueries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>;
  sources: {
    site_inrcy: { connected: { ga4: boolean; gsc: boolean } };
    site_web: { connected: { ga4: boolean; gsc: boolean } };
    gmb: { connected: boolean; metrics: any | null };
    facebook: { connected: boolean; metrics?: any | null };
    instagram: { connected: boolean; metrics?: any | null };
    linkedin: { connected: boolean; metrics?: any | null };
  };
  identities?: Partial<Record<CubeKey, { label?: string | null; url?: string | null }>>;
  meta?: { generatedAt?: string; snapshotDate?: string | null; live?: boolean };
};

type CubeKey = "site_inrcy" | "site_web" | "gmb" | "facebook" | "instagram" | "linkedin";

type Period = 7 | 14 | 30 | 60;

type StatsBulkResponse = {
  overviews?: Partial<Record<CubeKey, Overview>>;
  opportunities?: {
    total?: number;
    byCube?: Partial<Record<CubeKey, number>>;
  };
  profile?: {
    lead_conversion_rate?: number;
    avg_basket?: number;
  };
  estimatedByCube?: Partial<Record<CubeKey, number>>;
  meta?: { snapshotDate?: string | null; live?: boolean };
};

type ChannelRefreshResponse = {
  periods?: Partial<Record<string, {
    block?: InrstatsChannelBlock;
    overview?: unknown;
    syncedAt?: number;
    snapshotDate?: string | null;
  }>>;
};

type BulkFetchResult = {
  overviews: Partial<Record<CubeKey, Overview>>;
  summary: {
    total: number;
    byCube: Record<CubeKey, number>;
  };
  profile: {
    lead_conversion_rate: number;
    avg_basket: number;
  };
  estimatedByCube: Record<CubeKey, number>;
  snapshotDate: string | null;
};

type ActionKey =
  | "booster_publier"
  | "booster_avis"
  | "booster_promotion"
  | "fideliser_informer"
  | "fideliser_satisfaction"
  | "fideliser_remercier"
  | "connect"
  | "loading";


type ActionEffort = {
  level: "faible" | "moyen" | "eleve";
  label: string;
};

type CubeModel = {
  inrcyOwnership?: "none" | "sold" | "rented";
  key: CubeKey;
  title: string;
  subtitle: string;
  accountLabel?: string;
  period: Period;
  loading: boolean;
  error?: string;
  connections: {
    ga4?: boolean;
    gsc?: boolean;
    main?: boolean; // for gmb/facebook
  };
  provenance: Array<{ label: string; value: number; colorVar: string }>;
  opportunity30: number; // projected opportunities for 30 days
  opportunityLabel: string;
  qualityScore: number;
  qualityLabel: string;
  qualityTone: "low" | "ok" | "solid" | "excellent";
  insights: string[];
  action: {
    key: ActionKey;
    title: string;
    detail: string;
    href: string;
    pill: "Booster" | "Fidéliser" | "Connexion";
    effort?: ActionEffort;
  };
};

const AVAILABLE_PERIODS: Period[] = [7, 14, 30, 60];
const PERIODS: Period[] = [7, 30];

function cubeSessionKey(period: Period) {
  return `inrcy_stats_cube_snapshot_v1:${period}`;
}

function summarySessionKey(period: Period) {
  return `inrcy_stats_summary_snapshot_v2:${period}`;
}

function fmtInt(n: number) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(Number.isFinite(n) ? n : 0));
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeNum(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}



function readUiCacheValue(key: string): string | null {
  return readAccountCacheValue(key);
}

function writeUiCacheValue(key: string, value: string) {
  writeAccountCacheValue(key, value);
}

function removeUiCacheValue(key: string) {
  removeAccountCacheValue(key);
}

function expectedUiSnapshotDate() {
  return getDefaultSnapshotDate();
}

function getStatsLastChannelSyncAt() {
  const raw = readUiCacheValue("inrcy_stats_last_channel_sync_v1");
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function getOverviewSnapshotDate(overviews: unknown): string | null {
  if (!overviews || typeof overviews !== "object") return null;
  for (const overview of Object.values(overviews as Record<string, unknown>)) {
    const snapshotDate = typeof (overview as any)?.meta?.snapshotDate === "string"
      ? (overview as any).meta.snapshotDate
      : null;
    if (snapshotDate) return snapshotDate;
  }
  return null;
}

function parseCachedCubeSnapshot(raw: string | null): { syncedAt: number; overviews: Record<CubeKey, Overview>; snapshotDate: string | null } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as any;
    if (parsed && typeof parsed === "object" && parsed.overviews && typeof parsed.overviews === "object") {
      return {
        syncedAt: safeNum(parsed.syncedAt),
        overviews: parsed.overviews as Record<CubeKey, Overview>,
        snapshotDate: typeof parsed.snapshotDate === "string" ? parsed.snapshotDate : getOverviewSnapshotDate(parsed.overviews),
      };
    }
    if (parsed && typeof parsed === "object") {
      return {
        syncedAt: 0,
        overviews: parsed as Record<CubeKey, Overview>,
        snapshotDate: getOverviewSnapshotDate(parsed),
      };
    }
  } catch {
    return null;
  }
  return null;
}

function parseCachedSummarySnapshot(raw: string | null): {
  syncedAt: number;
  total?: number;
  byCube?: Partial<Record<CubeKey, number>>;
  profile?: { lead_conversion_rate?: number; avg_basket?: number };
  estimatedByCube?: Partial<Record<CubeKey, number>>;
  snapshotDate?: string | null;
} | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as any;
    if (parsed && typeof parsed === "object") {
      return {
        syncedAt: safeNum(parsed.syncedAt),
        total: parsed.total,
        byCube: parsed.byCube,
        profile: parsed.profile,
        estimatedByCube: parsed.estimatedByCube,
        snapshotDate: typeof parsed.snapshotDate === "string" ? parsed.snapshotDate : null,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function getLocalPeriodSyncAt(period: Period): number {
  const cubeSync = parseCachedCubeSnapshot(readUiCacheValue(cubeSessionKey(period)))?.syncedAt || 0;
  const summarySync = parseCachedSummarySnapshot(readUiCacheValue(summarySessionKey(period)))?.syncedAt || 0;
  return Math.max(cubeSync, summarySync);
}

function hasFreshLocalPeriodSnapshot(period: Period) {
  const lastChannelSyncAt = getStatsLastChannelSyncAt();
  const cachedCube = parseCachedCubeSnapshot(readUiCacheValue(cubeSessionKey(period)));
  const cachedSummary = parseCachedSummarySnapshot(readUiCacheValue(summarySessionKey(period)));
  const snapshotDate = expectedUiSnapshotDate();
  return Boolean(
    cachedCube?.overviews &&
    cachedSummary &&
    cachedCube.syncedAt >= lastChannelSyncAt &&
    cachedSummary.syncedAt >= lastChannelSyncAt &&
    cachedCube.snapshotDate === snapshotDate &&
    cachedSummary.snapshotDate === snapshotDate
  );
}

function emptyCubeState(): Record<CubeKey, { ov: Overview | null; loading: boolean; error?: string }> {
  return {
    site_inrcy: { ov: null, loading: true },
    site_web: { ov: null, loading: true },
    gmb: { ov: null, loading: true },
    facebook: { ov: null, loading: true },
    instagram: { ov: null, loading: true },
    linkedin: { ov: null, loading: true },
  };
}

function getInitialDataByCube(period: Period): Record<CubeKey, { ov: Overview | null; loading: boolean; error?: string }> {
  const initial = emptyCubeState();
  const cachedCube = parseCachedCubeSnapshot(readUiCacheValue(cubeSessionKey(period)));
  if (!cachedCube?.overviews) return initial;

  const next = { ...initial };
  for (const k of Object.keys(cachedCube.overviews) as CubeKey[]) {
    next[k] = { ov: cachedCube.overviews[k] ?? null, loading: false, error: undefined };
  }
  return next;
}

function getInitialSummaryOpp(period: Period): { loading: boolean; total: number; byCube: Record<CubeKey, number> } {
  const cachedSummary = parseCachedSummarySnapshot(readUiCacheValue(summarySessionKey(period)));
  if (!cachedSummary) {
    return {
      loading: true,
      total: 0,
      byCube: { site_inrcy: 0, site_web: 0, gmb: 0, facebook: 0, instagram: 0, linkedin: 0 },
    };
  }

  return {
    loading: false,
    total: safeNum(cachedSummary.total),
    byCube: {
      site_inrcy: safeNum(cachedSummary.byCube?.site_inrcy),
      site_web: safeNum(cachedSummary.byCube?.site_web),
      gmb: safeNum(cachedSummary.byCube?.gmb),
      facebook: safeNum(cachedSummary.byCube?.facebook),
      instagram: safeNum(cachedSummary.byCube?.instagram),
      linkedin: safeNum(cachedSummary.byCube?.linkedin),
    },
  };
}

function getInitialSummaryProfile(period: Period): { lead_conversion_rate: number; avg_basket: number } {
  const cachedSummary = parseCachedSummarySnapshot(readUiCacheValue(summarySessionKey(period)));
  return {
    lead_conversion_rate: safeNum(cachedSummary?.profile?.lead_conversion_rate),
    avg_basket: safeNum(cachedSummary?.profile?.avg_basket),
  };
}

function getInitialSummaryEstimatedByCube(period: Period): Record<CubeKey, number> {
  const cachedSummary = parseCachedSummarySnapshot(readUiCacheValue(summarySessionKey(period)));
  return {
    site_inrcy: safeNum(cachedSummary?.estimatedByCube?.site_inrcy),
    site_web: safeNum(cachedSummary?.estimatedByCube?.site_web),
    gmb: safeNum(cachedSummary?.estimatedByCube?.gmb),
    facebook: safeNum(cachedSummary?.estimatedByCube?.facebook),
    instagram: safeNum(cachedSummary?.estimatedByCube?.instagram),
    linkedin: safeNum(cachedSummary?.estimatedByCube?.linkedin),
  };
}

function hasInitialSummarySnapshot(period: Period) {
  return !!parseCachedSummarySnapshot(readUiCacheValue(summarySessionKey(period)));
}

function gmbMetricSeriesTotal(metrics: any, metricNames: string[]) {
  const rawSeries = Array.isArray(metrics?.raw?.multiDailyMetricTimeSeries)
    ? metrics.raw.multiDailyMetricTimeSeries
    : Array.isArray(metrics?.multiDailyMetricTimeSeries)
      ? metrics.multiDailyMetricTimeSeries
      : [];
  return rawSeries.reduce((sum: number, series: any) => {
    if (!metricNames.includes(String(series?.dailyMetric || ""))) return sum;
    const datedValues = Array.isArray(series?.timeSeries?.datedValues) ? series.timeSeries.datedValues : [];
    return sum + datedValues.reduce((inner: number, dv: any) => inner + safeNum(dv?.value?.value ?? dv?.value), 0);
  }, 0);
}

function getGmbTotals(metrics: any) {
  const totals = metrics?.totals || {};
  const impressions =
    safeNum(totals.impressions) ||
    safeNum(totals.BUSINESS_IMPRESSIONS) ||
    safeNum(totals.BUSINESS_IMPRESSIONS_DESKTOP_MAPS) +
      safeNum(totals.BUSINESS_IMPRESSIONS_MOBILE_MAPS) +
      safeNum(totals.BUSINESS_IMPRESSIONS_DESKTOP_SEARCH) +
      safeNum(totals.BUSINESS_IMPRESSIONS_MOBILE_SEARCH) ||
    gmbMetricSeriesTotal(metrics, [
      "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
      "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
      "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
      "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
    ]);

  const websiteClicks =
    safeNum(totals.websiteClicks) ||
    safeNum(totals.website_clicks) ||
    safeNum(totals.WEBSITE_CLICKS) ||
    gmbMetricSeriesTotal(metrics, ["WEBSITE_CLICKS"]);

  const callClicks =
    safeNum(totals.callClicks) ||
    safeNum(totals.call_clicks) ||
    safeNum(totals.CALL_CLICKS) ||
    gmbMetricSeriesTotal(metrics, ["CALL_CLICKS"]);

  const directionRequests =
    safeNum(totals.directionRequests) ||
    safeNum(totals.direction_requests) ||
    safeNum(totals.DIRECTION_REQUESTS) ||
    gmbMetricSeriesTotal(metrics, ["DIRECTION_REQUESTS", "BUSINESS_DIRECTION_REQUESTS"]);

  const mapsImpressions =
    safeNum(totals.BUSINESS_IMPRESSIONS_DESKTOP_MAPS) +
    safeNum(totals.BUSINESS_IMPRESSIONS_MOBILE_MAPS) ||
    gmbMetricSeriesTotal(metrics, ["BUSINESS_IMPRESSIONS_DESKTOP_MAPS", "BUSINESS_IMPRESSIONS_MOBILE_MAPS"]);

  const searchImpressions =
    safeNum(totals.BUSINESS_IMPRESSIONS_DESKTOP_SEARCH) +
    safeNum(totals.BUSINESS_IMPRESSIONS_MOBILE_SEARCH) ||
    gmbMetricSeriesTotal(metrics, ["BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", "BUSINESS_IMPRESSIONS_MOBILE_SEARCH"]);

  return { impressions, websiteClicks, callClicks, directionRequests, mapsImpressions, searchImpressions };
}

type GscOpportunitySectorConfig = {
  impressionRef: number;
  clickRef: number;
  intentRef: number;
  ctrTarget: number;
  bonusWeight: number;
  directIntentFactor: number;
  visibilityWeight: number;
  trafficWeight: number;
  intentWeight: number;
  ctrWeight: number;
  minImpressionsForCtr: number;
};

const DEFAULT_GSC_OPPORTUNITY_CONFIG: GscOpportunitySectorConfig = {
  impressionRef: 120, clickRef: 8, intentRef: 3, ctrTarget: 0.05, bonusWeight: 0.35, directIntentFactor: 0.10,
  visibilityWeight: 0.20, trafficWeight: 0.20, intentWeight: 0.40, ctrWeight: 0.20, minImpressionsForCtr: 150,
};
const GSC_OPPORTUNITY_CONFIG_BY_SECTOR: Record<string, Partial<GscOpportunitySectorConfig>> = {
  artisan_btp: { impressionRef: 80, clickRef: 5, intentRef: 1.8, ctrTarget: 0.045, bonusWeight: 0.44, directIntentFactor: 0.16 },
  sante: { impressionRef: 90, clickRef: 5, intentRef: 2, ctrTarget: 0.05, bonusWeight: 0.42, directIntentFactor: 0.15 },
  medecine_douce: { impressionRef: 90, clickRef: 5, intentRef: 2, ctrTarget: 0.048, bonusWeight: 0.41, directIntentFactor: 0.15 },
  immobilier: { impressionRef: 85, clickRef: 5, intentRef: 1.8, ctrTarget: 0.045, bonusWeight: 0.45, directIntentFactor: 0.16 },
  services_particuliers: { impressionRef: 85, clickRef: 5, intentRef: 1.8, ctrTarget: 0.045, bonusWeight: 0.43, directIntentFactor: 0.15 },
  transport: { impressionRef: 85, clickRef: 5, intentRef: 1.8, ctrTarget: 0.045, bonusWeight: 0.43, directIntentFactor: 0.15 },
  juridique: { impressionRef: 75, clickRef: 4, intentRef: 1.5, ctrTarget: 0.05, bonusWeight: 0.46, directIntentFactor: 0.17 },
  finance: { impressionRef: 75, clickRef: 4, intentRef: 1.5, ctrTarget: 0.05, bonusWeight: 0.45, directIntentFactor: 0.16 },
  hotel_restaurant: { impressionRef: 140, clickRef: 10, intentRef: 3.5, ctrTarget: 0.04, bonusWeight: 0.32, directIntentFactor: 0.09 },
  commerce_boutique: { impressionRef: 130, clickRef: 9, intentRef: 3.2, ctrTarget: 0.04, bonusWeight: 0.31, directIntentFactor: 0.09 },
  automobile: { impressionRef: 100, clickRef: 6, intentRef: 2.2, ctrTarget: 0.045, bonusWeight: 0.39, directIntentFactor: 0.13 },
  communication: { impressionRef: 160, clickRef: 12, intentRef: 4, ctrTarget: 0.035, bonusWeight: 0.28, directIntentFactor: 0.08 },
  services_entreprises: { impressionRef: 140, clickRef: 10, intentRef: 3.5, ctrTarget: 0.038, bonusWeight: 0.30, directIntentFactor: 0.09 },
  evenementiel: { impressionRef: 130, clickRef: 9, intentRef: 3, ctrTarget: 0.04, bonusWeight: 0.34, directIntentFactor: 0.11 },
  animalier: { impressionRef: 105, clickRef: 6, intentRef: 2.2, ctrTarget: 0.045, bonusWeight: 0.38, directIntentFactor: 0.12 },
  autre: { impressionRef: 110, clickRef: 7, intentRef: 2.6, ctrTarget: 0.045, bonusWeight: 0.35, directIntentFactor: 0.10 },
};
function getGscOpportunityConfig(sectorCategory?: string | null): GscOpportunitySectorConfig {
  const overrides = GSC_OPPORTUNITY_CONFIG_BY_SECTOR[String(sectorCategory || '').trim()] || {};
  return { ...DEFAULT_GSC_OPPORTUNITY_CONFIG, ...overrides };
}

function normalizeRange(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return 0;
  if (max <= min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}

// --- Business signals (web) ---

const INTENT_PATTERNS: RegExp[] = [
  /\bdevis\b/i,
  /\bprix\b/i,
  /\btarif\b/i,
  /\burgen/i,
  /\b24\/?24\b/i,
  /\bcontact\b/i,
  /\brdv\b/i,
  /\brendez[- ]?vous\b/i,
  /\bprès de moi\b/i,
  /\bpres de moi\b/i,
  /\bnear me\b/i,
];

function isIntentQuery(q: string) {
  return INTENT_PATTERNS.some((re) => re.test(q));
}

function pageKind(path: string): "contact" | "pricing" | "service" | "other" {
  const p = (path || "").toLowerCase();
  if (/(contact|devis|rdv|rendez|reservation|telephone|t[ée]l[ée]phone)/.test(p)) return "contact";
  if (/(tarif|prix|pricing)/.test(p)) return "pricing";
  if (/(service|services|prestation|prestations|depannage|intervention|urgence)/.test(p)) return "service";
  return "other";
}

function mapChannelBucket(ch: string): "google" | "direct" | "social" | "other" {
  const c = (ch || "").toLowerCase();
  if (c.includes("organic search") || c.includes("paid search") || c.includes("cross-network") || c.includes("google")) {
    return "google";
  }
  if (c.includes("direct")) return "direct";
  if (c.includes("social")) return "social";
  return "other";
}

function engagementScore100(t: Overview["totals"]) {
  // Stable, explainable score.
  const engagementRate = safeNum(t.engagementRate, 0);
  const sessions = Math.max(0, safeNum(t.sessions, 0));
  const pageviews = Math.max(0, safeNum(t.pageviews, 0));
  const pps = sessions > 0 ? pageviews / sessions : 0;
  const duration = safeNum(t.avgSessionDuration, 0);

  const s1 = normalizeRange(engagementRate, 0.20, 0.78);
  const s2 = normalizeRange(pps, 1.1, 4.0);
  const s3 = normalizeRange(duration, 35, 210);

  const raw = (s1 * 0.5 + s2 * 0.3 + s3 * 0.2) * 100;
  return Math.max(15, Math.min(95, Math.round(raw)));
}

function qualityLabel(score: number) {
  if (score >= 80) return { label: "Excellent", tone: "excellent" as const };
  if (score >= 65) return { label: "Solide", tone: "solid" as const };
  if (score >= 45) return { label: "Correct", tone: "ok" as const };
  return { label: "À améliorer", tone: "low" as const };
}

function computeOpportunityPerDayWeb(ov: Overview) {
  const baseDays = Math.max(1, safeNum(ov.days, 30));
  const t = ov.totals || ({} as any);
  const sessions = safeNum(t.sessions);
  const clicks = safeNum(t.clicks);
  const impressions = safeNum(t.impressions);
  const ctr = clamp(safeNum(t.ctr, 0), 0, 1);
  const engagementRate = clamp(safeNum(t.engagementRate, 0.45), 0, 1);
  const avgSessionDurationSec = clamp(safeNum(t.avgSessionDuration, 110), 10, 600);

  const channels = Array.isArray(ov.channels) ? ov.channels : [];
  const direct = channels.find((c) => (c?.channel || "").toLowerCase().includes("direct"));
  const directShare = sessions > 0 ? clamp(safeNum(direct?.sessions) / sessions, 0, 1) : 0;

  const topQueries = Array.isArray(ov.topQueries) ? ov.topQueries : [];
  const intentClicks = topQueries.filter((q) => isIntentQuery(q.query)).reduce((s, q) => s + safeNum(q.clicks), 0);

  const topPages = Array.isArray(ov.topPages) ? ov.topPages : [];
  const contactViews = topPages.filter((p) => pageKind(p.path) === "contact").reduce((s, p) => s + safeNum(p.views), 0);

  const trafficScore = clamp((sessions / baseDays) / 50, 0, 1);
  const intentScore = clamp((intentClicks / baseDays) / 3, 0, 1);
  const durationScore = clamp(avgSessionDurationSec / 180, 0, 1);

  const baseIndex = 0.45 * trafficScore + 0.30 * intentScore + 0.15 * engagementRate + 0.10 * durationScore;

  let rawPerDay =
    ((sessions / baseDays) * 0.08 + (clicks / baseDays) * 0.10 + (intentClicks / baseDays) * 0.32 + (contactViews / baseDays) * 0.05) *
    (0.65 + baseIndex) *
    (0.85 + clamp(directShare / 0.65, 0, 1) * 0.20);

  const gscConnected = !!ov?.sources?.site_inrcy?.connected?.gsc || !!ov?.sources?.site_web?.connected?.gsc;
  if (gscConnected && (impressions > 0 || clicks > 0 || intentClicks > 0)) {
    const cfg = getGscOpportunityConfig(ov.business?.sectorCategory);
    const gscImpressionsPerDay = impressions / baseDays;
    const gscClicksPerDay = clicks / baseDays;
    const gscIntentClicksPerDay = intentClicks / baseDays;
    const visibilityN = logNorm(gscImpressionsPerDay, cfg.impressionRef);
    const trafficN = logNorm(gscClicksPerDay, cfg.clickRef);
    const intentN = logNorm(gscIntentClicksPerDay, cfg.intentRef);
    const ctrOppN = impressions >= cfg.minImpressionsForCtr ? clamp((cfg.ctrTarget - ctr) / Math.max(0.01, cfg.ctrTarget), 0, 1) : 0;
    const gscBonusIndex =
      cfg.visibilityWeight * visibilityN +
      cfg.trafficWeight * trafficN +
      cfg.intentWeight * intentN +
      cfg.ctrWeight * ctrOppN;
    const gscBasePerDay = 0.10 * visibilityN + 0.12 * trafficN + 0.22 * intentN + 0.08 * ctrOppN;
    rawPerDay = (rawPerDay + gscBasePerDay + gscIntentClicksPerDay * cfg.directIntentFactor) * (1 + gscBonusIndex * cfg.bonusWeight);
  }

  return clamp(rawPerDay, 0, 999);
}

// --- Social opportunity (Facebook / Instagram / LinkedIn) ---
// The first versions of iNrStats used placeholders (+10/+9/+7).
// We now compute a real 30-day projection from the metrics returned by /api/stats/overview.
function safeObj(v: any): Record<string, any> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {};
}

function getTotalMetric(metrics: any, keys: string[]): number {
  const m = safeObj(metrics);
  const totals = safeObj(m.totals);
  for (const k of keys) {
    const n = safeNum((totals as any)[k]);
    if (n) return n;
  }
  return 0;
}

function logNorm(x: number, ref: number) {
  const xx = Math.max(0, x);
  const rr = Math.max(1, ref);
  return clamp(Math.log1p(xx) / Math.log1p(rr), 0, 1);
}

function computeOpportunityPerDaySocial(cubeKey: CubeKey, ov: Overview): number {
  const baseDays = Math.max(1, safeNum(ov.days, 30));
  const node = safeObj((ov as any)?.sources?.[cubeKey]);
  const connected = !!node.connected;
  const m = (node as any).metrics;

  // Disconnected => 0.
  if (!connected) return 0;

  // Cold start: connected but no metrics yet (new account / API limitation).
  // We show a small baseline potential rather than 0.
  const coldStartBaseline = cubeKey === "instagram" ? 0.18 : cubeKey === "linkedin" ? 0.12 : 0.2;
  if (!m || safeObj(m).error) return coldStartBaseline;

  // Metrics are normalized by each connector lib (see lib/facebookInsights.ts, lib/metaInsights.ts, lib/linkedinAnalytics.ts)
  const impressionsTotal =
    getTotalMetric(m, [
      "impressions",
      "post_impressions",
      "postImpressions",
      "post_impressions_sum",
      "IMPRESSIONS",
      "impressionCount",
      "viewerImpressions",
      "reach",
      "REACH",
    ]) || 0;

  const engagementsTotal =
    getTotalMetric(m, [
      "engagements",
      "post_engagements",
      "postEngagements",
      "ENGAGEMENTS",
      "total_engagements",
      "page_engaged_users",
      "post_engaged_users_sum",
      "reactions",
      "comments",
      "shares",
      "likes",
      "saves",
      "replies",
      "video_views",
      "videoViews",
    ]) || 0;

  const ctaClicksTotal =
    getTotalMetric(m, [
      "cta_clicks",
      "ctaClicks",
      "link_clicks",
      "linkClicks",
      "website_clicks",
      "websiteClicks",
      "page_website_clicks_logged_in_unique",
      "CLICK_COUNT",
      "clickCount",
      "clicks",
      "outbound_clicks",
      "outboundClicks",
    ]) || 0;

  const audienceTotal =
    getTotalMetric(m, [
      "followers",
      "follower_count",
      "followers_count",
      "fan_count",
      "fans",
      "fanCount",
      "audience",
      "subscribers",
    ]) || 0;

  const impressionsPerDay = impressionsTotal / baseDays;
  const engagementsPerDay = engagementsTotal / baseDays;
  const ctaClicksPerDay = ctaClicksTotal / baseDays;

  const refs =
    cubeKey === "instagram"
      ? { imp: 2500, eng: 120, cta: 6, aud: 3000 }
      : cubeKey === "linkedin"
        ? { imp: 1200, eng: 45, cta: 3, aud: 2000 }
        : { imp: 3000, eng: 90, cta: 5, aud: 5000 }; // facebook

  const exposureN = logNorm(impressionsPerDay, refs.imp);
  const engagementN = logNorm(engagementsPerDay, refs.eng);
  const intentN = logNorm(ctaClicksPerDay, refs.cta);
  const audienceN = logNorm(audienceTotal, refs.aud);

  // Current (historical) intent proxy in "opportunity units"
  const currentPerDay = clamp(0.02 + 0.2 * intentN + 0.12 * engagementN + 0.06 * exposureN + 0.04 * audienceN, 0, 1.6);

  // Room for improvement based on deficits (Booster/Fidéliser actions)
  const uplift = clamp(0.35 + 0.35 * (1 - intentN) + 0.2 * (1 - exposureN), 0.35, 0.9);

  // Potential: blend history with baseline to avoid 0 on new/low accounts
  const histWeight = clamp(exposureN * 0.7 + intentN * 0.3, 0, 1);
  const base = histWeight * currentPerDay + (1 - histWeight) * coldStartBaseline;
  const potentialPerDay = clamp(base * (1 + uplift), coldStartBaseline, 2.5);

  // Additional opportunities (future), not historical volume
  const additionalPerDay = Math.max(0, potentialPerDay - currentPerDay);
  return clamp(additionalPerDay, 0, 2.5);
}

function computeOpportunity30(cubeKey: CubeKey, ov: Overview) {
  if (cubeKey === "gmb") {
    const connected = !!ov?.sources?.gmb?.connected;
    if (!connected) return 0;

    const m = ov?.sources?.gmb?.metrics;
    const hasError = !!m?.error;
    const { impressions, websiteClicks, callClicks, directionRequests } = getGmbTotals(m);
    const conversations =
      safeNum(m?.totals?.conversations) ||
      safeNum(m?.totals?.BUSINESS_CONVERSATIONS);

    const intentOpportunity =
      websiteClicks * 0.45 +
      callClicks * 0.70 +
      directionRequests * 0.55 +
      conversations * 0.65;
    const visibilityOpportunity = impressions / 450;
    const baseline = hasError || !m ? 2 : 0;

    return Math.max(0, Math.round(clamp(baseline + intentOpportunity + visibilityOpportunity, 0, 80)));
  }
  if (cubeKey === "facebook" || cubeKey === "instagram" || cubeKey === "linkedin") {
    const perDay = computeOpportunityPerDaySocial(cubeKey, ov);
    return Math.max(0, Math.round(perDay * 30));
  }
  // web sites
  const perDay = computeOpportunityPerDayWeb(ov);
  return Math.max(0, Math.round(perDay * 30));
}

function buildProvenance(cubeKey: CubeKey, ov: Overview) {
  if (cubeKey === "gmb") {
    // Try to extract search vs maps impressions from known keys when available.
    const m = ov?.sources?.gmb?.metrics;
    const { mapsImpressions: maps, searchImpressions: search } = getGmbTotals(m);
    const total = maps + search;
    return [
      { label: "Maps", value: total > 0 ? maps : 1, colorVar: "--cGoogle" },
      { label: "Search", value: total > 0 ? search : 1, colorVar: "--cDirect" },
    ];
  }

  if (cubeKey === "facebook") {
    const m = ov?.sources?.facebook?.metrics;
    const audience =
      safeNum(m?.totals?.post_impressions_sum) ||
      safeNum(m?.totals?.fan_count) ||
      safeNum(m?.totals?.followers_count) ||
      safeNum(m?.totals?.page_views_total);
    const interactions =
      safeNum(m?.totals?.page_engaged_users) +
      safeNum(m?.totals?.post_engaged_users_sum) +
      safeNum(m?.totals?.page_website_clicks_logged_in_unique) +
      safeNum(m?.totals?.page_call_phone_clicks_logged_in_unique) +
      safeNum(m?.totals?.page_get_directions_clicks_logged_in_unique);
    const total = audience + interactions;
    return [
      { label: "Audience", value: total > 0 ? audience : 1, colorVar: "--cSocial" },
      { label: "Interactions", value: total > 0 ? interactions : 1, colorVar: "--cGoogle" },
    ];
  }

  if (cubeKey === "instagram") {
    const m = ov?.sources?.instagram?.metrics;
    const audience =
      safeNum(m?.totals?.reach) +
      safeNum(m?.totals?.profile_views) +
      safeNum(m?.totals?.follower_count);
    const engagement =
      safeNum(m?.totals?.website_clicks) +
      safeNum(m?.totals?.phone_call_clicks) +
      safeNum(m?.totals?.email_contacts) +
      safeNum(m?.totals?.text_message_clicks) +
      safeNum(m?.totals?.get_directions_clicks) +
      safeNum(m?.totals?.get_direction_clicks);
    const total = audience + engagement;
    return [
      { label: "Audience", value: total > 0 ? audience : 1, colorVar: "--cSocial" },
      { label: "Engagement", value: total > 0 ? engagement : 1, colorVar: "--cGoogle" },
    ];
  }

  if (cubeKey === "linkedin") {
    const m = ov?.sources?.linkedin?.metrics;
    const impressions =
      safeNum(m?.totals?.impressionCount) +
      safeNum(m?.totals?.uniqueImpressionsCount) +
      safeNum(m?.totals?.pageViews);
    const clicks =
      safeNum(m?.totals?.clickCount) +
      safeNum(m?.totals?.pageClicks);
    const total = impressions + clicks;
    return [
      { label: "Impressions", value: total > 0 ? impressions : 1, colorVar: "--cSocial" },
      { label: "Clics", value: total > 0 ? clicks : 1, colorVar: "--cGoogle" },
    ];
  }

  const buckets = { google: 0, direct: 0, social: 0, other: 0 };
  for (const c of Array.isArray(ov.channels) ? ov.channels : []) {
    const b = mapChannelBucket(c.channel);
    buckets[b] += safeNum(c.sessions);
  }
  return [
    { label: "Google", value: buckets.google, colorVar: "--cGoogle" },
    { label: "Direct", value: buckets.direct, colorVar: "--cDirect" },
    { label: "Social", value: buckets.social, colorVar: "--cSocial" },
    { label: "Autres", value: buckets.other, colorVar: "--cOther" },
  ];
}

function computeQuality(cubeKey: CubeKey, ov: Overview) {
  if (cubeKey === "gmb") {
    const connected = !!ov?.sources?.gmb?.connected;
    if (!connected) return { score: 0, ...qualityLabel(0) };

    const m = ov?.sources?.gmb?.metrics;
    if (m?.error) return { score: 55, ...qualityLabel(55) };
    // Without a reliable time series parser, keep it "correct" by default.
    return { score: 70, ...qualityLabel(70) };
  }

  if (cubeKey === "facebook" || cubeKey === "instagram" || cubeKey === "linkedin") {
    return computeSocialQuality(cubeKey, ov);
  }

  // websites: quality = engagement + structure + intent
  const t = ov.totals || ({} as any);
  const engagement = engagementScore100(t);
  const pages = Array.isArray(ov.topPages) ? ov.topPages : [];
  const queries = Array.isArray(ov.topQueries) ? ov.topQueries : [];

  const hasContact = pages.some((p) => pageKind(p.path) === "contact");
  const hasService = pages.some((p) => pageKind(p.path) === "service");
  const hasPricing = pages.some((p) => pageKind(p.path) === "pricing");

  const intentClicks = queries.filter((q) => isIntentQuery(q.query)).reduce((s, q) => s + safeNum(q.clicks), 0);
  const totalClicks = queries.reduce((s, q) => s + safeNum(q.clicks), 0);
  const intentShare = totalClicks > 0 ? clamp(intentClicks / totalClicks, 0, 1) : 0;

  let score = engagement;
  score += hasContact ? 8 : -6;
  score += hasService ? 6 : -4;
  score += hasPricing ? 4 : 0;
  score += Math.round(intentShare * 10);

  // Natural iNrCy advantage: structure + coherence (not performance).
  if (cubeKey === "site_inrcy") score += 10;

  score = clamp(score, 15, 95);
  return { score, ...qualityLabel(score) };
}


function getSocialMetrics(cubeKey: "facebook" | "instagram" | "linkedin", ov: Overview) {
  const m =
    cubeKey === "facebook"
      ? ov?.sources?.facebook?.metrics
      : cubeKey === "instagram"
        ? ov?.sources?.instagram?.metrics
        : ov?.sources?.linkedin?.metrics;

  const audience =
    cubeKey === "facebook"
      ? safeNum(m?.totals?.fan_count) + safeNum(m?.totals?.followers_count) + safeNum(m?.totals?.post_impressions_sum)
      : cubeKey === "instagram"
        ? safeNum(m?.totals?.follower_count) + safeNum(m?.totals?.reach) + safeNum(m?.totals?.profile_views)
        : safeNum(m?.totals?.followerCount) + safeNum(m?.totals?.pageViews) + safeNum(m?.totals?.uniqueImpressionsCount);

  const engagement =
    cubeKey === "facebook"
      ? safeNum(m?.totals?.page_engaged_users) + safeNum(m?.totals?.post_engaged_users_sum) + safeNum(m?.totals?.reactions) + safeNum(m?.totals?.comments) + safeNum(m?.totals?.shares)
      : cubeKey === "instagram"
        ? safeNum(m?.totals?.likes) + safeNum(m?.totals?.comments) + safeNum(m?.totals?.shares) + safeNum(m?.totals?.replies) + safeNum(m?.totals?.saves)
        : safeNum(m?.totals?.engagementCount) + safeNum(m?.totals?.reactionCount) + safeNum(m?.totals?.commentCount) + safeNum(m?.totals?.shareCount);

  const conversions =
    cubeKey === "facebook"
      ? safeNum(m?.totals?.page_website_clicks_logged_in_unique) + safeNum(m?.totals?.page_call_phone_clicks_logged_in_unique) + safeNum(m?.totals?.page_get_directions_clicks_logged_in_unique)
      : cubeKey === "instagram"
        ? safeNum(m?.totals?.website_clicks) + safeNum(m?.totals?.phone_call_clicks) + safeNum(m?.totals?.email_contacts) + safeNum(m?.totals?.text_message_clicks) + safeNum(m?.totals?.get_directions_clicks) + safeNum(m?.totals?.get_direction_clicks)
        : safeNum(m?.totals?.clickCount) + safeNum(m?.totals?.pageClicks);

  const visibility =
    cubeKey === "facebook"
      ? safeNum(m?.totals?.post_impressions_sum) + safeNum(m?.totals?.page_impressions)
      : cubeKey === "instagram"
        ? safeNum(m?.totals?.impressions) + safeNum(m?.totals?.reach)
        : safeNum(m?.totals?.impressionCount) + safeNum(m?.totals?.uniqueImpressionsCount);

  return { audience, engagement, conversions, visibility };
}

function computeSocialQuality(cubeKey: "facebook" | "instagram" | "linkedin", ov: Overview) {
  const connected =
    cubeKey === "facebook"
      ? !!ov?.sources?.facebook?.connected
      : cubeKey === "instagram"
        ? !!ov?.sources?.instagram?.connected
        : !!ov?.sources?.linkedin?.connected;
  if (!connected) return { score: 0, ...qualityLabel(0) };

  const { audience, engagement, conversions, visibility } = getSocialMetrics(cubeKey, ov);
  const exposureBase =
    cubeKey === "instagram" ? 2500 : cubeKey === "linkedin" ? 1200 : 3000;
  const engagementBase =
    cubeKey === "instagram" ? 120 : cubeKey === "linkedin" ? 45 : 90;
  const conversionBase =
    cubeKey === "instagram" ? 6 : cubeKey === "linkedin" ? 3 : 5;

  const s1 = logNorm(Math.max(visibility, audience), exposureBase);
  const s2 = logNorm(engagement, engagementBase);
  const s3 = logNorm(conversions, conversionBase);

  const score = clamp(Math.round((s1 * 0.35 + s2 * 0.35 + s3 * 0.30) * 100), 18, 92);
  return { score, ...qualityLabel(score) };
}

function getDecisionInput(
  cubeKey: CubeKey,
  ov: Overview,
  qualityScore: number,
  opp30: number,
  provenance: Array<{ label: string; value: number; colorVar: string }>,
) {
  if (cubeKey === "facebook" || cubeKey === "instagram" || cubeKey === "linkedin") {
    const metrics = getSocialMetrics(cubeKey, ov);
    const connected =
      cubeKey === "facebook"
        ? !!ov?.sources?.facebook?.connected
        : cubeKey === "instagram"
          ? !!ov?.sources?.instagram?.connected
          : !!ov?.sources?.linkedin?.connected;

    return {
      channelType: "social" as const,
      channelKey: cubeKey,
      connected,
      opportunities: opp30,
      quality: qualityScore,
      metrics: {
        audience: metrics.audience,
        engagement: metrics.engagement,
        conversions: metrics.conversions,
        visibility: metrics.visibility,
      },
      provenance: provenance.map((entry) => ({ label: entry.label, value: entry.value })),
    };
  }

  if (cubeKey === "gmb") {
    const m = ov?.sources?.gmb?.metrics;
    const { impressions: visibility, websiteClicks, callClicks, directionRequests } = getGmbTotals(m);

    const conversions = websiteClicks + callClicks + directionRequests;

    return {
      channelType: "gmb" as const,
      channelKey: cubeKey,
      connected: !!ov?.sources?.gmb?.connected,
      opportunities: opp30,
      quality: qualityScore,
      metrics: {
        traffic: conversions,
        conversions,
        visibility,
      },
      provenance: provenance.map((entry) => ({ label: entry.label, value: entry.value })),
    };
  }

  const queries = Array.isArray(ov.topQueries) ? ov.topQueries : [];
  const topPages = Array.isArray(ov.topPages) ? ov.topPages : [];
  const intentClicks = queries.filter((q) => isIntentQuery(q.query)).reduce((s, q) => s + safeNum(q.clicks), 0);
  const contactViews = topPages.filter((p) => pageKind(p.path) === "contact").reduce((s, p) => s + safeNum(p.views), 0);
  const traffic = safeNum(ov?.totals?.sessions);
  const visibility = safeNum(ov?.totals?.impressions);
  const engagement = Math.round((safeNum(ov?.totals?.engagementRate) || 0) * 100);

  return {
    channelType: "website" as const,
    channelKey: cubeKey,
    connected: cubeKey === "site_inrcy"
      ? !!ov?.sources?.site_inrcy?.connected?.ga4 || !!ov?.sources?.site_inrcy?.connected?.gsc
      : !!ov?.sources?.site_web?.connected?.ga4 || !!ov?.sources?.site_web?.connected?.gsc,
    opportunities: opp30,
    quality: qualityScore,
    metrics: {
      traffic,
      intent: intentClicks,
      conversions: contactViews,
      engagement,
      visibility,
    },
    provenance: provenance.map((entry) => ({ label: entry.label, value: entry.value })),
  };
}

function actionFromDecision(baseAction: CubeModel["action"], decision: DecisionResult): CubeModel["action"] {
  const map: Record<DecisionResult["action"], CubeModel["action"]> = {
    publier: {
      key: "booster_publier",
      title: "Publier",
      detail: decision.reason,
      href: "/dashboard/booster?action=publish",
      pill: "Booster",
      effort: { level: "faible", label: "Effort faible • 5 min" },
    },
    offrir: {
      key: "booster_promotion",
      title: "Offrir",
      detail: decision.reason,
      href: "/dashboard/booster?action=promo",
      pill: "Booster",
      effort: { level: "moyen", label: "Effort moyen • 15 min" },
    },
    recolter: {
      key: "booster_avis",
      title: "Récolter",
      detail: decision.reason,
      href: "/dashboard/booster?action=reviews",
      pill: "Booster",
      effort: { level: "moyen", label: "Effort moyen • 10 min" },
    },
    informer: {
      key: "fideliser_informer",
      title: "Informer",
      detail: decision.reason,
      href: "/dashboard/fideliser?action=inform",
      pill: "Fidéliser",
      effort: { level: "moyen", label: "Effort moyen • 15 min" },
    },
    suivre: {
      key: "fideliser_remercier",
      title: "Suivre",
      detail: decision.reason,
      href: "/dashboard/fideliser?action=thanks",
      pill: "Fidéliser",
      effort: { level: "faible", label: "Effort faible • 2 min" },
    },
    enqueter: {
      key: "fideliser_satisfaction",
      title: "Enquêter",
      detail: decision.reason,
      href: "/dashboard/fideliser?action=satisfaction",
      pill: "Fidéliser",
      effort: { level: "faible", label: "Effort faible • 3 min" },
    },
  };

  return { ...baseAction, ...map[decision.action] };
}

function recommendAction(cubeKey: CubeKey, ov: Overview, qualityScore: number): CubeModel["action"] {
  // Connection states
  
if (cubeKey === "site_inrcy") {
  const ownership = ov?.inrcySiteOwnership;
  const c = ov?.sources?.site_inrcy?.connected;

  if (ownership === "none") {
    return {
      key: "connect",
      title: "Configurer",
      detail: "Aucun site iNrCy associé pour le moment.",
      href: "/dashboard?panel=site_inrcy",
      pill: "Connexion",
    };
  }

  // Site iNrCy : on gère maintenant GA4 et GSC séparément dans iNrStats,
  // exactement comme pour Site Web, quel que soit le mode de propriété.
  if (!c?.ga4) {
    return {
      key: "connect",
      title: "Connecter GA4",
      detail: "Pour analyser vos visiteurs et leur comportement.",
      href: "/dashboard?panel=site_inrcy",
      pill: "Connexion",
    };
  }
  if (!c?.gsc) {
    return {
      key: "connect",
      title: "Connecter Google Search Console",
      detail: "Pour lire les intentions de recherche (mots-clés).",
      href: "/dashboard?panel=site_inrcy",
      pill: "Connexion",
    };
  }
}

if (cubeKey === "site_web") {
    const c = ov?.sources?.site_web?.connected;
    if (!c?.ga4) {
      return {
        key: "connect",
        title: "Connecter GA4",
        detail: "Pour analyser vos visiteurs et leur comportement.",
        href: "/dashboard?panel=site_web",
        pill: "Connexion",
      };
    }
    if (!c?.gsc) {
      return {
        key: "connect",
        title: "Connecter Google Search Console",
        detail: "Pour lire les intentions de recherche (mots-clés).",
        href: "/dashboard?panel=site_web",
        pill: "Connexion",
      };
    }
  }

  if (cubeKey === "gmb") {
    if (!ov?.sources?.gmb?.connected) {
      return {
        key: "connect",
        title: "Connecter Google Business",
        detail: "Pour capter les demandes locales (appels, itinéraires, clics site).",
        href: "/dashboard?panel=gmb",
        pill: "Connexion",
      };
    }
  }

  if (cubeKey === "facebook") {
    if (!ov?.sources?.facebook?.connected) {
      return {
        key: "connect",
        title: "Connecter Facebook",
        detail: "Pour activer la visibilité sociale et la communauté.",
        href: "/dashboard?panel=facebook",
        pill: "Connexion",
      };
    }
  }

  if (cubeKey === "instagram") {
    if (!ov?.sources?.instagram?.connected) {
      return {
        key: "connect",
        title: "Connecter Instagram",
        detail: "Pour activer la visibilité de votre marque.",
        href: "/dashboard?panel=instagram",
        pill: "Connexion",
      };
    }
  }

  if (cubeKey === "linkedin") {
    if (!ov?.sources?.linkedin?.connected) {
      return {
        key: "connect",
        title: "Connecter LinkedIn",
        detail: "Pour activer la crédibilité.",
        href: "/dashboard?panel=linkedin",
        pill: "Connexion",
      };
    }
  }

  const effortMap: Partial<Record<ActionKey, CubeModel["action"]["effort"] | undefined>> = {
    booster_publier: { level: "faible", label: "Effort faible • 5 min" },
    booster_avis: { level: "moyen", label: "Effort moyen • 10 min" },
    booster_promotion: { level: "moyen", label: "Effort moyen • 15 min" },
    fideliser_informer: { level: "moyen", label: "Effort moyen • 15 min" },
    fideliser_satisfaction: { level: "faible", label: "Effort faible • 3 min" },
    fideliser_remercier: { level: "faible", label: "Effort faible • 2 min" },
    connect: undefined,
    loading: undefined,
  };

  const attachEffort = (a: CubeModel["action"]): CubeModel["action"] => {
    if (a.key === "connect") return a;
    return { ...a, effort: effortMap[a.key] };
  };

  // Business-based rules (Booster/Fidéliser)
  const opp30 = computeOpportunity30(cubeKey, ov);

  if (cubeKey === "site_inrcy") {
    // iNrCy: default to fidéliser when quality is good.
    if (qualityScore >= 70) {
      return attachEffort({
        key: "fideliser_remercier",
        title: "Suivre",
        detail: "Convertissez vos clients satisfaits en recommandations et avis.",
        href: "/dashboard/fideliser?action=thanks",
        pill: "Fidéliser",
      });
    }
    // If quality is lower, we boost basics.
    return attachEffort({
      key: "booster_promotion",
      title: "Offrir",
      detail: "Mettez en avant une offre / un message clair pour déclencher le contact.",
      href: "/dashboard/booster?action=promo",
      pill: "Booster",
    });
  }

  if (cubeKey === "site_web") {
    // Site pro : booster d'abord.
    if (qualityScore < 60) {
      return attachEffort({
        key: "booster_promotion",
        title: "Offrir",
        detail: "Ajoutez/optimisez un déclencheur (devis, urgence, appel à l’action).",
        href: "/dashboard/booster?action=promo",
        pill: "Booster",
      });
    }
    // If the site is already solid, fidéliser.
    if (qualityScore >= 75 && opp30 > 4) {
      return attachEffort({
        key: "fideliser_informer",
        title: "Informer",
        detail: "Créez un lien régulier (conseils, prévention, actu).",
        href: "/dashboard/fideliser?action=inform",
        pill: "Fidéliser",
      });
    }
    return attachEffort({
      key: "booster_publier",
      title: "Publier",
      detail: "Ajoutez une actualité locale pour relancer la visibilité et le trafic.",
      href: "/dashboard/booster?action=publish",
      pill: "Booster",
    });
  }

  if (cubeKey === "gmb") {
    const m = ov?.sources?.gmb?.metrics;
    const hasError = !!m?.error;
    if (hasError) {
      return attachEffort({
        key: "booster_publier",
        title: "Publier",
        detail: "Publiez 1 post Google Business pour activer le canal (même sans métriques détaillées).",
        href: "/dashboard/booster?action=publish",
        pill: "Booster",
      });
    }
    return attachEffort({
      key: "booster_avis",
      title: "Récolter",
      detail: "Les avis sont le levier n°1 pour gagner des appels locaux.",
      href: "/dashboard/booster?action=reviews",
      pill: "Booster",
    });
  }

  // Social channels (Facebook / Instagram / LinkedIn)
  const socialLabel = cubeKey === "linkedin" ? "votre audience pro" : "votre audience";
  return attachEffort({
    key: "booster_publier",
    title: "Publier",
    detail: `1 publication simple/semaine suffit pour capter ${socialLabel}.`,
    href: "/dashboard/booster?action=publish",
    pill: "Booster",
  });
}

function buildInsights(cubeKey: CubeKey, ov: Overview, qualityScore: number, decision?: DecisionResult) {
  const insights: string[] = [];

  if (decision?.businessLecture?.length) {
    return decision.businessLecture.slice(0, 4);
  }

  if (cubeKey === "facebook") {
    if (!ov?.sources?.facebook?.connected) {
      return ["Canal non connecté : aucune lecture possible.", "Connectez Facebook pour activer la visibilité sociale."];
    }
    return ["Canal social prêt à être activé.", "Misez sur la régularité plutôt que sur le volume."];
  }

  if (cubeKey === "gmb") {
    if (!ov?.sources?.gmb?.connected) {
      return ["Canal local non connecté.", "Google Business est souvent le meilleur levier d’appels locaux."];
    }
    if (ov?.sources?.gmb?.metrics?.error) {
      return ["Connexion OK, métriques détaillées indisponibles.", "On peut quand même agir : posts + avis."];
    }
    return ["Présence locale active.", "Les avis + des posts réguliers maximisent les demandes."];
  }

  // websites
  const t = ov.totals || ({} as any);
  const sessions = safeNum(t.sessions);
  const engagement = safeNum(t.engagementRate, 0);
  const queries = Array.isArray(ov.topQueries) ? ov.topQueries : [];
  const intentClicks = queries.filter((q) => isIntentQuery(q.query)).reduce((s, q) => s + safeNum(q.clicks), 0);
  const anyIntent = intentClicks > 0;

  if (sessions <= 20) insights.push("Trafic faible sur la période : opportunité d’activation rapide.");
  else insights.push("Trafic présent : on peut optimiser la conversion.");

  if (anyIntent) insights.push("Des recherches à intention business existent (devis, urgence, prix…).");
  else insights.push("Peu d’intention business détectée : il faut clarifier l’offre et la zone.");

  if (qualityScore >= 75) insights.push("Structure solide : vous êtes prêt à capter des demandes.");
  else if (qualityScore >= 55) insights.push("Structure correcte : quelques ajustements peuvent booster les demandes.");
  else insights.push("Structure à renforcer : il manque des déclencheurs de contact.");

  // Keep it short (2–3 max)
  return insights.slice(0, 3);
}

function Donut({ segments }: { segments: Array<{ label: string; value: number; colorVar: string }> }) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const bg = useMemo(() => {
    if (total <= 0) return "conic-gradient(rgba(255,255,255,.10) 0deg 360deg)";
    let cur = 0;
    const parts = segments
      .filter((s) => s.value > 0)
      .map((s) => {
        const a0 = (cur / total) * 360;
        cur += s.value;
        const a1 = (cur / total) * 360;
        return `var(${s.colorVar}) ${a0.toFixed(2)}deg ${a1.toFixed(2)}deg`;
      });
    return `conic-gradient(${parts.join(", ")})`;
  }, [segments, total]);

  return (
    <div className={styles.donutWrap}>
      <div className={styles.donut} style={{ background: bg }} aria-hidden>
        <div className={styles.donutHole} />
      </div>
      <div className={styles.legend}>
        {segments.map((s) => {
          const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
          return (
            <div key={s.label} className={styles.legendRow}>
              <span className={styles.legendDot} style={{ background: `var(${s.colorVar})` }} aria-hidden />
              <span className={styles.legendLabel}>{s.label}</span>
              <span className={styles.legendVal}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RingScore({ value, tone }: { value: number; tone: "low" | "ok" | "solid" | "excellent" }) {
  const deg = Math.round(clamp(value / 100, 0, 1) * 360);
  return (
    <div className={`${styles.ring} ${styles[`ring_${tone}`]}`} style={{ ["--deg" as any]: `${deg}deg` }}>
      <div className={styles.ringInner}>
        <div className={styles.ringValue}>{value}</div>
        <div className={styles.ringSub}>/100</div>
      </div>
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`${styles.pill} ${ok ? styles.pillOn : styles.pillOff}`}>{label}</span>;
}

function PeriodSelect({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <select className={styles.period} value={value} onChange={(e) => onChange(Number(e.target.value) as Period)}>
      {PERIODS.map((p) => (
        <option key={p} value={p}>
          Passif {p}j
        </option>
      ))}
    </select>
  );
}

export default function StatsClient() {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null);

  const inrcyRef = useRef<HTMLDivElement | null>(null);
  const webRef = useRef<HTMLDivElement | null>(null);
  const gmbRef = useRef<HTMLDivElement | null>(null);
  const fbRef = useRef<HTMLDivElement | null>(null);
  const igRef = useRef<HTMLDivElement | null>(null);
  const liRef = useRef<HTMLDivElement | null>(null);

  const scrollTo = (key: CubeKey) => {
    const map = {
      site_inrcy: inrcyRef,
      site_web: webRef,
      gmb: gmbRef,
      facebook: fbRef,
      instagram: igRef,
      linkedin: liRef,
    } as const;

    map[key].current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ✅ Période globale (7j / 30j) pour éviter un mix incohérent entre blocs.
  const period: Period = 30;

  const [dataByCube, setDataByCube] = useState<Record<CubeKey, { ov: Overview | null; loading: boolean; error?: string }>>(emptyCubeState);

  const [summaryOpp, setSummaryOpp] = useState<{ loading: boolean; total: number; byCube: Record<CubeKey, number> }>({
    loading: true,
    total: 0,
    byCube: { site_inrcy: 0, site_web: 0, gmb: 0, facebook: 0, instagram: 0, linkedin: 0 },
  });
  const [summaryProfile, setSummaryProfile] = useState<{ lead_conversion_rate: number; avg_basket: number }>({ lead_conversion_rate: 0, avg_basket: 0 });
  const [summaryEstimatedByCube, setSummaryEstimatedByCube] = useState<Record<CubeKey, number>>({
    site_inrcy: 0,
    site_web: 0,
    gmb: 0,
    facebook: 0,
    instagram: 0,
    linkedin: 0,
  });
  const [summaryHydrated, setSummaryHydrated] = useState(false);
  const [summaryActionsOpen, setSummaryActionsOpen] = useState(false);
  const [dailyBootReady, setDailyBootReady] = useState(false);

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

    if (cachedCube?.overviews) {
      periodCacheRef.current.set(period, cachedCube.overviews);
      setDataByCube((prev) => {
        const next: typeof prev = { ...prev };
        for (const k of Object.keys(cachedCube.overviews) as CubeKey[]) {
          next[k] = { ov: cachedCube.overviews[k] ?? null, loading: false, error: undefined };
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
      writeUiCacheValue(cubeSessionKey(targetPeriod), JSON.stringify({ syncedAt, snapshotDate: next.snapshotDate, overviews: snap }));
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
    } catch {
      // ignore
    }

    if (targetPeriod !== period) return;

    setDataByCube((prev) => {
      const updated: any = { ...prev };
      for (const k of Object.keys(snap) as CubeKey[]) {
        updated[k] = { ov: snap[k] ?? null, loading: false, error: undefined };
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

    for (const [periodKey, payload] of Object.entries(bootstrap.inrstats || {})) {
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
        },
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
  }, [applyBulkPayload, refreshChannelFromApi]);

  const handleSharedStatsRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setLastRefreshAt(Date.now());

    try {
      const bootstrap = await runDailyStatsRefreshBootstrap();
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
    const summaryFresh = !!cachedSummary && cachedSummary.syncedAt >= lastChannelSyncAt && cachedSummary.snapshotDate === expectedSnapshotDate;
    if (!cubeFresh || !summaryFresh) return false;

    periodCacheRef.current.set(targetPeriod, cachedCube.overviews);
    setDataByCube((prev) => {
      const next: any = { ...prev };
      for (const k of Object.keys(cachedCube.overviews) as CubeKey[]) {
        next[k] = { ov: (cachedCube.overviews as any)[k], loading: false, error: undefined };
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
      } as Record<CubeKey, number>,
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
  const keys: CubeKey[] = ["site_inrcy", "site_web", "gmb", "facebook", "instagram", "linkedin"];

  (async () => {
    // Fast path: cached data for this period
    const cached = periodCacheRef.current.get(period);
    const lastChannelSyncAt = getStatsLastChannelSyncAt();
    const cachedSummary = parseCachedSummarySnapshot(readUiCacheValue(summarySessionKey(period)));
    const hasFreshCachedSummary = !!cachedSummary && cachedSummary.syncedAt >= lastChannelSyncAt && cachedSummary.snapshotDate === expectedUiSnapshotDate();
    if (cached && hasFreshCachedSummary) {
      setDataByCube((prev) => {
        const next: any = { ...prev };
        for (const k of Object.keys(cached) as CubeKey[]) {
          next[k] = { ov: (cached as any)[k], loading: false, error: undefined };
        }
        return next;
      });
      return;
    }
    if (hydrateFromSessionCache(period)) {
      return;
    }
    if (cached && cachedSummary) {
      setDataByCube((prev) => {
        const next: any = { ...prev };
        for (const k of Object.keys(cached) as CubeKey[]) {
          next[k] = { ov: (cached as any)[k], loading: false, error: undefined };
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
    const handleChannelUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ channel?: DashboardChannelKey }>).detail;
      if (!isDashboardChannelKey(detail?.channel)) {
        triggerRefresh("channels");
        return;
      }
      if (hydrateFromSessionCache(period)) {
        const now = Date.now();
        setLastRefreshAt(now);
        setIsRefreshing(false);
        return;
      }
      triggerRefresh("channels");
    };

    const handleChannelsUpdated = () => {
      const now = Date.now();
      if (now - lastAutoRefreshAtRef.current < 1500) return;
      lastAutoRefreshAtRef.current = now;
      if (hydrateFromSessionCache(period)) {
        setLastRefreshAt(now);
        setIsRefreshing(false);
        return;
      }
      triggerRefresh("channels");
    };

    window.addEventListener("inrcy:channel-updated", handleChannelUpdated as EventListener);
    window.addEventListener("inrcy:channels-updated", handleChannelsUpdated as EventListener);
    return () => {
      window.removeEventListener("inrcy:channel-updated", handleChannelUpdated as EventListener);
      window.removeEventListener("inrcy:channels-updated", handleChannelsUpdated as EventListener);
    };
  }, [hydrateFromSessionCache, period, triggerRefresh]);

  useEffect(() => {
    const handleProfileVersionChange = (event: Event) => {
      const detail = (event as CustomEvent<ProfileVersionChangeDetail>).detail;
      if (detail?.field !== "stats_version") return;
      triggerRefresh("channels");
    };

    window.addEventListener(PROFILE_VERSION_EVENT, handleProfileVersionChange as EventListener);
    return () => {
      window.removeEventListener(PROFILE_VERSION_EVENT, handleProfileVersionChange as EventListener);
    };
  }, [triggerRefresh]);

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


  const models: CubeModel[] = useMemo(() => {
    const build = (key: CubeKey, title: string, subtitle: string): CubeModel => {
      const periodForModel = period;
      const state = dataByCube[key];
      const hasRealOverview = !!state.ov;
      const ov = state.ov ||
        ({
          days: periodForModel,
          totals: { users: 0, sessions: 0, pageviews: 0, engagementRate: 0, avgSessionDuration: 0, clicks: 0, impressions: 0, ctr: 0 },
          topPages: [],
          channels: [],
          topQueries: [],
          sources: {
            site_inrcy: { connected: { ga4: false, gsc: false } },
            site_web: { connected: { ga4: false, gsc: false } },
            gmb: { connected: false, metrics: null },
            facebook: { connected: false },
            instagram: { connected: false },
            linkedin: { connected: false },
          },
        } as Overview);

      const accountLabel = String(ov?.identities?.[key]?.label || ov?.identities?.[key]?.url || "").trim();
      const inrcyOwnership = (ov as any)?.inrcySiteOwnership;
const inrcyDisconnected = inrcyOwnership === "none";

const connections =
  key === "site_inrcy"
    ? inrcyDisconnected
      ? { ga4: false, gsc: false }
      : { ga4: !!ov.sources?.site_inrcy?.connected?.ga4, gsc: !!ov.sources?.site_inrcy?.connected?.gsc }
    : key === "site_web"
      ? { ga4: !!ov.sources?.site_web?.connected?.ga4, gsc: !!ov.sources?.site_web?.connected?.gsc }
      : key === "gmb"
        ? { main: !!ov.sources?.gmb?.connected }
        : key === "facebook"
          ? { main: !!ov.sources?.facebook?.connected }
          : key === "instagram"
            ? { main: !!ov.sources?.instagram?.connected }
            : { main: !!ov.sources?.linkedin?.connected };

const provenance = buildProvenance(key, ov);
      const opp30 = summaryOpp.byCube[key] ?? computeOpportunity30(key, ov);

      const q = computeQuality(key, ov);
      let action = recommendAction(key, ov, q.score);
      let decision: DecisionResult | undefined;

      if (action.key !== "connect" && action.key !== "loading") {
        decision = decideAction(getDecisionInput(key, ov, q.score, opp30, provenance));
        action = actionFromDecision(action, decision);
      }

      const insights = buildInsights(key, ov, q.score, decision);

      // Pendant le chargement initial (aucun overview réel), on affiche un CTA neutre.
      if (state.loading && !hasRealOverview) {
        action = {
          key: "loading",
          title: "Connexion…",
          detail: "Récupération de vos connexions",
          href: "",
          pill: "Connexion",
        };
      }

      const opportunityLabel =
        opp30 >= 14 ? "Fort potentiel" : opp30 >= 7 ? "Potentiel réel" : opp30 >= 3 ? "Potentiel modéré" : "À activer";

      return {
        key,
        inrcyOwnership: key === "site_inrcy" ? (inrcyOwnership as any) : undefined,
        title,
        subtitle,
        accountLabel: accountLabel || undefined,
        period: periodForModel,
        loading: !!state.loading,
        error: state.error,
        connections,
        provenance,
        opportunity30: opp30,
        opportunityLabel,
        qualityScore: q.score,
        qualityLabel: q.label,
        qualityTone: q.tone,
        insights,
        action,
      };
    };

    return [
      build("site_inrcy", "Site iNrCy", "Optimisé pour convertir"),
      build("site_web", "Site Web", "Votre image"),
      build("gmb", "Google Business", "Visibilité locale"),
      build("facebook", "Facebook", "Visibilité sociale"),
      build("instagram", "Instagram", "Visibilité de marque"),
      build("linkedin", "LinkedIn", "Visibilité professionnelle"),
    ];
  }, [dataByCube, period, summaryOpp.byCube]);

  const centralPotential30 = summaryOpp.total;
  const centralByCube = summaryOpp.byCube;
  const summaryDisplayReady = summaryHydrated;

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
    };
  }, [centralByCube, summaryProfile.avg_basket, summaryProfile.lead_conversion_rate]);

  const summaryActionItems = useMemo(() => {
    const connectionStateByCube: Record<CubeKey, boolean> = {
      site_inrcy: !!models.find((m) => m.key === "site_inrcy")?.connections.ga4 || !!models.find((m) => m.key === "site_inrcy")?.connections.gsc,
      site_web: !!models.find((m) => m.key === "site_web")?.connections.ga4 || !!models.find((m) => m.key === "site_web")?.connections.gsc,
      gmb: !!models.find((m) => m.key === "gmb")?.connections.main,
      facebook: !!models.find((m) => m.key === "facebook")?.connections.main,
      instagram: !!models.find((m) => m.key === "instagram")?.connections.main,
      linkedin: !!models.find((m) => m.key === "linkedin")?.connections.main,
    };

    const connectedCopy: Record<CubeKey, { label: string; kicker: string; motive: string; badge: string }> = {
      facebook: {
        label: 'Publier sur Facebook',
        kicker: 'Relancez votre visibilité locale',
        motive: 'Une publication ciblée peut remettre votre activité en mouvement et générer de nouvelles demandes rapidement.',
        badge: 'Booster',
      },
      instagram: {
        label: 'Publier sur Instagram',
        kicker: 'Réactivez votre visibilité de marque',
        motive: 'Du contenu récent et régulier peut transformer plus d’attention en prises de contact concrètes.',
        badge: 'Booster',
      },
      linkedin: {
        label: 'Publier sur LinkedIn',
        kicker: 'Renforcez votre crédibilité pro',
        motive: 'Une prise de parole visible peut faire émerger de nouvelles opportunités professionnelles.',
        badge: 'Publier',
      },
      site_web: {
        label: 'Optimiser votre site',
        kicker: 'Transformez plus de visiteurs en prospects',
        motive: 'Quelques ajustements ciblés peuvent augmenter le rendement commercial de votre site rapidement.',
        badge: 'Fidéliser',
      },
      site_inrcy: {
        label: 'Optimiser votre site iNrCy',
        kicker: 'Accélérez une machine déjà lancée',
        motive: 'Votre générateur tourne déjà : quelques optimisations peuvent faire monter le chiffre plus vite.',
        badge: 'Fidéliser',
      },
      gmb: {
        label: 'Optimiser Google Business',
        kicker: 'Débloquez un potentiel local immédiat',
        motive: 'Votre fiche locale peut capter plus d’appels, de clics et d’itinéraires avec quelques actions ciblées.',
        badge: 'Booster',
      },
    };

    const disconnectedCopy: Record<CubeKey, { label: string; kicker: string; motive: string; badge: string }> = {
      facebook: {
        label: 'Connecter Facebook',
        kicker: 'Activez un levier social local',
        motive: 'Reliez Facebook pour mesurer votre visibilité sociale et capter plus de demandes locales.',
        badge: 'Connexion',
      },
      instagram: {
        label: 'Connecter Instagram',
        kicker: 'Activez votre vitrine de marque',
        motive: 'Reliez Instagram pour exploiter votre visibilité et transformer plus d’attention en opportunités.',
        badge: 'Connexion',
      },
      linkedin: {
        label: 'Connecter LinkedIn',
        kicker: 'Activez votre crédibilité professionnelle',
        motive: 'Reliez LinkedIn pour publier facilement et préparer le suivi analytics dès que les accès seront disponibles.',
        badge: 'Connexion',
      },
      site_web: {
        label: 'Connecter votre site',
        kicker: 'Mesurez enfin votre rendement web',
        motive: 'Connectez GA4 et GSC pour analyser votre trafic, vos intentions et votre potentiel business.',
        badge: 'Connexion',
      },
      site_inrcy: {
        label: 'Connecter le site iNrCy',
        kicker: 'Branchez votre machine à leads',
        motive: 'Activez les outils de mesure du site iNrCy pour suivre sa performance et ses opportunités.',
        badge: 'Connexion',
      },
      gmb: {
        label: 'Connecter Google Business',
        kicker: 'Débloquez un potentiel local immédiat',
        motive: 'Vous laissez probablement passer des demandes locales : ce canal mérite d’être activé en priorité.',
        badge: 'Connexion',
      },
    };

    const items = [
      { key: 'site_inrcy' as CubeKey, opportunities: centralByCube.site_inrcy, revenue: computedEstimatedByCube.site_inrcy || summaryEstimatedByCube.site_inrcy },
      { key: 'site_web' as CubeKey, opportunities: centralByCube.site_web, revenue: computedEstimatedByCube.site_web || summaryEstimatedByCube.site_web },
      { key: 'gmb' as CubeKey, opportunities: centralByCube.gmb, revenue: computedEstimatedByCube.gmb || summaryEstimatedByCube.gmb },
      { key: 'facebook' as CubeKey, opportunities: centralByCube.facebook, revenue: computedEstimatedByCube.facebook || summaryEstimatedByCube.facebook },
      { key: 'instagram' as CubeKey, opportunities: centralByCube.instagram, revenue: computedEstimatedByCube.instagram || summaryEstimatedByCube.instagram },
      { key: 'linkedin' as CubeKey, opportunities: centralByCube.linkedin, revenue: computedEstimatedByCube.linkedin || summaryEstimatedByCube.linkedin },
    ].map((item) => ({
      ...item,
      ...(connectionStateByCube[item.key] ? connectedCopy[item.key] : disconnectedCopy[item.key]),
      connected: connectionStateByCube[item.key],
    }));

    return items;
  }, [centralByCube, computedEstimatedByCube, models, summaryEstimatedByCube]);

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
              priority
            />
            <div className={`${styles.tagline} ${styles.taglineDesktop}`}>Vos données analysées en mode business.</div>
          </div>

          <div className={styles.headerActions}>
            <div className={styles.headerCloseControls}>
              <HelpButton onClick={() => setHelpOpen(true)} title="Aide iNr’Stats" />
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

      {/* Summary bar (CRM-like) */}
      <div className={styles.summaryBar} aria-label="Récapitulatif iNrStats">
        <div className={styles.summaryMain}>
          <span
            className={styles.summaryValueBubble}
            aria-label={summaryDisplayReady
              ? `+${fmtInt(centralPotential30)} opportunités à activer pour générer + de clients et + de CA potentiel`
              : "Opportunités en cours de chargement"}
          >
            <span className={styles.summaryValue}>{summaryDisplayReady ? `+${fmtInt(centralPotential30)}` : "—"}</span>
          </span>
          <span className={styles.summaryLabel}>opportunités à activer pour générer + de clients et + de CA potentiel</span>
          <span className={styles.summarySub}>projection sur 30 jours si actions menées</span>
        </div>
        <div className={styles.summaryModules}>
          <button type="button" className={styles.summaryItem} onClick={() => scrollTo("site_inrcy")}>
            <span>Site iNrCy</span>
            <b>{summaryDisplayReady ? `+${fmtInt(centralByCube.site_inrcy)}` : "—"}</b>
          </button>
          <button type="button" className={styles.summaryItem} onClick={() => scrollTo("site_web")}>
            <span>Site Web</span>
            <b>{summaryDisplayReady ? `+${fmtInt(centralByCube.site_web)}` : "—"}</b>
          </button>
          <button type="button" className={styles.summaryItem} onClick={() => scrollTo("gmb")}>
            <span>Google Business</span>
            <b>{summaryDisplayReady ? `+${fmtInt(centralByCube.gmb)}` : "—"}</b>
          </button>
          <button type="button" className={styles.summaryItem} onClick={() => scrollTo("facebook")}>
            <span>Facebook</span>
            <b>{summaryDisplayReady ? `+${fmtInt(centralByCube.facebook)}` : "—"}</b>
          </button>
          <button type="button" className={styles.summaryItem} onClick={() => scrollTo("instagram")}>
            <span>Instagram</span>
            <b>{summaryDisplayReady ? `+${fmtInt(centralByCube.instagram)}` : "—"}</b>
          </button>
          <button type="button" className={styles.summaryItem} onClick={() => scrollTo("linkedin")}>
            <span>LinkedIn</span>
            <b>{summaryDisplayReady ? `+${fmtInt(centralByCube.linkedin)}` : "—"}</b>
          </button>
        </div>
        <div className={styles.summaryActionsWrap}>
          <button
            type="button"
            className={styles.summaryActionsToggle}
            onClick={() => setSummaryActionsOpen((prev) => !prev)}
            aria-expanded={summaryActionsOpen}
          >
            {summaryActionsOpen ? "Masquer les actions" : "Voir les actions"}
          </button>

          {summaryActionsOpen ? (
            <div className={styles.summaryActionsPanel}>
              {summaryActionItems.map((item) => (
                <div key={item.key} className={styles.summaryActionItem}>
                  <div className={styles.summaryActionTopRow}>
                    <div className={styles.summaryActionLeft}>
                      <div className={styles.summaryActionBadge}>{item.badge}</div>
                      <div className={styles.summaryActionTitleBlock}>
                        <div className={styles.summaryActionTitleRow}>
                          <span className={styles.summaryActionTitle}>{item.label}</span>
                          {item.opportunities > 0 ? (
                            <span className={styles.summaryActionOpp}>{fmtInt(item.opportunities)} opportunités à capter</span>
                          ) : (
                            <span className={styles.summaryActionOpp}>potentiel non exploité</span>
                          )}
                        </div>
                        <div className={styles.summaryActionKicker}>{item.kicker}</div>
                      </div>
                    </div>
                    {item.opportunities > 0 ? (
                      <div className={styles.summaryActionRevenueBubble}>+{fmtInt(item.revenue)} €</div>
                    ) : (
                      <div className={styles.summaryActionRevenueGhost}>À activer</div>
                    )}
                  </div>
                  <div className={styles.summaryActionMeta}>{item.motive}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.grid}>

        <div ref={inrcyRef}>
          <Cube
            model={models[0]}
            onNavigate={(href) => (href.startsWith("/api/") ? (window.location.href = href) : router.push(href))}
          />
        </div>

        <div ref={webRef}>
          <Cube
            model={models[1]}
            onNavigate={(href) => (href.startsWith("/api/") ? (window.location.href = href) : router.push(href))}
          />
        </div>

        <div ref={gmbRef}>
          <Cube
            model={models[2]}
            onNavigate={(href) => (href.startsWith("/api/") ? (window.location.href = href) : router.push(href))}
          />
        </div>

        <div ref={fbRef}>
          <Cube
            model={models[3]}
            onNavigate={(href) => (href.startsWith("/api/") ? (window.location.href = href) : router.push(href))}
          />
        </div>

        <div ref={igRef}>
          <Cube
            model={models[4]}
            onNavigate={(href) => (href.startsWith("/api/") ? (window.location.href = href) : router.push(href))}
          />
        </div>

        <div ref={liRef}>
          <Cube
            model={models[5]}
            onNavigate={(href) => (href.startsWith("/api/") ? (window.location.href = href) : router.push(href))}
          />
        </div>
      </div>
    </div>
  );
}

function Cube({
  model,
  onNavigate,
}: {
  model: CubeModel;
  onNavigate: (href: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const isSite = model.key === "site_inrcy" || model.key === "site_web";

  const action = (model as any).action ?? ({ key: "connect", title: "Connexion", detail: "", href: "#", pill: "Connexion" } as const);
  const pill = (action as any)?.pill ?? "Connexion";
  const pillKey = String(pill).toLowerCase();

  const connectionOk = isSite
    ? !!model.connections.ga4 || !!model.connections.gsc
    : !!model.connections.main;

  return (
    <section className={`${styles.cube} ${connectionOk ? "" : styles.cubeOff}`}
      aria-label={model.title}
    >
      <div className={styles.cubeTop}>
        <div>
          <div className={styles.cubeTitleRow}>
            <h2 className={styles.cubeTitle}>{model.title}</h2>
            {model.loading ? <span className={styles.spinner} aria-hidden /> : null}
          </div>
          {model.accountLabel ? <div className={styles.cubeIdentity}>{model.accountLabel}</div> : null}
          <div className={styles.cubeSub}>{model.subtitle}</div>
        </div>

        <div className={styles.cubeBadges}>
          <div className={styles.pills}>
            {isSite ? (
              <>
                <StatusPill ok={!!model.connections.ga4} label="GA4" />
                <StatusPill ok={!!model.connections.gsc} label="GSC" />
              </>
            ) : (
              <StatusPill ok={!!model.connections.main} label={model.connections.main ? "Connecté" : "Déconnecté"} />
            )}
          </div>
          <button
            type="button"
            className={styles.detailsBtn}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? "Masquer les détails" : "Voir les détails"}
          </button>
        </div>
      </div>

      {model.error ? <div className={styles.error}>{getSimpleFrenchErrorMessage(model.error, "Impossible de charger les statistiques pour le moment.")}</div> : null}

      {/* Actions always visible (compact) */}
      <div className={styles.actionCompact}>
        <div className={styles.actionLeft}>
          <div className={styles.actionTopRow}>
            <span className={`${styles.actionPill} ${styles[`action_${pillKey}`]}`}>{pill}</span>

            <div className={styles.actionTopText}>
              {pill === "Connexion" ? (
                <span className={styles.actionTitle}>{action.title}</span>
              ) : (
                <>
                  <span className={styles.actionArrow}>→</span>
                  <span className={styles.actionTitle}>{action.title}</span>
                </>
              )}
            </div>

            {action.effort ? (
              <span className={`${styles.effort} ${styles[`effort_${action.effort.level}`]}`}>{action.effort.label}</span>
            ) : null}
          </div>

          <div className={styles.actionDetail}>{action.detail}</div>
        </div>

        <button
          className={styles.actionBtn}
          onClick={() => (action.href ? onNavigate(action.href) : undefined)}
          disabled={model.loading || !action.href}
          aria-disabled={model.loading || !action.href}
        >
          <span className={styles.actionBtnDesktop}>GO</span>
          <span className={styles.actionBtnMobile}>GO</span>
        </button>
      </div>

      {open ? (
        <div className={styles.cubeBody}>
          <div className={styles.block}>
            <div className={styles.blockTitle}>Provenance</div>
            <Donut segments={model.provenance} />
          </div>

          <div className={styles.blockRow}>
            <div className={styles.block}>
              <div className={styles.blockTitle}>Opportunité</div>
              <div className={styles.oppValue}>+{fmtInt(model.opportunity30)}</div>
              <div className={styles.oppSub}>{model.opportunityLabel} (projection 30 j)</div>
            </div>
            <div className={styles.block}>
              <div className={styles.blockTitle}>Qualité</div>
              <div className={styles.qualityRow}>
                <RingScore value={model.qualityScore} tone={model.qualityTone} />
                <div>
                  <div className={styles.qualityLabel}>{model.qualityLabel}</div>
                  <div className={styles.qualitySub}>Structure & exploitabilité</div>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.block}>
            <div className={styles.blockTitle}>Lecture business</div>
            <ul className={styles.bullets}>
              {model.insights.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}

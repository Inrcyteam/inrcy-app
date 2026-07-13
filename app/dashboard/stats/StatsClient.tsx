"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import styles from "./stats.module.css";
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

type MailStatsSnapshot = {
  loading: boolean;
  error?: string;
  syncedAt?: number;
  connectedCount: number;
  maxAccounts: number;
  campagnes30: number;
  campagnesTotal: number;
  destinataires30: number;
  contactsCrm: number;
  contactsEmail: number;
  propulsions30: number;
  fidelisations30: number;
  mailsSimples30: number;
  agendaReminders30: number;
  agendaRemindersTotal: number;
  factures30: number;
  facturesTotal: number;
  devis30: number;
  devisTotal: number;
  destinatairesTotal: number;
  breakdown?: {
    fideliser?: { total?: number; informer?: number; suivre?: number; enqueter?: number };
    propulser?: { total?: number; valoriser?: number; recolter?: number; offrir?: number };
    mailsSimples?: number;
  };
};

const EMPTY_MAIL_STATS: MailStatsSnapshot = {
  loading: true,
  connectedCount: 0,
  maxAccounts: 4,
  campagnes30: 0,
  campagnesTotal: 0,
  destinataires30: 0,
  contactsCrm: 0,
  contactsEmail: 0,
  propulsions30: 0,
  fidelisations30: 0,
  mailsSimples30: 0,
  agendaReminders30: 0,
  agendaRemindersTotal: 0,
  factures30: 0,
  facturesTotal: 0,
  devis30: 0,
  devisTotal: 0,
  destinatairesTotal: 0,
};

type InrBadgePeriodStats = {
  week: number;
  month: number;
  total: number;
};

type InrBadgeStatsSnapshot = {
  loading: boolean;
  error?: string;
  syncedAt?: number;
  views: InrBadgePeriodStats;
  qrScans: InrBadgePeriodStats;
  actions: InrBadgePeriodStats;
  leads: InrBadgePeriodStats;
  appointments: InrBadgePeriodStats;
  capturedLeads: CapturedLeads;
  actionsByKey: Record<string, InrBadgePeriodStats>;
  qualityScore: number;
  opportunity30: number;
};

const ZERO_INRBADGE_PERIOD: InrBadgePeriodStats = { week: 0, month: 0, total: 0 };

const EMPTY_INRBADGE_STATS: InrBadgeStatsSnapshot = {
  loading: true,
  views: ZERO_INRBADGE_PERIOD,
  qrScans: ZERO_INRBADGE_PERIOD,
  actions: ZERO_INRBADGE_PERIOD,
  leads: ZERO_INRBADGE_PERIOD,
  appointments: ZERO_INRBADGE_PERIOD,
  capturedLeads: { week: 0, month: 0 },
  actionsByKey: {},
  qualityScore: 52,
  opportunity30: 4,
};

function normalizeInrBadgePeriodStats(value: unknown): InrBadgePeriodStats {
  const raw = value && typeof value === "object" ? value as Partial<InrBadgePeriodStats> : {};
  return {
    week: Math.max(0, Math.round(safeNum(raw.week))),
    month: Math.max(0, Math.round(safeNum(raw.month))),
    total: Math.max(0, Math.round(safeNum(raw.total, safeNum(raw.month)))),
  };
}

function normalizeInrBadgeStatsSnapshot(value: unknown, syncedAt?: number): InrBadgeStatsSnapshot {
  const raw = value && typeof value === "object" ? value as Partial<InrBadgeStatsSnapshot> : {};
  const actionsByKeyRaw = raw.actionsByKey && typeof raw.actionsByKey === "object" ? raw.actionsByKey as Record<string, unknown> : {};
  const actionsByKey = Object.fromEntries(
    Object.entries(actionsByKeyRaw).map(([key, stats]) => [key, normalizeInrBadgePeriodStats(stats)])
  ) as Record<string, InrBadgePeriodStats>;

  return {
    loading: false,
    error: typeof raw.error === "string" ? raw.error : undefined,
    syncedAt: Number.isFinite(Number(syncedAt ?? raw.syncedAt)) ? Number(syncedAt ?? raw.syncedAt) : Date.now(),
    views: normalizeInrBadgePeriodStats(raw.views),
    qrScans: normalizeInrBadgePeriodStats(raw.qrScans),
    actions: normalizeInrBadgePeriodStats(raw.actions),
    leads: normalizeInrBadgePeriodStats(raw.leads),
    appointments: normalizeInrBadgePeriodStats(raw.appointments),
    capturedLeads: normalizeCapturedLeads(raw.capturedLeads),
    actionsByKey,
    qualityScore: Math.max(0, Math.min(100, Math.round(safeNum(raw.qualityScore, 52)))),
    opportunity30: Math.max(0, Math.round(safeNum(raw.opportunity30, 4))),
  };
}


type InrSearchStatsSnapshot = {
  loading: boolean;
  error?: string;
  syncedAt?: number;
  enabled: boolean;
  slug: string;
  publicUrl: string;
  pageTitle: string;
  qualityScore: number;
  views: InrBadgePeriodStats;
  actions: InrBadgePeriodStats;
  contactActions: { week: number; month: number };
  actionsByKey: Record<string, number>;
  sources: Record<string, number>;
  topAction: { key: string; count: number } | null;
  topSource: { key: string; count: number } | null;
};

const EMPTY_INR_SEARCH_STATS: InrSearchStatsSnapshot = {
  loading: true,
  enabled: false,
  slug: "",
  publicUrl: "",
  pageTitle: "",
  qualityScore: 0,
  views: ZERO_INRBADGE_PERIOD,
  actions: ZERO_INRBADGE_PERIOD,
  contactActions: { week: 0, month: 0 },
  actionsByKey: {},
  sources: {},
  topAction: null,
  topSource: null,
};

function normalizeInrSearchStatsSnapshot(value: unknown): InrSearchStatsSnapshot {
  const raw = value && typeof value === "object" ? value as Record<string, any> : {};
  const analytics = raw.analytics && typeof raw.analytics === "object" ? raw.analytics as Record<string, any> : {};
  const page = raw.page && typeof raw.page === "object" ? raw.page as Record<string, any> : {};
  const contact = analytics.contactActions && typeof analytics.contactActions === "object" ? analytics.contactActions as Record<string, any> : {};
  const actionsByKeyRaw = analytics.actionsByKey && typeof analytics.actionsByKey === "object" ? analytics.actionsByKey as Record<string, unknown> : {};
  const sourcesRaw = analytics.sources && typeof analytics.sources === "object" ? analytics.sources as Record<string, unknown> : {};

  return {
    loading: false,
    error: typeof raw.error === "string" ? raw.error : undefined,
    syncedAt: Number.isFinite(Number(analytics.syncedAt)) ? Number(analytics.syncedAt) : Date.now(),
    enabled: Boolean(page.enabled),
    slug: String(page.slug || ""),
    publicUrl: String(page.publicUrl || ""),
    pageTitle: String(page.pageTitle || ""),
    qualityScore: Math.max(0, Math.min(100, Math.round(safeNum(page.qualityScore)))),
    views: normalizeInrBadgePeriodStats(analytics.views),
    actions: normalizeInrBadgePeriodStats(analytics.actions),
    contactActions: {
      week: Math.max(0, Math.round(safeNum(contact.week))),
      month: Math.max(0, Math.round(safeNum(contact.month))),
    },
    actionsByKey: Object.fromEntries(Object.entries(actionsByKeyRaw).map(([key, count]) => [key, Math.max(0, Math.round(safeNum(count)))])),
    sources: Object.fromEntries(Object.entries(sourcesRaw).map(([key, count]) => [key, Math.max(0, Math.round(safeNum(count)))])),
    topAction: analytics.topAction && typeof analytics.topAction === "object"
      ? { key: String(analytics.topAction.key || ""), count: Math.max(0, Math.round(safeNum(analytics.topAction.count))) }
      : null,
    topSource: analytics.topSource && typeof analytics.topSource === "object"
      ? { key: String(analytics.topSource.key || ""), count: Math.max(0, Math.round(safeNum(analytics.topSource.count))) }
      : null,
  };
}

const MAIL_STATS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DASHBOARD_CHANNEL_STATE_CACHE_KEY = "inrcy_dashboard_channel_state_v1";

type ChannelIdentityHints = Partial<Record<CubeKey, string>>;
type CachedChannelConnectivity = Partial<Record<CubeKey, boolean>>;

function cleanChannelIdentityHint(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readCachedDashboardChannelState(): Record<string, any> | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = readUiCacheValue(DASHBOARD_CHANNEL_STATE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as any;
    const state = parsed?.state && typeof parsed.state === "object" ? parsed.state : parsed;
    if (!state || typeof state !== "object" || Array.isArray(state)) return null;
    return state;
  } catch {
    return null;
  }
}

function readCachedDashboardChannelIdentityHints(): ChannelIdentityHints {
  try {
    const state = readCachedDashboardChannelState();
    if (!state) return {};

    const instagramUsername = cleanChannelIdentityHint(state.instagramUsername).replace(/^@+/, "");
    const hints: ChannelIdentityHints = {
      site_inrcy: cleanChannelIdentityHint(state.siteInrcySavedUrl || state.siteInrcyUrl),
      site_web: cleanChannelIdentityHint(state.siteWebSavedUrl || state.siteWebUrl),
      gmb: state.gmbConnected ? cleanChannelIdentityHint(state.gmbLocationLabel || state.gmbLocationName) : "",
      facebook: state.facebookPageConnected ? cleanChannelIdentityHint(state.fbSelectedPageName) : "",
      instagram: state.instagramConnected && instagramUsername ? `@${instagramUsername}` : "",
      linkedin: state.linkedinConnected ? cleanChannelIdentityHint(state.linkedinSelectedOrganizationName || state.linkedinDisplayName) : "",
      tiktok: state.tiktokConnected ? cleanChannelIdentityHint(state.tiktokUsername) : "",
      youtube_shorts: state.youtubeShortsConnected ? cleanChannelIdentityHint(state.youtubeShortsChannelName || state.youtubeShortsUrl) : "",
      pinterest: state.pinterestConnected ? cleanChannelIdentityHint(state.pinterestAccountName || state.pinterestUrl) : "",
    };

    return Object.fromEntries(
      Object.entries(hints).filter(([, value]) => Boolean(cleanChannelIdentityHint(value))),
    ) as ChannelIdentityHints;
  } catch {
    return {};
  }
}

function readCachedDashboardChannelConnectivity(): CachedChannelConnectivity {
  try {
    const state = readCachedDashboardChannelState();
    if (!state) return {};

    return {
      inrbadge: typeof state.inrBadgeProfileReady === "boolean" ? state.inrBadgeProfileReady : undefined,
      inr_search: Boolean(state.inrSearchConnected),
      site_inrcy: Boolean(state.siteInrcyGa4Connected || state.siteInrcyGscConnected),
      site_web: Boolean(state.siteWebGa4Connected || state.siteWebGscConnected),
      gmb: Boolean(state.gmbConnected && state.gmbConnectionStatus !== "needs_update"),
      facebook: Boolean(state.facebookPageConnected && state.facebookConnectionStatus !== "needs_update"),
      instagram: Boolean(state.instagramConnected && state.instagramConnectionStatus !== "needs_update"),
      linkedin: Boolean(state.linkedinConnected && state.linkedinConnectionStatus !== "needs_update"),
      mails: clampMailAccountCount(state.mailAccountsConnectedCount) > 0,
      tiktok: Boolean(state.tiktokConnected),
      youtube_shorts: Boolean(state.youtubeShortsConnected),
      pinterest: Boolean(state.pinterestConnected),
    };
  } catch {
    return {};
  }
}

function channelConnectivityFromStates(payload: unknown): CachedChannelConnectivity {
  const states = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, any>
    : {};
  const isUsable = (key: string) => {
    const state = states[key] && typeof states[key] === "object" ? states[key] : {};
    return Boolean(state.connected) && state.requiresUpdate !== true;
  };

  return {
    inr_search: isUsable("inr_search"),
    site_inrcy: Boolean(states.site_inrcy?.ga4 || states.site_inrcy?.gsc || states.site_inrcy?.statsConnected),
    site_web: Boolean(states.site_web?.ga4 || states.site_web?.gsc || states.site_web?.statsConnected),
    gmb: isUsable("gmb"),
    facebook: isUsable("facebook"),
    instagram: isUsable("instagram"),
    linkedin: isUsable("linkedin"),
    mails: isUsable("mails"),
    tiktok: isUsable("tiktok"),
    youtube_shorts: isUsable("youtube_shorts"),
    pinterest: isUsable("pinterest"),
  };
}

function mailStatsSessionKey(period: Period) {
  return `inrcy_stats_mail_snapshot_v3:${period}`;
}

function legacyMailStatsSessionKeys(period: Period) {
  return [
    mailStatsSessionKey(period),
    `inrcy_stats_mail_snapshot_v2:${period}`,
    `inrcy_stats_mail_snapshot_v1:${period}`,
  ];
}

function normalizeMailStatsSnapshot(value: unknown, syncedAt?: number): MailStatsSnapshot {
  const raw = value && typeof value === "object" ? (value as Partial<MailStatsSnapshot>) : {};
  return {
    loading: false,
    error: typeof raw.error === "string" ? raw.error : undefined,
    connectedCount: clampMailAccountCount(raw.connectedCount),
    maxAccounts: Math.max(1, Math.round(safeNum(raw.maxAccounts, 4)) || 4),
    campagnes30: Math.max(0, Math.round(safeNum(raw.campagnes30))),
    campagnesTotal: Math.max(0, Math.round(safeNum(raw.campagnesTotal, safeNum(raw.campagnes30)))),
    destinataires30: Math.max(0, Math.round(safeNum(raw.destinataires30))),
    contactsCrm: Math.max(0, Math.round(safeNum(raw.contactsCrm))),
    contactsEmail: Math.max(0, Math.round(safeNum(raw.contactsEmail, safeNum(raw.contactsCrm)))),
    propulsions30: Math.max(0, Math.round(safeNum(raw.propulsions30))),
    fidelisations30: Math.max(0, Math.round(safeNum(raw.fidelisations30))),
    mailsSimples30: Math.max(0, Math.round(safeNum(raw.mailsSimples30, safeNum((raw as any).inrsend30)))),
    agendaReminders30: Math.max(0, Math.round(safeNum(raw.agendaReminders30))),
    agendaRemindersTotal: Math.max(0, Math.round(safeNum(raw.agendaRemindersTotal, safeNum(raw.agendaReminders30)))),
    factures30: Math.max(0, Math.round(safeNum(raw.factures30))),
    facturesTotal: Math.max(0, Math.round(safeNum(raw.facturesTotal, safeNum(raw.factures30)))),
    devis30: Math.max(0, Math.round(safeNum(raw.devis30))),
    devisTotal: Math.max(0, Math.round(safeNum(raw.devisTotal, safeNum(raw.devis30)))),
    destinatairesTotal: Math.max(0, Math.round(safeNum(raw.destinatairesTotal, safeNum(raw.destinataires30)))),
    breakdown: raw.breakdown && typeof raw.breakdown === "object" ? raw.breakdown : undefined,
    syncedAt: Number.isFinite(Number(syncedAt ?? raw.syncedAt)) ? Number(syncedAt ?? raw.syncedAt) : undefined,
  };
}

function parseCachedMailStats(raw: string | null): { syncedAt: number; snapshotDate: string | null; stats: MailStatsSnapshot } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as any;
    const syncedAt = safeNum(parsed?.syncedAt);
    const stats = normalizeMailStatsSnapshot(parsed?.stats ?? parsed, syncedAt);
    if (!syncedAt && !stats.syncedAt) return null;
    return {
      syncedAt: syncedAt || safeNum(stats.syncedAt),
      snapshotDate: typeof parsed?.snapshotDate === "string" ? parsed.snapshotDate : null,
      stats,
    };
  } catch {
    return null;
  }
}

function readCachedMailStats(period: Period) {
  for (const key of legacyMailStatsSessionKeys(period)) {
    const cached = parseCachedMailStats(readUiCacheValue(key));
    if (!cached) continue;
    const age = Date.now() - cached.syncedAt;
    if (!Number.isFinite(age) || age < 0 || age > MAIL_STATS_CACHE_TTL_MS) continue;
    return cached;
  }
  return null;
}

function readCachedDashboardMailAccountsConnectedCount(): number | null {
  try {
    const state = readCachedDashboardChannelState();
    if (!state) return null;

    if (Object.prototype.hasOwnProperty.call(state, "mailAccountsConnectedCount")) {
      return clampMailAccountCount(state.mailAccountsConnectedCount);
    }

    if (state.mails && typeof state.mails === "object" && Object.prototype.hasOwnProperty.call(state.mails, "connectedCount")) {
      return clampMailAccountCount(state.mails.connectedCount);
    }
  } catch {
    // cache UI uniquement, sans impact fonctionnel
  }

  return null;
}

function buildInitialMailStatsSnapshot(period: Period): MailStatsSnapshot {
  const cachedMail = readCachedMailStats(period);
  if (cachedMail) {
    return { ...cachedMail.stats, loading: false, error: undefined, syncedAt: cachedMail.syncedAt };
  }

  const cachedDashboardConnectedCount = readCachedDashboardMailAccountsConnectedCount();
  if (cachedDashboardConnectedCount !== null) {
    return {
      ...EMPTY_MAIL_STATS,
      loading: true,
      connectedCount: cachedDashboardConnectedCount,
      syncedAt: Date.now(),
    };
  }

  return EMPTY_MAIL_STATS;
}

function writeCachedMailStats(period: Period, stats: MailStatsSnapshot, syncedAt = Date.now()) {
  try {
    writeUiCacheValue(mailStatsSessionKey(period), JSON.stringify({
      syncedAt,
      snapshotDate: expectedUiSnapshotDate(),
      stats: normalizeMailStatsSnapshot(stats, syncedAt),
    }));
  } catch {
    // cache UI uniquement, sans impact fonctionnel
  }
}

function clampMailAccountCount(value: unknown) {
  return Math.max(0, Math.min(4, Math.round(safeNum(value))));
}

function buildMailOpportunity30(stats: MailStatsSnapshot) {
  if (stats.connectedCount <= 0) return 0;
  const base = stats.campagnes30 <= 0 ? 8 : 3;
  const contactsPotential = Math.min(28, (stats.contactsEmail || stats.contactsCrm) / 14);
  const activityPotential = Math.min(14, stats.campagnes30 * 2 + stats.destinataires30 / 45 + stats.agendaReminders30 / 20);
  return Math.max(0, Math.round(base + contactsPotential + activityPotential));
}

function buildMailCubeModel(stats: MailStatsSnapshot, period: Period): CubeModel {
  const connected = stats.connectedCount > 0;
  const opportunity30 = buildMailOpportunity30(stats);
  const contactsEmail = stats.contactsEmail || stats.contactsCrm;
  const qualityScore = !connected
    ? 0
    : Math.max(35, Math.min(92, Math.round(
      36
      + Math.min(24, stats.connectedCount * 8)
      + Math.min(16, contactsEmail / 14)
      + Math.min(10, stats.campagnes30 * 2)
      + Math.min(6, stats.agendaReminders30 / 5),
    )));
  const qualityLabel = qualityScore >= 75 ? "Solide" : qualityScore >= 55 ? "Correct" : connected ? "À travailler" : "À connecter";
  const qualityTone: CubeModel["qualityTone"] = qualityScore >= 80 ? "excellent" : qualityScore >= 65 ? "solid" : qualityScore >= 45 ? "ok" : "low";

  const propulserBreakdown = stats.breakdown?.propulser || {};
  const fideliserBreakdown = stats.breakdown?.fideliser || {};

  const recommendedAction = (() => {
    if (!connected) {
      return {
        key: "connect" as const,
        title: "Configurer",
        detail: "Connectez une boîte d’envoi pour activer le canal Mails.",
        href: "/dashboard?panel=mails",
        pill: "Connexion" as const,
      };
    }
    if (stats.fidelisations30 <= 0 || stats.fidelisations30 <= stats.propulsions30) {
      return {
        key: "fideliser_action" as const,
        title: "Fidéliser",
        detail: "Animez votre base client avec une campagne relationnelle claire.",
        href: "/dashboard/fideliser",
        pill: "Fidéliser" as const,
        effort: { level: "moyen" as const, label: "Effort moyen • 10-15 min" },
      };
    }
    if (stats.propulsions30 <= 0 || stats.propulsions30 < stats.fidelisations30) {
      return {
        key: "propulser_action" as const,
        title: "Propulser",
        detail: "Lancez une action commerciale par mail : valoriser, récolter ou offrir.",
        href: "/dashboard/propulser",
        pill: "Propulser" as const,
        effort: { level: "moyen" as const, label: "Effort moyen • 10-15 min" },
      };
    }
    return {
      key: "mail_simple" as const,
      title: "Créer un mail simple",
      detail: "Envoyez un message libre depuis une boîte mail connectée.",
      href: "/dashboard/mails?compose=1",
      pill: "Mail simple" as const,
      effort: { level: "faible" as const, label: "Effort faible • 3-5 min" },
    };
  })();

  const connectionPending = stats.loading && stats.connectedCount <= 0;

  return {
    key: "mails",
    title: "Mails",
    subtitle: "Actions mails par usage.",
    accountLabel: connected
      ? `Connecté ${stats.connectedCount}/${stats.maxAccounts}`
      : connectionPending
        ? "Vérification en cours..."
        : `À connecter 0/${stats.maxAccounts}`,
    period,
    loading: stats.loading,
    error: stats.error,
    connections: { main: connected },
    connectionPending,
    provenance: [
      { label: "Valoriser", value: safeNum(propulserBreakdown.valoriser), colorVar: "--cValoriser" },
      { label: "Récolter", value: safeNum(propulserBreakdown.recolter), colorVar: "--cRecolter" },
      { label: "Offrir", value: safeNum(propulserBreakdown.offrir), colorVar: "--cOffrir" },
      { label: "Informer", value: safeNum(fideliserBreakdown.informer), colorVar: "--cInformer" },
      { label: "Suivre", value: safeNum(fideliserBreakdown.suivre), colorVar: "--cSuivre" },
      { label: "Enquêter", value: safeNum(fideliserBreakdown.enqueter), colorVar: "--cEnqueter" },
      { label: "Mails simples", value: stats.mailsSimples30, colorVar: "--cMailSimple" },
    ],
    provenanceHint: undefined,
    opportunity30,
    opportunityLabel: opportunity30 >= 14 ? "Fort potentiel" : opportunity30 >= 7 ? "Potentiel réel" : connected ? "À développer" : "À activer",
    capturedLeads: { week: 0, month: 0 },
    capturedLeadsUnavailable: true,
    capturedLeadsHint: connected
      ? "Le canal Mails mesure vos actions Fidéliser, Propulser, mails simples et envois automatiques."
      : "Connectez une boîte mail pour activer ce canal.",
    visibilityStats: connected
      ? [
          { label: "Boîtes", value: `${fmtInt(stats.connectedCount)}/${fmtInt(stats.maxAccounts)}` },
          { label: "Contacts email", value: fmtInt(contactsEmail) },
        ]
      : [],
    actionStats: connected
      ? [
          { label: "Rappels Agenda 30j", value: fmtInt(stats.agendaReminders30), subValue: `${fmtInt(stats.agendaRemindersTotal)} au total` },
          { label: "Factures 30j", value: fmtInt(stats.factures30), subValue: `${fmtInt(stats.facturesTotal)} au total` },
          { label: "Devis 30j", value: fmtInt(stats.devis30), subValue: `${fmtInt(stats.devisTotal)} au total` },
        ]
      : [],
    inrcyActivityStats: {
      publications: { week: 0, month: Math.max(0, stats.campagnes30), total: Math.max(0, stats.campagnesTotal) },
      photos: { week: 0, month: Math.max(0, stats.mailsSimples30), total: Math.max(0, stats.mailsSimples30) },
      videos: { week: 0, month: Math.max(0, stats.destinataires30), total: Math.max(0, stats.destinatairesTotal) },
    },
    qualityScore,
    qualityLabel,
    qualityTone,
    insights: connected
      ? [
          `Boîtes connectées : ${stats.connectedCount}/${stats.maxAccounts}.`,
          `${fmtInt(contactsEmail)} contacts email exploitables pour vos actions mails.`,
          `${fmtInt(stats.campagnes30)} campagnes sur 30 jours, ${fmtInt(stats.campagnesTotal)} au total.`,
          `${fmtInt(stats.destinataires30)} destinataires touchés sur 30 jours, ${fmtInt(stats.destinatairesTotal)} au total.`,
          `${fmtInt(stats.agendaReminders30)} rappels Agenda, ${fmtInt(stats.factures30)} factures et ${fmtInt(stats.devis30)} devis envoyés sur 30 jours.`,
        ]
      : [
          "Canal mail non connecté.",
          "Connectez au moins une boîte d’envoi pour débloquer Fidéliser, Propulser et les mails simples.",
        ],
    action: recommendedAction,
  };
}
function buildInrBadgeCubeModel(period: Period, stats: InrBadgeStatsSnapshot): CubeModel {
  const action = (key: string) => normalizeInrBadgePeriodStats(stats.actionsByKey?.[key]);
  const views = normalizeInrBadgePeriodStats(stats.views);
  const qrScans = normalizeInrBadgePeriodStats(stats.qrScans);
  const actions = normalizeInrBadgePeriodStats(stats.actions);
  const leads = normalizeInrBadgePeriodStats(stats.leads);
  const appointments = normalizeInrBadgePeriodStats(stats.appointments);
  const capturedLeads = normalizeCapturedLeads(stats.capturedLeads);
  const qualityScore = Math.max(0, Math.min(100, Math.round(safeNum(stats.qualityScore, 52))));
  const qualityLabel = qualityScore >= 82 ? "Très actif" : qualityScore >= 68 ? "Actif" : qualityScore >= 55 ? "À booster" : "À lancer";
  const qualityTone: CubeModel["qualityTone"] = qualityScore >= 82 ? "excellent" : qualityScore >= 68 ? "solid" : qualityScore >= 55 ? "ok" : "low";
  const opportunity30 = Math.max(0, Math.round(safeNum(stats.opportunity30)));
  const hasActivity = views.month > 0 || qrScans.month > 0 || actions.month > 0 || capturedLeads.month > 0;

  return {
    key: "inrbadge",
    title: "iNr’Badge",
    subtitle: "Hub de conversion",
    accountLabel: stats.loading ? "Analyse..." : "Connecté",
    period,
    loading: stats.loading,
    error: stats.error,
    connections: { main: true },
    provenance: [
      { label: "Vues fiche", value: views.month, colorVar: "--cSocial" },
      { label: "Scans QR", value: qrScans.month, colorVar: "--cDirect" },
      { label: "Actions", value: actions.month, colorVar: "--cGoogle" },
    ],
    provenanceHint: hasActivity
      ? "Répartition réelle des vues, scans QR et clics iNr’Badge sur 30 jours."
      : "Les statistiques réelles démarrent dès les prochaines visites de la fiche publique.",
    opportunity30,
    opportunityLabel: opportunity30 >= 18 ? "Fort potentiel" : opportunity30 >= 8 ? "Potentiel réel" : "Hub actif",
    capturedLeads,
    capturedLeadsHint: "Coordonnées transmises + demandes de RDV issues de votre iNr’Badge.",
    visibilityStats: [
      { label: "Fiche publique", value: "Active" },
      { label: "Vues 30j", value: fmtInt(views.month), subValue: `${fmtInt(views.total)} au total` },
      { label: "Scans QR 30j", value: fmtInt(qrScans.month), subValue: `${fmtInt(qrScans.total)} au total` },
      { label: "CTA rapides", value: "Trackés" },
    ],
    actionStats: [
      { label: "Appels 30j", value: fmtInt(action("phone").month), subValue: `${fmtInt(action("phone").total)} au total` },
      { label: "Mails 30j", value: fmtInt(action("mail").month), subValue: `${fmtInt(action("mail").total)} au total` },
      { label: "Contacts 30j", value: fmtInt(leads.month), subValue: `${fmtInt(leads.total)} au total` },
      { label: "RDV 30j", value: fmtInt(appointments.month), subValue: `${fmtInt(appointments.total)} au total` },
    ],
    inrcyActivityStats: {
      publications: views,
      photos: qrScans,
      videos: actions,
    },
    qualityScore,
    qualityLabel,
    qualityTone,
    insights: hasActivity
      ? [
          `${fmtInt(views.month)} vues de fiche sur 30 jours, dont ${fmtInt(views.week)} sur 7 jours.`,
          `${fmtInt(qrScans.month)} scans QR et ${fmtInt(actions.month)} actions utiles sur 30 jours.`,
          `${fmtInt(capturedLeads.month)} demandes captées via coordonnées ou prise de RDV sur 30 jours.`,
        ]
      : [
          "Le tracking réel iNr’Badge est actif.",
          "Les prochaines ouvertures, scans QR, clics, contacts et demandes de RDV remonteront ici.",
          "Diffusez le QR Code avec la version téléchargée depuis Configuration pour mesurer les scans.",
        ],
    action: {
      key: "booster_promotion",
      title: "Partager votre badge",
      detail: "Diffusez votre fiche publique et votre QR Code pour générer plus d’actions utiles.",
      href: "/dashboard?panel=inrbadge",
      pill: "Booster",
      effort: { level: "faible", label: "Rapide" },
    },
  };
}


function buildInrSearchOpportunity30(stats: InrSearchStatsSnapshot) {
  if (!stats.enabled) return 0;

  const action = (key: string) => Math.max(0, safeNum(stats.actionsByKey[key]));
  const directContacts = Math.max(0, safeNum(stats.contactActions.month));
  const strongIntent = action("website") + action("directions") + action("inrbadge");
  const qualityBase = 4 + Math.min(5, Math.max(0, safeNum(stats.qualityScore)) / 20);
  const visibilityPotential = Math.min(30, Math.max(0, safeNum(stats.views.month)) / 6);
  const intentPotential = Math.min(18, strongIntent * 0.75 + directContacts * 1.5);

  // iNr'Search combine la logique d'une page web (visibilité et qualité)
  // avec les signaux forts d'iNr'Badge (fiche, itinéraire, contact).
  return Math.max(directContacts, Math.round(qualityBase + visibilityPotential + intentPotential));
}

function buildInrSearchCubeModel(period: Period, stats: InrSearchStatsSnapshot): CubeModel {
  const actions = (key: string) => Math.max(0, Math.round(safeNum(stats.actionsByKey[key])));
  const engines = Math.max(0, Math.round(safeNum(stats.sources.google) + safeNum(stats.sources.bing)));
  const aiEngines = Math.max(0, Math.round(
    safeNum(stats.sources.chatgpt) +
    safeNum(stats.sources.gemini) +
    safeNum(stats.sources.perplexity) +
    safeNum(stats.sources.copilot),
  ));
  const social = Math.max(0, Math.round(safeNum(stats.sources.social)));
  const direct = Math.max(0, Math.round(safeNum(stats.sources.direct) + safeNum(stats.sources.other)));
  const opportunity30 = buildInrSearchOpportunity30(stats);
  const hasActivity = stats.views.month > 0 || stats.actions.month > 0;
  const qualityScore = Math.max(0, Math.min(100, Math.round(safeNum(stats.qualityScore))));
  const qualityLabel = qualityScore >= 82 ? "Très complète" : qualityScore >= 68 ? "Solide" : qualityScore >= 50 ? "À enrichir" : "En préparation";
  const qualityTone: CubeModel["qualityTone"] = qualityScore >= 82 ? "excellent" : qualityScore >= 68 ? "solid" : qualityScore >= 50 ? "ok" : "low";

  return {
    key: "inr_search",
    title: "iNr’Search",
    subtitle: "Votre page publique",
    accountLabel: stats.loading ? "Analyse…" : stats.enabled ? (stats.pageTitle || "Page publiée") : "En préparation",
    period,
    loading: stats.loading,
    error: stats.error,
    connections: { main: stats.enabled },
    provenance: [
      { label: "Google & Bing", value: engines, colorVar: "--cGoogle" },
      { label: "Moteurs IA", value: aiEngines, colorVar: "--cSocial" },
      { label: "Réseaux sociaux", value: social, colorVar: "--cDirect" },
      { label: "Accès direct", value: direct, colorVar: "--cOther" },
    ],
    provenanceHint: hasActivity
      ? "Origine réelle des visites de votre page iNr’Search sur les 30 derniers jours."
      : "Les sources apparaîtront dès les premières visites de la page publique.",
    opportunity30,
    opportunityLabel: opportunity30 > 0 ? "Potentiel estimé" : "Visibilité active",
    capturedLeads: {
      week: Math.max(0, Math.round(safeNum(stats.contactActions.week))),
      month: Math.max(0, Math.round(safeNum(stats.contactActions.month))),
    },
    capturedLeadsHint: "Appels, emails et demandes envoyées depuis la page publique.",
    visibilityStats: [
      { label: "Vues 7j", value: fmtInt(stats.views.week) },
      { label: "Vues 30j", value: fmtInt(stats.views.month), subValue: `${fmtInt(stats.views.total)} au total` },
      { label: "Actions 30j", value: fmtInt(stats.actions.month), subValue: `${fmtInt(stats.actions.total)} au total` },
      { label: "Taux d’action", value: stats.views.month > 0 ? `${Math.round((stats.actions.month / stats.views.month) * 100)}%` : "0%" },
    ],
    actionStats: [
      { label: "Appels 30j", value: fmtInt(actions("phone")) },
      { label: "Demandes formulaire 30j", value: fmtInt(actions("lead_form")) },
      { label: "Emails 30j", value: fmtInt(actions("email") + actions("faq_contact")) },
      { label: "Visites du site 30j", value: fmtInt(actions("website")) },
      { label: "Ouvertures iNr'Badge 30j", value: fmtInt(actions("inrbadge")) },
      { label: "Itinéraires 30j", value: fmtInt(actions("directions")) },
    ],
    inrcyActivityStats: {
      publications: stats.views,
      photos: stats.actions,
      videos: {
        week: Math.max(0, Math.round(safeNum(stats.contactActions.week))),
        month: opportunity30,
        total: Math.max(0, Math.round(safeNum(stats.contactActions.month))),
      },
    },
    qualityScore,
    qualityLabel,
    qualityTone,
    insights: hasActivity
      ? [
          `${fmtInt(stats.views.month)} vues sur 30 jours, dont ${fmtInt(stats.views.week)} sur 7 jours.`,
          `${fmtInt(stats.actions.month)} actions utiles et un potentiel estimé de ${fmtInt(opportunity30)} opportunités sur 30 jours.`,
          stats.topSource ? `Première source de trafic : ${stats.topSource.key}.` : "Les sources de trafic sont mesurées automatiquement.",
        ]
      : [
          stats.enabled ? "La page iNr’Search est publiée et son suivi statistique est actif." : "La page iNr’Search est en préparation.",
          "Les vues, sources, appels, emails et clics remonteront automatiquement dans iNr’Stats.",
        ],
    action: stats.enabled && stats.publicUrl
      ? {
          key: "booster_publier",
          title: "Publier sur iNr’Search",
          detail: "Diffusez une actualité web dédiée sur la page publique depuis Booster.",
          href: "/dashboard?action=publish",
          pill: "Booster",
          effort: { level: "faible", label: "Rapide" },
        }
      : {
          key: "connect",
          title: "Page en préparation",
          detail: "iNrCy publiera automatiquement la page dès que l’identité de l’entreprise sera disponible.",
          href: "/dashboard?panel=inr_search",
          pill: "Connexion",
          effort: { level: "faible", label: "Automatique" },
        },
  };
}

type StatsClientProps = {
  initialInrSearch?: {
    published: boolean;
    slug: string;
    publicUrl: string;
    pageTitle: string;
  };
};

export default function StatsClient({ initialInrSearch }: StatsClientProps) {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportNotice, setReportNotice] = useState<string | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null);


  // ✅ Période globale (7j / 30j) pour éviter un mix incohérent entre blocs.
  const period: Period = 30;

  const [dataByCube, setDataByCube] = useState<Record<CubeKey, CubeState>>(emptyCubeState);

  const [summaryOpp, setSummaryOpp] = useState<{ loading: boolean; total: number; byCube: Record<CubeKey, number> }>({
    loading: true,
    total: 0,
    byCube: { inrbadge: 0, inr_search: 0, site_inrcy: 0, site_web: 0, gmb: 0, facebook: 0, instagram: 0, linkedin: 0, mails: 0, tiktok: 0, youtube_shorts: 0, pinterest: 0 },
  });
  const [summaryProfile, setSummaryProfile] = useState<{ lead_conversion_rate: number; avg_basket: number }>({ lead_conversion_rate: 0, avg_basket: 0 });
  const [summaryEstimatedByCube, setSummaryEstimatedByCube] = useState<Record<CubeKey, number>>({
    inrbadge: 0,
    inr_search: 0,
    site_inrcy: 0,
    site_web: 0,
    gmb: 0,
    facebook: 0,
    instagram: 0,
    linkedin: 0,
    mails: 0,
    tiktok: 0,
    youtube_shorts: 0,
    pinterest: 0,
  });
  const [, setSummaryHydrated] = useState(false);
  const [activeStatsPanel, setActiveStatsPanel] = useState<StatsPanelKey>("all");
  const [statsMenuOpen, setStatsMenuOpen] = useState(false);
  const [dailyBootReady, setDailyBootReady] = useState(false);
  const [mailStats, setMailStats] = useState<MailStatsSnapshot>(() => buildInitialMailStatsSnapshot(period));
  const [inrBadgeStats, setInrBadgeStats] = useState<InrBadgeStatsSnapshot>(EMPTY_INRBADGE_STATS);
  const [inrSearchStats, setInrSearchStats] = useState<InrSearchStatsSnapshot>(() => ({
    ...EMPTY_INR_SEARCH_STATS,
    loading: false,
    enabled: Boolean(initialInrSearch?.published),
    slug: String(initialInrSearch?.slug || ""),
    publicUrl: String(initialInrSearch?.publicUrl || ""),
    pageTitle: String(initialInrSearch?.pageTitle || ""),
  }));
  const [channelIdentityHints, setChannelIdentityHints] = useState<ChannelIdentityHints>({});
  const [cachedChannelConnectivity, setCachedChannelConnectivity] = useState<CachedChannelConnectivity>(() => readCachedDashboardChannelConnectivity());

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

  useEffect(() => {
    let cancelled = false;

    const cachedHints = readCachedDashboardChannelIdentityHints();
    if (Object.keys(cachedHints).length > 0) {
      setChannelIdentityHints((current) => ({ ...current, ...cachedHints }));
    }
    setCachedChannelConnectivity((current) => ({ ...current, ...readCachedDashboardChannelConnectivity() }));

    // Même source de connexion que les bulles du Dashboard. Pinterest est relu
    // en direct côté serveur afin de ne pas conserver durablement son profil.
    void fetch("/api/stats/channel-identities", {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (response) => (response.ok ? response.json().catch(() => null) : null))
      .then((payload) => {
        if (cancelled || !payload?.ok || !payload?.identities) return;
        const freshHints = Object.fromEntries(
          Object.entries(payload.identities as Record<string, unknown>)
            .map(([key, value]) => [key, cleanChannelIdentityHint(value)])
            .filter(([, value]) => Boolean(value)),
        ) as ChannelIdentityHints;
        if (Object.keys(freshHints).length === 0) return;
        setChannelIdentityHints((current) => ({ ...current, ...freshHints }));
      })
      .catch(() => null);

    void fetch("/api/integrations/channel-states", {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (response) => (response.ok ? response.json().catch(() => null) : null))
      .then((payload) => {
        if (cancelled || !payload) return;
        setCachedChannelConnectivity((current) => ({ ...current, ...channelConnectivityFromStates(payload) }));
      })
      .catch(() => null);

    return () => {
      cancelled = true;
    };
  }, [refreshNonce]);

  const hydrateMailStatsFromCache = useCallback((targetPeriod: Period) => {
    const cachedMail = readCachedMailStats(targetPeriod);
    if (!cachedMail) return false;
    setMailStats((prev) => {
      if (safeNum(prev.syncedAt) > cachedMail.syncedAt) return prev;
      return { ...cachedMail.stats, loading: false, error: undefined, syncedAt: cachedMail.syncedAt };
    });
    return true;
  }, []);

  useBrowserLayoutEffect(() => {
    const cachedCube = parseCachedCubeSnapshot(readUiCacheValue(cubeSessionKey(period)));
    const cachedSummary = parseCachedSummarySnapshot(readUiCacheValue(summarySessionKey(period)));
    hydrateMailStatsFromCache(period);

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
          inrbadge: 0,
          inr_search: 0,
          site_inrcy: safeNum(byCubePartial.site_inrcy),
          site_web: safeNum(byCubePartial.site_web),
          gmb: safeNum(byCubePartial.gmb),
          facebook: safeNum(byCubePartial.facebook),
          instagram: safeNum(byCubePartial.instagram),
          linkedin: safeNum(byCubePartial.linkedin),
          mails: 0,
          tiktok: safeNum(byCubePartial.tiktok),
          youtube_shorts: safeNum(byCubePartial.youtube_shorts),
          pinterest: safeNum(byCubePartial.pinterest),
        },
      });
      setSummaryProfile({
        lead_conversion_rate: safeNum(cachedSummary.profile?.lead_conversion_rate),
        avg_basket: safeNum(cachedSummary.profile?.avg_basket),
      });
      setSummaryEstimatedByCube({
        inrbadge: 0,
        inr_search: 0,
        site_inrcy: safeNum(estimatedByCubePartial.site_inrcy),
        site_web: safeNum(estimatedByCubePartial.site_web),
        gmb: safeNum(estimatedByCubePartial.gmb),
        facebook: safeNum(estimatedByCubePartial.facebook),
        instagram: safeNum(estimatedByCubePartial.instagram),
        linkedin: safeNum(estimatedByCubePartial.linkedin),
        mails: 0,
        tiktok: safeNum(estimatedByCubePartial.tiktok),
        youtube_shorts: safeNum(estimatedByCubePartial.youtube_shorts),
      pinterest: safeNum(estimatedByCubePartial.pinterest),
      });
    }
  }, [hydrateMailStatsFromCache, period]);

  const clearCachedSnapshots = useCallback(() => {
    periodCacheRef.current.clear();
    try {
      for (const p of AVAILABLE_PERIODS) {
        removeUiCacheValue(cubeSessionKey(p));
        removeUiCacheValue(summarySessionKey(p));
        removeUiCacheValue(mailStatsSessionKey(p));
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
            inrbadge: 0,
            inr_search: 0,
            site_inrcy: safeNum(cachedSummary.byCube?.site_inrcy),
            site_web: safeNum(cachedSummary.byCube?.site_web),
            gmb: safeNum(cachedSummary.byCube?.gmb),
            facebook: safeNum(cachedSummary.byCube?.facebook),
            instagram: safeNum(cachedSummary.byCube?.instagram),
            linkedin: safeNum(cachedSummary.byCube?.linkedin),
            mails: 0,
            tiktok: safeNum(cachedSummary.byCube?.tiktok),
            youtube_shorts: safeNum(cachedSummary.byCube?.youtube_shorts),
            pinterest: safeNum(cachedSummary.byCube?.pinterest),
          },
        });
        setSummaryProfile({
          lead_conversion_rate: safeNum(cachedSummary.profile?.lead_conversion_rate),
          avg_basket: safeNum(cachedSummary.profile?.avg_basket),
        });
        setSummaryEstimatedByCube({
          inrbadge: 0,
          inr_search: 0,
          site_inrcy: safeNum(cachedSummary.estimatedByCube?.site_inrcy),
          site_web: safeNum(cachedSummary.estimatedByCube?.site_web),
          gmb: safeNum(cachedSummary.estimatedByCube?.gmb),
          facebook: safeNum(cachedSummary.estimatedByCube?.facebook),
          instagram: safeNum(cachedSummary.estimatedByCube?.instagram),
          linkedin: safeNum(cachedSummary.estimatedByCube?.linkedin),
          mails: 0,
          tiktok: safeNum(cachedSummary.estimatedByCube?.tiktok),
          youtube_shorts: safeNum(cachedSummary.estimatedByCube?.youtube_shorts),
          pinterest: safeNum(cachedSummary.estimatedByCube?.pinterest),
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
            youtube_shorts: safeNum(cachedSummary.byCube?.youtube_shorts),
            pinterest: safeNum(cachedSummary.byCube?.pinterest),
          },
          estimatedByCube: {
            site_inrcy: safeNum(cachedSummary.estimatedByCube?.site_inrcy),
            site_web: safeNum(cachedSummary.estimatedByCube?.site_web),
            gmb: safeNum(cachedSummary.estimatedByCube?.gmb),
            facebook: safeNum(cachedSummary.estimatedByCube?.facebook),
            instagram: safeNum(cachedSummary.estimatedByCube?.instagram),
            linkedin: safeNum(cachedSummary.estimatedByCube?.linkedin),
            tiktok: safeNum(cachedSummary.estimatedByCube?.tiktok),
            youtube_shorts: safeNum(cachedSummary.estimatedByCube?.youtube_shorts),
          pinterest: safeNum(cachedSummary.estimatedByCube?.pinterest),
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
            inrbadge: 0,
            inr_search: 0,
            site_inrcy: safeNum(payload?.opportunities?.byCube?.site_inrcy),
            site_web: safeNum(payload?.opportunities?.byCube?.site_web),
            gmb: safeNum(payload?.opportunities?.byCube?.gmb),
            facebook: safeNum(payload?.opportunities?.byCube?.facebook),
            instagram: safeNum(payload?.opportunities?.byCube?.instagram),
            linkedin: safeNum(payload?.opportunities?.byCube?.linkedin),
            mails: 0,
            tiktok: safeNum(payload?.opportunities?.byCube?.tiktok),
            youtube_shorts: safeNum(payload?.opportunities?.byCube?.youtube_shorts),
            pinterest: safeNum(payload?.opportunities?.byCube?.pinterest),
          },
        },
        profile: {
          lead_conversion_rate: safeNum(payload?.profile?.lead_conversion_rate),
          avg_basket: safeNum(payload?.profile?.avg_basket),
        },
        estimatedByCube: {
          inrbadge: 0,
          inr_search: 0,
          site_inrcy: safeNum(payload?.estimatedByCube?.site_inrcy),
          site_web: safeNum(payload?.estimatedByCube?.site_web),
          gmb: safeNum(payload?.estimatedByCube?.gmb),
          facebook: safeNum(payload?.estimatedByCube?.facebook),
          instagram: safeNum(payload?.estimatedByCube?.instagram),
          linkedin: safeNum(payload?.estimatedByCube?.linkedin),
          mails: 0,
          tiktok: safeNum(payload?.estimatedByCube?.tiktok),
          youtube_shorts: safeNum(payload?.estimatedByCube?.youtube_shorts),
          pinterest: safeNum(payload?.estimatedByCube?.pinterest),
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
    setRefreshNonce((prev) => prev + 1);

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

  const refreshInrBadgeStats = useCallback(async () => {
    setInrBadgeStats((prev) => ({ ...prev, loading: true, error: undefined }));
    try {
      const res = await fetch("/api/inrstats/inrbadge", { cache: "no-store", credentials: "include" });
      if (!res.ok) throw new Error(await getSimpleFrenchApiError(res));
      const json = await res.json().catch(() => ({}));
      const syncedAt = Number.isFinite(Number(json?.syncedAt)) ? Number(json.syncedAt) : Date.now();
      setInrBadgeStats(normalizeInrBadgeStatsSnapshot({ ...json, loading: false }, syncedAt));
    } catch (error) {
      setInrBadgeStats((prev) => ({
        ...prev,
        loading: false,
        error: getSimpleFrenchErrorMessage(error, "Impossible de charger les données iNrBadge pour le moment."),
      }));
    }
  }, []);

  const refreshInrSearchStats = useCallback(async () => {
    setInrSearchStats((prev) => ({
      ...prev,
      loading: prev.enabled ? false : true,
      error: undefined,
    }));
    try {
      const res = await fetch("/api/inr-search/analytics", { cache: "no-store", credentials: "include" });
      if (!res.ok) throw new Error(await getSimpleFrenchApiError(res));
      const json = await res.json().catch(() => ({}));
      setInrSearchStats(normalizeInrSearchStatsSnapshot(json));
    } catch (error) {
      setInrSearchStats((prev) => ({
        ...prev,
        loading: false,
        error: getSimpleFrenchErrorMessage(error, "Impossible de charger les données iNr'Search pour le moment."),
      }));
    }
  }, []);

  const refreshMailStats = useCallback(async () => {
    setMailStats((prev) => ({ ...prev, loading: true, error: undefined }));
    try {
      const res = await fetch("/api/inrstats/mails", { cache: "no-store", credentials: "include" });
      if (!res.ok) throw new Error(await getSimpleFrenchApiError(res));
      const json = await res.json().catch(() => ({}));

      const syncedAt = Number.isFinite(Number(json?.syncedAt)) ? Number(json.syncedAt) : Date.now();
      const nextMailStats = normalizeMailStatsSnapshot({
        ...json,
        loading: false,
      }, syncedAt);
      writeCachedMailStats(period, nextMailStats, syncedAt);
      setMailStats(nextMailStats);
    } catch (error) {
      setMailStats((prev) => ({
        ...prev,
        loading: false,
        error: getSimpleFrenchErrorMessage(error, "Impossible de charger les données Mails pour le moment."),
      }));
    }
  }, [period]);

  useEffect(() => {
    void refreshMailStats();
    const handler = () => void refreshMailStats();
    window.addEventListener("focus", handler);
    window.addEventListener("inrsend:mail-accounts-updated", handler);
    return () => {
      window.removeEventListener("focus", handler);
      window.removeEventListener("inrsend:mail-accounts-updated", handler);
    };
  }, [refreshMailStats, refreshNonce]);

  useEffect(() => {
    void refreshInrBadgeStats();
    const handler = () => void refreshInrBadgeStats();
    window.addEventListener("focus", handler);
    return () => {
      window.removeEventListener("focus", handler);
    };
  }, [refreshInrBadgeStats, refreshNonce]);

  useEffect(() => {
    void refreshInrSearchStats();
    const handler = () => void refreshInrSearchStats();
    const visibilityHandler = () => {
      if (document.visibilityState === "visible") void refreshInrSearchStats();
    };
    const intervalId = window.setInterval(handler, 30_000);
    window.addEventListener("focus", handler);
    window.addEventListener("inrcy:inr-search-settings-updated", handler);
    document.addEventListener("visibilitychange", visibilityHandler);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handler);
      window.removeEventListener("inrcy:inr-search-settings-updated", handler);
      document.removeEventListener("visibilitychange", visibilityHandler);
    };
  }, [refreshInrSearchStats, refreshNonce]);


  const hydrateFromSessionCache = useCallback((targetPeriod: Period) => {
    hydrateMailStatsFromCache(targetPeriod);
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
        inrbadge: 0,
        inr_search: 0,
        site_inrcy: safeNum(byCubePartial.site_inrcy),
        site_web: safeNum(byCubePartial.site_web),
        gmb: safeNum(byCubePartial.gmb),
        facebook: safeNum(byCubePartial.facebook),
        instagram: safeNum(byCubePartial.instagram),
        linkedin: safeNum(byCubePartial.linkedin),
          mails: 0,
          tiktok: safeNum(byCubePartial.tiktok),
          youtube_shorts: safeNum(byCubePartial.youtube_shorts),
          pinterest: safeNum(byCubePartial.pinterest),
      },
    });
    setSummaryProfile({
      lead_conversion_rate: safeNum(cachedSummary?.profile?.lead_conversion_rate),
      avg_basket: safeNum(cachedSummary?.profile?.avg_basket),
    });
    setSummaryEstimatedByCube({
      inrbadge: 0,
      inr_search: 0,
      site_inrcy: safeNum(estimatedByCubePartial.site_inrcy),
      site_web: safeNum(estimatedByCubePartial.site_web),
      gmb: safeNum(estimatedByCubePartial.gmb),
      facebook: safeNum(estimatedByCubePartial.facebook),
      instagram: safeNum(estimatedByCubePartial.instagram),
      linkedin: safeNum(estimatedByCubePartial.linkedin),
        mails: 0,
        tiktok: safeNum(estimatedByCubePartial.tiktok),
        youtube_shorts: safeNum(estimatedByCubePartial.youtube_shorts),
      pinterest: safeNum(estimatedByCubePartial.pinterest),
    });
    return true;
  }, [hydrateMailStatsFromCache]);


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
          inrbadge: 0,
          inr_search: 0,
          site_inrcy: safeNum(byCubePartial.site_inrcy),
          site_web: safeNum(byCubePartial.site_web),
          gmb: safeNum(byCubePartial.gmb),
          facebook: safeNum(byCubePartial.facebook),
          instagram: safeNum(byCubePartial.instagram),
          linkedin: safeNum(byCubePartial.linkedin),
          mails: 0,
          tiktok: safeNum(byCubePartial.tiktok),
          youtube_shorts: safeNum(byCubePartial.youtube_shorts),
          pinterest: safeNum(byCubePartial.pinterest),
        } as Record<CubeKey, number>,
      },
      profile: {
        lead_conversion_rate: safeNum(json?.profile?.lead_conversion_rate),
        avg_basket: safeNum(json?.profile?.avg_basket),
      },
      estimatedByCube: {
        inrbadge: 0,
        inr_search: 0,
        site_inrcy: safeNum(json?.estimatedByCube?.site_inrcy),
        site_web: safeNum(json?.estimatedByCube?.site_web),
        gmb: safeNum(json?.estimatedByCube?.gmb),
        facebook: safeNum(json?.estimatedByCube?.facebook),
        instagram: safeNum(json?.estimatedByCube?.instagram),
        linkedin: safeNum(json?.estimatedByCube?.linkedin),
        mails: 0,
        tiktok: safeNum(json?.estimatedByCube?.tiktok),
        youtube_shorts: safeNum(json?.estimatedByCube?.youtube_shorts),
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
  const keys: CubeKey[] = ["site_inrcy", "site_web", "gmb", "facebook", "instagram", "linkedin", "tiktok", "youtube_shorts", "pinterest"];

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
          inrbadge: 0,
          inr_search: 0,
          site_inrcy: safeNum(cachedSummary.byCube?.site_inrcy),
          site_web: safeNum(cachedSummary.byCube?.site_web),
          gmb: safeNum(cachedSummary.byCube?.gmb),
          facebook: safeNum(cachedSummary.byCube?.facebook),
          instagram: safeNum(cachedSummary.byCube?.instagram),
          linkedin: safeNum(cachedSummary.byCube?.linkedin),
          mails: 0,
          tiktok: safeNum(cachedSummary.byCube?.tiktok),
          youtube_shorts: safeNum(cachedSummary.byCube?.youtube_shorts),
            pinterest: safeNum(cachedSummary.byCube?.pinterest),
        },
      });
      setSummaryProfile({
        lead_conversion_rate: safeNum(cachedSummary.profile?.lead_conversion_rate),
        avg_basket: safeNum(cachedSummary.profile?.avg_basket),
      });
      setSummaryEstimatedByCube({
        inrbadge: 0,
        inr_search: 0,
        site_inrcy: safeNum(cachedSummary.estimatedByCube?.site_inrcy),
        site_web: safeNum(cachedSummary.estimatedByCube?.site_web),
        gmb: safeNum(cachedSummary.estimatedByCube?.gmb),
        facebook: safeNum(cachedSummary.estimatedByCube?.facebook),
        instagram: safeNum(cachedSummary.estimatedByCube?.instagram),
        linkedin: safeNum(cachedSummary.estimatedByCube?.linkedin),
        mails: 0,
        tiktok: safeNum(cachedSummary.estimatedByCube?.tiktok),
        youtube_shorts: safeNum(cachedSummary.estimatedByCube?.youtube_shorts),
          pinterest: safeNum(cachedSummary.estimatedByCube?.pinterest),
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


  const mailOpportunity30 = useMemo(() => buildMailOpportunity30(mailStats), [mailStats]);
  const inrBadgeOpportunity30 = useMemo(() => Math.max(0, Math.round(safeNum(inrBadgeStats.opportunity30))), [inrBadgeStats.opportunity30]);
  const inrSearchOpportunity30 = useMemo(() => buildInrSearchOpportunity30(inrSearchStats), [inrSearchStats]);

  const centralByCube = useMemo<Record<CubeKey, number>>(() => ({
    ...summaryOpp.byCube,
    inrbadge: inrBadgeOpportunity30,
    inr_search: inrSearchOpportunity30,
    mails: mailOpportunity30,
  }), [inrBadgeOpportunity30, inrSearchOpportunity30, mailOpportunity30, summaryOpp.byCube]);

  const centralPotential30 = Math.max(0, safeNum(summaryOpp.total) + mailOpportunity30 + inrBadgeOpportunity30 + inrSearchOpportunity30);

  const models: CubeModel[] = useMemo(() => {
    const baseModels: CubeModel[] = [
      buildInrBadgeCubeModel(period, inrBadgeStats),
      buildInrSearchCubeModel(period, inrSearchStats),
      buildMailCubeModel(mailStats, period),
      buildCubeModel("site_inrcy", "Site iNrCy", "Optimisé pour convertir", period, dataByCube.site_inrcy, centralByCube),
      buildCubeModel("site_web", "Site Web", "Votre image", period, dataByCube.site_web, centralByCube),
      buildCubeModel("gmb", "Google Business", "Visibilité locale", period, dataByCube.gmb, centralByCube),
      buildCubeModel("facebook", "Facebook", "Visibilité sociale", period, dataByCube.facebook, centralByCube),
      buildCubeModel("instagram", "Instagram", "Visibilité de marque", period, dataByCube.instagram, centralByCube),
      buildCubeModel("linkedin", "LinkedIn", "Visibilité professionnelle", period, dataByCube.linkedin, centralByCube),
      buildCubeModel("tiktok", "TikTok", "Photos & vidéos courtes", period, dataByCube.tiktok, centralByCube),
      buildCubeModel("youtube_shorts", "YouTube", "Vidéos courtes & longues", period, dataByCube.youtube_shorts, centralByCube),
      buildCubeModel("pinterest", "Pinterest", "Inspiration & idées", period, dataByCube.pinterest, centralByCube),
    ];

    return baseModels.map((model) => {
      const cachedConnected = cachedChannelConnectivity[model.key] === true;
      const isSite = model.key === "site_inrcy" || model.key === "site_web";
      const liveConnected = isSite
        ? Boolean(model.connections.ga4 || model.connections.gsc)
        : Boolean(model.connections.main);
      const hydratedModel = cachedConnected && !liveConnected
        ? {
            ...model,
            connectionPending: false,
            connections: isSite
              ? { ...model.connections, ga4: true }
              : { ...model.connections, main: true },
          }
        : model;
      const identityHint = cleanChannelIdentityHint(channelIdentityHints[model.key]);
      if (!identityHint) return hydratedModel;

      // La source fraîche est la même que celle des bulles du Dashboard.
      // Elle prend donc le dessus sur un éventuel snapshot iNrStats plus ancien.
      return { ...hydratedModel, accountLabel: identityHint };
    });
  }, [cachedChannelConnectivity, centralByCube, channelIdentityHints, dataByCube, inrBadgeStats, inrSearchStats, mailStats, period]);

  const computedEstimatedByCube = useMemo<Record<CubeKey, number>>(() => {
    const rate = Math.max(0, safeNum(summaryProfile.lead_conversion_rate)) / 100;
    const basket = Math.max(0, safeNum(summaryProfile.avg_basket));
    const estimate = (opportunities: number) => Math.round(Math.max(0, safeNum(opportunities)) * rate * basket);

    return {
      inrbadge: estimate(centralByCube.inrbadge),
      inr_search: estimate(centralByCube.inr_search),
      site_inrcy: estimate(centralByCube.site_inrcy),
      site_web: estimate(centralByCube.site_web),
      gmb: estimate(centralByCube.gmb),
      facebook: estimate(centralByCube.facebook),
      instagram: estimate(centralByCube.instagram),
      linkedin: estimate(centralByCube.linkedin),
      mails: estimate(centralByCube.mails),
      tiktok: estimate(centralByCube.tiktok),
      youtube_shorts: estimate(centralByCube.youtube_shorts),
      pinterest: estimate(centralByCube.pinterest),
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
      const connected = isSite ? !!model.connections.ga4 || !!model.connections.gsc : !!model.connections.main || !!model.connectionPending;
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
    if (/^https?:\/\//i.test(href)) window.open(href, "_blank", "noopener,noreferrer");
    else if (href.startsWith("/api/")) window.location.href = href;
    else router.push(href);
  };

  async function generateStatsReportNow() {
    if (isGeneratingReport) return;

    setIsGeneratingReport(true);
    setReportNotice("Génération du bilan en cours…");

    try {
      const response = await fetch("/api/agent/actions/send-stats-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: "inrstats" }),
      });
      const payload = (await response.json().catch(() => null)) as {
        sent?: boolean;
        recipientEmail?: string;
        error?: string;
        detail?: string;
      } | null;

      if (!response.ok || !payload?.sent) {
        throw new Error(
          payload?.error ||
            payload?.detail ||
            "Génération ou envoi du bilan iNr’Stats impossible.",
        );
      }

      setReportNotice(
        `Bilan généré et envoyé${payload.recipientEmail ? ` à ${payload.recipientEmail}` : ""}.`,
      );
      setTimeout(() => setReportNotice(null), 4500);
    } catch (error) {
      setReportNotice(
        error instanceof Error
          ? error.message
          : "Génération ou envoi du bilan iNr’Stats impossible.",
      );
    } finally {
      setIsGeneratingReport(false);
    }
  }

  const selectStatsPanel = (panel: StatsPanelKey) => {
    setActiveStatsPanel(panel);
    setStatsMenuOpen(false);
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.brand}>
            <img
              src="/inrstats-logo.png"
              alt="iNr’Stats"
              width={154}
              height={64}
              className={styles.headerLogo}
              loading="eager"
              decoding="sync"
              fetchPriority="high"
            />
            <div className={`${styles.tagline} ${styles.taglineDesktop}`}>Vos données analysées en mode business.</div>
          </div>

          <div className={styles.headerActions}>
            <div className={styles.headerCloseControls}>
              <HelpButton onClick={() => setHelpOpen(true)} title="Aide iNr’Stats" size={34} />
              <button
                type="button"
                className={styles.statsMobileNavButton}
                onClick={() => setStatsMenuOpen(true)}
                aria-label="Ouvrir les canaux iNr’Stats"
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
                ariaLabel="Actualiser les données iNr’Stats"
                title={lastRefreshAt ? `Dernière actualisation : ${new Date(lastRefreshAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Mettre à jour les statistiques"}
              />
              <ResponsiveActionButton desktopLabel="Fermer" mobileIcon="✕" onClick={() => router.push("/dashboard")} title="Retour au tableau de bord" />
            </div>
          </div>
        </div>
        <div className={`${styles.tagline} ${styles.taglineMobile}`}>Vos données analysées en mode business.</div>
        {reportNotice ? (
          <div className={styles.reportNotice} role="status">
            {reportNotice}
          </div>
        ) : null}
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
          <aside className={styles.statsMobileDrawer} aria-label="Choisir une vue iNr’Stats" onClick={(event) => event.stopPropagation()}>
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
                const connectionPending = (model.key === "mails" && !!model.connectionPending) || (model.key === "inr_search" && model.loading);
                const connected = !connectionPending && (isSite ? !!model.connections.ga4 || !!model.connections.gsc : !!model.connections.main);
                const isActive = activeStatsPanel === model.key;

                return (
                  <button
                    type="button"
                    key={model.key}
                    className={`${styles.statsMobileDrawerItem} ${isActive ? styles.statsMobileDrawerItemActive : ""} ${connected ? styles.statsRailItemConnected : styles.statsRailItemOff}`}
                    onClick={() => selectStatsPanel(model.key)}
                  >
                    <span className={styles.statsRailDot} aria-hidden />
                    <span className={styles.statsRailText}>
                      <b>{model.title}</b>
                      <small>{model.key === "inr_search" ? (connectionPending ? "Synchronisation…" : connected ? "Page publiée" : "Page indisponible") : connectionPending ? "Vérification" : connected ? "Connecté" : "Déconnecté"}</small>
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
        <aside className={styles.statsRail} aria-label="Canaux iNr’Stats">
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
            const connectionPending = (model.key === "mails" && !!model.connectionPending) || (model.key === "inr_search" && model.loading);
            const connected = !connectionPending && (isSite ? !!model.connections.ga4 || !!model.connections.gsc : !!model.connections.main);
            const isActive = activeStatsPanel === model.key;

            return (
              <button
                key={model.key}
                type="button"
                className={`${styles.statsRailItem} ${isActive ? styles.statsRailItemActive : ""} ${connected ? styles.statsRailItemConnected : styles.statsRailItemOff}`}
                onClick={() => selectStatsPanel(model.key)}
              >
                <span className={styles.statsRailDot} aria-hidden />
                <span className={styles.statsRailText}>
                  <b>{model.title}</b>
                  <small>{model.key === "inr_search" ? (connectionPending ? "Synchronisation…" : connected ? "Page publiée" : "Page indisponible") : connectionPending ? "Vérification" : connected ? "Connecté" : "Déconnecté"}</small>
                </span>
                <span className={styles.statsRailValue}>+{fmtInt(model.opportunity30)}</span>
              </button>
            );
          })}
        </aside>

        <main className={styles.statsPanel}>
          {activeStatsPanel === "all" ? (
            <section className={styles.allStatsPanel} aria-label="Vue globale iNr’Stats">
              <div className={styles.allStatsHero}>
                <div className={styles.allStatsHeaderMain}>
                  <div className={styles.allStatsHeadingRow}>
                    <h2 className={styles.allStatsTitle}>Vue globale — Tous vos canaux en un coup d’œil</h2>
                    <button
                      type="button"
                      className={styles.allStatsReportButton}
                      onClick={() => {
                        void generateStatsReportNow();
                      }}
                      disabled={isGeneratingReport}
                      aria-label="Générer un bilan iNr’Stats manuel"
                      title="Créer et envoyer un bilan manuel maintenant"
                    >
                      {isGeneratingReport ? "Génération du bilan…" : "🧾 Générer un bilan"}
                    </button>
                  </div>
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
                    const connectionPending = (model.key === "mails" && !!model.connectionPending) || (model.key === "inr_search" && model.loading);
                  const connected = !connectionPending && (isSite ? !!model.connections.ga4 || !!model.connections.gsc : !!model.connections.main);

                  return (
                    <article
                      key={model.key}
                      className={`${styles.allStatsActionCard} ${connected ? styles.allStatsActionCardConnected : styles.allStatsActionCardOff}`}
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
                          {actionItem?.badge ?? model.action.pill}
                        </span>
                      </div>

                      <button
                        type="button"
                        className={`${styles.allStatsGoButton} ${connected ? styles.allStatsGoButtonOn : styles.allStatsGoButtonConnect}`}
                        onClick={() => actionHref && actionHref !== "#" ? navigateFromStats(actionHref) : scrollTo(model.key)}
                        disabled={false}
                        title={connected ? "Lancer l’action recommandée" : "Configurer ce canal"}
                      >
                        {connected ? "GO ⚡" : <>GO <PlugIcon /></>}
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

                <div className={`${styles.allStatsKpis} ${styles.channelStatsKpis} ${activeModel.key === "mails" ? styles.channelStatsKpisMail : ""}`}>
                  <div className={`${styles.allStatsKpi} ${styles.kpiToneBlue}`}>
                    <span>Opportunités</span>
                    <b>+{fmtInt(activeModel.opportunity30)}</b>
                  </div>
                  <div className={`${styles.allStatsKpi} ${styles.kpiTonePurple}`}>
                    <span>CA potentiel</span>
                    <b>+{fmtInt(summaryEstimatedByCube[activeModel.key] || computedEstimatedByCube[activeModel.key] || 0)} €</b>
                  </div>
                  {activeModel.key !== "mails" ? (
                    <div className={`${styles.allStatsKpi} ${styles.kpiToneGreen} ${styles.channelDemandesKpi}`}>
                      <span className={styles.channelDemandesKpiLabel}>Demandes captées 7j / 30j</span>
                      <b>{activeModel.capturedLeadsUnavailable ? "—" : `${fmtInt(activeModel.capturedLeads.week)} / ${fmtInt(activeModel.capturedLeads.month)}`}</b>
                    </div>
                  ) : null}
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

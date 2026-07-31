"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  MODULE_SNAPSHOT_KEYS,
  readFreshModuleSnapshot,
  writeModuleSnapshot,
} from "@/lib/browserModuleSnapshotCache";
import { fetchDocRecords } from "../_documents/docSaveStore";
import { warmAgentRuntimeSnapshot } from "../agent/_hooks/useAgentRuntimeData";
import { ACTIVE_INRCY_ACCOUNT_EVENT } from "@/lib/multicompte/constants";

const ROUTES_TO_PREFETCH = [
  "/dashboard",
  "/dashboard?action=publish",
  "/dashboard?stats=1",
  "/dashboard?panel=documents",
  "/dashboard/booster",
  "/dashboard/propulser",
  "/dashboard/propulser?action=recolter",
  "/dashboard/fideliser",
  "/dashboard/mails",
  "/dashboard/mails?folder=publications",
  "/dashboard/mails?folder=propulsions",
  "/dashboard/mails?folder=fidelisations",
  "/dashboard/mails?folder=mails",
  "/dashboard/crm",
  "/dashboard/agenda",
  "/dashboard/factures",
  "/dashboard/factures/new",
  "/dashboard/devis",
  "/dashboard/devis/new",
  "/dashboard/stats",
  "/dashboard/e-reputation",
  "/dashboard/gps",
  "/dashboard/agent",
  "/dashboard/mediatheque",
] as const;

const SNAPSHOT_FRESHNESS_MS = 2 * 60 * 1000;
let activeWarmup: Promise<void> | null = null;

async function fetchJson(url: string) {
  const response = await fetch(url, { method: "GET", cache: "no-store" });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

function currentAgendaRange() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const gridStart = new Date(monthStart);
  const dayFromMonday = (gridStart.getDay() + 6) % 7;
  gridStart.setDate(gridStart.getDate() - dayFromMonday);
  gridStart.setHours(0, 0, 0, 0);

  const gridEnd = new Date(monthEnd);
  const dayToSunday = (7 - gridEnd.getDay()) % 7;
  gridEnd.setDate(gridEnd.getDate() + dayToSunday + 1);
  gridEnd.setHours(0, 0, 0, 0);

  return {
    year: now.getFullYear(),
    monthIndex: now.getMonth(),
    timeMin: gridStart.toISOString(),
    timeMax: gridEnd.toISOString(),
  };
}

async function warmDefaultSnapshotsInternal() {
  const agendaRange = currentAgendaRange();
  const jobs: Array<Promise<void>> = [];

  if (!readFreshModuleSnapshot(MODULE_SNAPSHOT_KEYS.crmDefault, SNAPSHOT_FRESHNESS_MS)) {
    jobs.push(
      fetchJson("/api/crm/contacts?page=1&pageSize=20").then((data) => {
        if (data) writeModuleSnapshot(MODULE_SNAPSHOT_KEYS.crmDefault, data);
      }),
    );
  }

  if (!readFreshModuleSnapshot(MODULE_SNAPSHOT_KEYS.inrSendDefault, SNAPSHOT_FRESHNESS_MS)) {
    jobs.push(
      fetchJson("/api/inrsend/history?page=1&pageSize=20&folder=publications&boxView=sent").then((data) => {
        if (data) writeModuleSnapshot(MODULE_SNAPSHOT_KEYS.inrSendDefault, data);
      }),
    );
  }

  const agendaKey = MODULE_SNAPSHOT_KEYS.agendaMonth(agendaRange.year, agendaRange.monthIndex);
  if (!readFreshModuleSnapshot(agendaKey, SNAPSHOT_FRESHNESS_MS)) {
    const params = new URLSearchParams({ timeMin: agendaRange.timeMin, timeMax: agendaRange.timeMax });
    jobs.push(
      fetchJson(`/api/calendar/events?${params.toString()}`).then((data) => {
        if (data?.ok) writeModuleSnapshot(agendaKey, data);
      }),
    );
  }

  if (!readFreshModuleSnapshot(MODULE_SNAPSHOT_KEYS.agendaContacts, SNAPSHOT_FRESHNESS_MS)) {
    jobs.push(
      fetchJson("/api/crm/contacts?all=1&pageSize=200").then((data) => {
        if (data) writeModuleSnapshot(MODULE_SNAPSHOT_KEYS.agendaContacts, data);
      }),
    );
  }

  if (!readFreshModuleSnapshot(MODULE_SNAPSHOT_KEYS.agendaSettings, SNAPSHOT_FRESHNESS_MS)) {
    jobs.push(
      fetchJson("/api/calendar/settings").then((data) => {
        if (data) writeModuleSnapshot(MODULE_SNAPSHOT_KEYS.agendaSettings, data);
      }),
    );
  }

  if (!readFreshModuleSnapshot(MODULE_SNAPSHOT_KEYS.propulserMetrics, SNAPSHOT_FRESHNESS_MS)) {
    jobs.push(
      Promise.all([
        fetchJson("/api/propulser/metrics?days=30"),
        fetchJson("/api/loyalty/weekly-summary"),
      ]).then(([metrics, weeklySummary]) => {
        if (metrics || weeklySummary) {
          writeModuleSnapshot(MODULE_SNAPSHOT_KEYS.propulserMetrics, { metrics, weeklySummary });
        }
      }),
    );
  }

  if (!readFreshModuleSnapshot(MODULE_SNAPSHOT_KEYS.fideliserMetrics, SNAPSHOT_FRESHNESS_MS)) {
    jobs.push(
      Promise.all([
        fetchJson("/api/fideliser/metrics?days=30"),
        fetchJson("/api/loyalty/weekly-summary"),
      ]).then(([metrics, weeklySummary]) => {
        if (metrics || weeklySummary) {
          writeModuleSnapshot(MODULE_SNAPSHOT_KEYS.fideliserMetrics, { metrics, weeklySummary });
        }
      }),
    );
  }

  if (!readFreshModuleSnapshot(MODULE_SNAPSHOT_KEYS.facturesList, SNAPSHOT_FRESHNESS_MS)) {
    jobs.push(
      fetchDocRecords("facture").then((docs) => {
        writeModuleSnapshot(MODULE_SNAPSHOT_KEYS.facturesList, { docs, storageMode: "supabase" as const });
      }).catch(() => undefined),
    );
  }

  if (!readFreshModuleSnapshot(MODULE_SNAPSHOT_KEYS.devisList, SNAPSHOT_FRESHNESS_MS)) {
    jobs.push(
      fetchDocRecords("devis").then((docs) => {
        writeModuleSnapshot(MODULE_SNAPSHOT_KEYS.devisList, { docs, storageMode: "supabase" as const });
      }).catch(() => undefined),
    );
  }

  if (!readFreshModuleSnapshot(MODULE_SNAPSHOT_KEYS.mediaLibraryDefault, 90 * 1000)) {
    jobs.push(
      fetchJson("/api/media-library/items?limit=180&type=all&active=active").then((data) => {
        if (Array.isArray(data?.items)) {
          writeModuleSnapshot(MODULE_SNAPSHOT_KEYS.mediaLibraryDefault, {
            items: data.items,
            stats: data.stats ?? { total: data.items.length, images: 0, videos: 0, total_bytes: 0 },
          });
        }
      }),
    );
  }

  jobs.push(warmAgentRuntimeSnapshot());

  await Promise.allSettled(jobs);
}

function warmDefaultSnapshots() {
  if (activeWarmup) return activeWarmup;
  activeWarmup = warmDefaultSnapshotsInternal().finally(() => {
    activeWarmup = null;
  });
  return activeWarmup;
}

export default function DashboardToolWarmup() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    // Next prépare immédiatement les bundles des outils : le premier clic ne
    // reste plus sans réponse pendant le chargement de la route.
    ROUTES_TO_PREFETCH.forEach((route) => router.prefetch(route));

    const runWarmup = () => {
      if (cancelled) return;
      void warmDefaultSnapshots();
    };

    runWarmup();
    const onVisible = () => {
      if (document.visibilityState === "visible") runWarmup();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(ACTIVE_INRCY_ACCOUNT_EVENT, runWarmup);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(ACTIVE_INRCY_ACCOUNT_EVENT, runWarmup);
    };
  }, [router]);

  return null;
}

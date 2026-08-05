import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { readAccountCacheValue, writeAccountCacheValue } from "@/lib/browserAccountCache";
import { ACTIVE_INRCY_ACCOUNT_EVENT } from "@/lib/multicompte/constants";
import { getSimpleFrenchApiError, getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import type { NotificationItem } from "../dashboard.types";

const DASHBOARD_NOTIFICATIONS_CACHE_KEY = "inrcy_dashboard_notifications_v1";

type CachedNotifications = {
  items: NotificationItem[];
  totalCount: number;
};

function readCachedNotifications(): CachedNotifications {
  try {
    const raw = readAccountCacheValue(DASHBOARD_NOTIFICATIONS_CACHE_KEY);
    if (!raw) return { items: [], totalCount: 0 };
    const parsed = JSON.parse(raw) as { items?: unknown; totalCount?: unknown };
    const items = Array.isArray(parsed?.items)
      ? parsed.items.filter(
          (item): item is NotificationItem =>
            Boolean(item) && typeof item === "object" && typeof (item as NotificationItem).id === "string",
        )
      : [];
    const rawTotalCount = Number(parsed?.totalCount);
    return {
      items,
      totalCount: Number.isFinite(rawTotalCount)
        ? Math.max(0, Math.round(rawTotalCount))
        : items.length,
    };
  } catch {
    return { items: [], totalCount: 0 };
  }
}

function writeCachedNotifications(items: NotificationItem[], totalCount: number) {
  try {
    writeAccountCacheValue(
      DASHBOARD_NOTIFICATIONS_CACHE_KEY,
      JSON.stringify({
        items,
        totalCount: Math.max(0, Math.round(totalCount)),
        syncedAt: Date.now(),
      }),
    );
  } catch {
    // Le cache visuel ne doit jamais bloquer les notifications.
  }
}

export function useDashboardNotifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>(
    () => readCachedNotifications().items,
  );
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [notificationsCount, setNotificationsCount] = useState(
    () => readCachedNotifications().totalCount,
  );
  const unreadNotificationsCount = useMemo(
    () => notifications.filter((item) => item.unread).length,
    [notifications],
  );
  const notificationsRequestSeqRef = useRef(0);

  const applyNotifications = useCallback(
    (items: NotificationItem[], totalCount: number, persist = true) => {
      const safeCount = Math.max(0, Math.round(totalCount));
      setNotifications(items);
      setNotificationsCount(safeCount);
      if (persist) writeCachedNotifications(items, safeCount);
    },
    [],
  );

  const refreshNotifications = useCallback(async () => {
    const requestSeq = ++notificationsRequestSeqRef.current;
    try {
      setNotificationsLoading(true);
      const res = await fetch("/api/notifications/feed?limit=12", { credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(await getSimpleFrenchApiError(res));
      if (requestSeq !== notificationsRequestSeqRef.current) return;
      const nextItems = Array.isArray(json?.items) ? json.items : [];
      const rawTotalCount = Number(json?.totalCount);
      applyNotifications(
        nextItems,
        Number.isFinite(rawTotalCount) ? rawTotalCount : nextItems.length,
      );
      setNotificationsError(null);
    } catch (e: unknown) {
      if (requestSeq !== notificationsRequestSeqRef.current) return;
      setNotificationsError(getSimpleFrenchErrorMessage(e, "Impossible de charger les notifications pour le moment."));
    } finally {
      if (requestSeq === notificationsRequestSeqRef.current) {
        setNotificationsLoading(false);
      }
    }
  }, [applyNotifications]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    const run = () => {
      if (cancelled || document.hidden) return;
      void refreshNotifications();
    };
    const stopPolling = () => {
      if (timer == null) return;
      window.clearInterval(timer);
      timer = null;
    };
    const startPolling = () => {
      if (timer != null || document.hidden) return;
      timer = window.setInterval(run, 120_000);
    };
    const onFocus = () => run();
    const onVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
        return;
      }
      run();
      startPolling();
    };
    const onActiveAccountChange = () => {
      notificationsRequestSeqRef.current += 1;
      const cached = readCachedNotifications();
      applyNotifications(cached.items, cached.totalCount, false);
      run();
    };

    if (!document.hidden) {
      run();
      startPolling();
    }
    window.addEventListener("focus", onFocus);
    window.addEventListener(ACTIVE_INRCY_ACCOUNT_EVENT, onActiveAccountChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      stopPolling();
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(ACTIVE_INRCY_ACCOUNT_EVENT, onActiveAccountChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [applyNotifications, refreshNotifications]);

  const markNotificationRead = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(await getSimpleFrenchApiError(res, "Impossible de traiter cette notification."));
      const nextItems = notifications.filter((item) => item.id !== id);
      applyNotifications(nextItems, Math.max(0, notificationsCount - 1));
      setNotificationsError(null);
    } catch (e: unknown) {
      setNotificationsError(getSimpleFrenchErrorMessage(e, "Impossible de traiter cette notification pour le moment."));
    }
  }, [applyNotifications, notifications, notificationsCount]);

  const markAllNotificationsRead = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/mark-all-read", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(await getSimpleFrenchApiError(res, "Impossible de traiter toutes les notifications."));
      applyNotifications([], 0);
      setNotificationsError(null);
    } catch (e: unknown) {
      setNotificationsError(getSimpleFrenchErrorMessage(e, "Impossible de traiter toutes les notifications pour le moment."));
    }
  }, [applyNotifications]);

  const deleteNotification = useCallback(async (id: string) => {
    const previousItems = notifications;
    const previousCount = notificationsCount;
    const nextItems = previousItems.filter((item) => item.id !== id);
    applyNotifications(nextItems, Math.max(0, previousCount - 1));
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error(await getSimpleFrenchApiError(res, "Impossible de supprimer cette notification."));
    } catch {
      applyNotifications(previousItems, previousCount);
    }
  }, [applyNotifications, notifications, notificationsCount]);

  return {
    notifications,
    notificationsLoading,
    notificationsError,
    unreadNotificationsCount,
    notificationsCount,
    refreshNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
  };
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getSimpleFrenchApiError, getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import type { NotificationItem } from "../dashboard.types";

export function useDashboardNotifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [notificationsCount, setNotificationsCount] = useState(0);
  const unreadNotificationsCount = useMemo(() => notifications.filter((item) => item.unread).length, [notifications]);
  const notificationsRequestSeqRef = useRef(0);

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
      setNotifications(nextItems);
      setNotificationsCount(Number.isFinite(rawTotalCount) ? Math.max(0, Math.round(rawTotalCount)) : nextItems.length);
      setNotificationsError(null);
    } catch (e: unknown) {
      if (requestSeq !== notificationsRequestSeqRef.current) return;
      setNotificationsError(getSimpleFrenchErrorMessage(e, "Impossible de charger les notifications pour le moment."));
    } finally {
      if (requestSeq === notificationsRequestSeqRef.current) {
        setNotificationsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      void refreshNotifications();
    };
    const onFocus = () => run();
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };

    run();
    const timer = window.setInterval(run, 120000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshNotifications]);

  const markNotificationRead = useCallback(async (id: string) => {
    setNotifications((current) => current.map((item) => (item.id === id ? { ...item, unread: false } : item)));
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "POST", credentials: "include" });
    } catch {}
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    setNotifications((current) => current.map((item) => ({ ...item, unread: false })));
    try {
      await fetch("/api/notifications/mark-all-read", { method: "POST", credentials: "include" });
    } catch {}
  }, []);

  const deleteNotification = useCallback(async (id: string) => {
    const previous = notifications;
    setNotifications((current) => current.filter((item) => item.id !== id));
    setNotificationsCount((current) => Math.max(0, current - 1));
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error(await getSimpleFrenchApiError(res, "Impossible de supprimer cette notification."));
    } catch {
      setNotifications(previous);
      setNotificationsCount((current) => Math.max(current, previous.length));
    }
  }, [notifications]);

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

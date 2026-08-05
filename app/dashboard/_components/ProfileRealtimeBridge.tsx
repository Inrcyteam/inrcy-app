"use client";

import { useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabaseClient";
import {
  PROFILE_VERSION_EVENT,
  PROFILE_VERSION_FIELDS,
  getChangedProfileVersionFields,
  toProfileVersionsSnapshot,
  type ProfileVersionChangeDetail,
  type ProfileVersionsSnapshot,
} from "@/lib/profileVersioning";

const PROFILE_VERSION_FOCUS_THROTTLE_MS = 10_000;
const PROFILE_VERSION_POLL_MS = 60_000;
const PROFILE_VERSION_EVENT_COALESCE_MS = 750;

export default function ProfileRealtimeBridge() {
  const versionsRef = useRef<ProfileVersionsSnapshot | null>(null);
  const lastServerCheckAtRef = useRef(0);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const pendingChangesRef = useRef(
    new Map<ProfileVersionChangeDetail["field"], ProfileVersionChangeDetail>(),
  );
  const dispatchTimerRef = useRef<number | null>(null);

  const flushPendingChanges = useCallback(() => {
    dispatchTimerRef.current = null;
    const changes = Array.from(pendingChangesRef.current.values());
    pendingChangesRef.current.clear();

    for (const change of changes) {
      window.dispatchEvent(
        new CustomEvent(PROFILE_VERSION_EVENT, { detail: change }),
      );
    }
  }, []);

  const dispatchChanges = useCallback((nextRaw: unknown) => {
    const incoming = toProfileVersionsSnapshot(nextRaw);
    const previous = versionsRef.current;
    const next = previous
      ? Object.fromEntries(
          PROFILE_VERSION_FIELDS.map((field) => [
            field,
            Math.max(previous[field], incoming[field]),
          ]),
        ) as ProfileVersionsSnapshot
      : incoming;
    versionsRef.current = next;
    if (!previous) return;

    const changes = getChangedProfileVersionFields(previous, next);
    for (const change of changes) {
      const pending = pendingChangesRef.current.get(change.field);
      pendingChangesRef.current.set(
        change.field,
        pending
          ? { ...change, previousValue: pending.previousValue }
          : change,
      );
    }

    if (changes.length > 0 && dispatchTimerRef.current == null) {
      dispatchTimerRef.current = window.setTimeout(
        flushPendingChanges,
        PROFILE_VERSION_EVENT_COALESCE_MS,
      );
    }
  }, [flushPendingChanges]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let userId: string | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const loadVersions = async () => {
      const response = await fetch("/api/profile/versions", {
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent("inrcy:auth-session-invalid"));
        return null;
      }
      if (!response.ok) return null;

      const payload = (await response.json().catch(() => null)) as {
        user_id?: string;
        versions?: unknown;
      } | null;
      const nextUserId = String(payload?.user_id || "").trim();
      return nextUserId
        ? { userId: nextUserId, versions: payload?.versions || {} }
        : null;
    };

    const refreshVersionsFromServer = async (force = false) => {
      if (!userId || cancelled) return;
      const now = Date.now();
      if (!force && now - lastServerCheckAtRef.current < PROFILE_VERSION_FOCUS_THROTTLE_MS) return;
      if (refreshPromiseRef.current) {
        await refreshPromiseRef.current;
        return;
      }

      const job: Promise<void> = (async () => {
        lastServerCheckAtRef.current = now;
        const snapshot = await loadVersions();

        if (!cancelled && snapshot?.userId === userId) {
          dispatchChanges(snapshot.versions);
        }
      })().catch(() => {});

      refreshPromiseRef.current = job;
      try {
        await job;
      } finally {
        refreshPromiseRef.current = null;
      }
    };

    const handleFocus = () => {
      void refreshVersionsFromServer(false);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshVersionsFromServer(false);
      }
    };

    const boot = async () => {
      const snapshot = await loadVersions();
      if (!snapshot || cancelled) return;
      userId = snapshot.userId;
      versionsRef.current = toProfileVersionsSnapshot(snapshot.versions);

      channel = supabase
        .channel(`inrcy-profile-versions:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "profiles",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            dispatchChanges(payload.new ?? payload.old ?? null);
          },
        )
        .subscribe();

      window.addEventListener("focus", handleFocus);
      document.addEventListener("visibilitychange", handleVisibility);
    };

    const pollId = window.setInterval(() => {
      void refreshVersionsFromServer(false);
    }, PROFILE_VERSION_POLL_MS);

    void boot();

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      if (dispatchTimerRef.current != null) {
        window.clearTimeout(dispatchTimerRef.current);
        dispatchTimerRef.current = null;
      }
      pendingChangesRef.current.clear();
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [dispatchChanges]);

  return null;
}

"use client";

import { useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabaseClient";
import {
  PROFILE_VERSION_EVENT,
  PROFILE_VERSION_FIELDS,
  getChangedProfileVersionFields,
  toProfileVersionsSnapshot,
  type ProfileVersionsSnapshot,
} from "@/lib/profileVersioning";

const PROFILE_VERSION_FOCUS_THROTTLE_MS = 10_000;
const PROFILE_VERSION_POLL_MS = 60_000;

export default function ProfileRealtimeBridge() {
  const versionsRef = useRef<ProfileVersionsSnapshot | null>(null);
  const lastServerCheckAtRef = useRef(0);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);

  const dispatchChanges = useCallback((nextRaw: unknown) => {
    const next = toProfileVersionsSnapshot(nextRaw);
    const previous = versionsRef.current;
    versionsRef.current = next;
    if (!previous) return;

    const changes = getChangedProfileVersionFields(previous, next);
    for (const change of changes) {
      window.dispatchEvent(new CustomEvent(PROFILE_VERSION_EVENT, { detail: change }));
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let userId: string | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

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
        const { data: profileRow } = await supabase
          .from("profiles")
          .select(PROFILE_VERSION_FIELDS.join(","))
          .eq("user_id", userId)
          .maybeSingle();

        if (!cancelled) {
          dispatchChanges(profileRow);
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
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || cancelled) return;
      userId = user.id;

      const { data: profileRow } = await supabase
        .from("profiles")
        .select(PROFILE_VERSION_FIELDS.join(","))
        .eq("user_id", user.id)
        .maybeSingle();

      versionsRef.current = toProfileVersionsSnapshot(profileRow);
      if (cancelled) return;

      channel = supabase
        .channel(`inrcy-profile-versions:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "profiles",
            filter: `user_id=eq.${user.id}`,
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
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [dispatchChanges]);

  return null;
}

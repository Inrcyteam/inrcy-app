"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabaseClient";
import {
  PROFILE_VERSION_EVENT,
  PROFILE_VERSION_FIELDS,
  getChangedProfileVersionFields,
  toProfileVersionsSnapshot,
  type ProfileVersionsSnapshot,
} from "@/lib/profileVersioning";

export default function ProfileRealtimeBridge() {
  const versionsRef = useRef<ProfileVersionsSnapshot | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const dispatchChanges = (nextRaw: unknown) => {
      const next = toProfileVersionsSnapshot(nextRaw);
      const previous = versionsRef.current;
      versionsRef.current = next;
      if (!previous) return;

      const changes = getChangedProfileVersionFields(previous, next);
      for (const change of changes) {
        window.dispatchEvent(new CustomEvent(PROFILE_VERSION_EVENT, { detail: change }));
      }
    };

    const boot = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || cancelled) return;

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
    };

    void boot();

    return () => {
      cancelled = true;
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, []);

  return null;
}

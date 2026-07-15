"use client";

import { resolveActiveBrowserUserId } from "@/lib/browserAccountCache";
import { invalidateBoosterGenerationContextClient } from "@/lib/boosterGenerationContextClient";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  APP_LANGUAGE_EVENT,
  APP_LANGUAGE_STORAGE_KEY,
  DEFAULT_APP_LANGUAGE,
  type AppLanguageCode,
  normalizeAppLanguage,
} from "@/lib/appLanguage";
import { createClient } from "@/lib/supabaseClient";

type LanguageEventDetail = {
  language?: unknown;
  appLanguage?: unknown;
};

function readLocalLanguage(): AppLanguageCode {
  if (typeof window === "undefined") return DEFAULT_APP_LANGUAGE;
  try {
    return normalizeAppLanguage(window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY));
  } catch {
    return DEFAULT_APP_LANGUAGE;
  }
}

function writeLocalLanguage(language: AppLanguageCode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Le stockage local ne doit jamais bloquer l'interface.
  }
}

function broadcastLanguage(language: AppLanguageCode) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(APP_LANGUAGE_EVENT, {
    detail: { language, appLanguage: language },
  }));
}

function resolveEventLanguage(detail: unknown): AppLanguageCode | null {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null;
  const eventDetail = detail as LanguageEventDetail;
  const raw = eventDetail.appLanguage ?? eventDetail.language;
  if (!raw) return null;
  return normalizeAppLanguage(raw);
}

export function useDashboardLanguage() {
  const [language, setLanguageState] = useState<AppLanguageCode>(DEFAULT_APP_LANGUAGE);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    const localLanguage = readLocalLanguage();
    setLanguageState(localLanguage);

    const loadDbLanguage = async () => {
      try {
        const supabase = createClient();
        const { data: authData } = await supabase.auth.getUser();
        const user = authData?.user;
        if (!user) return;

        const { data, error } = await supabase
          .from("business_profiles")
          .select("app_language")
          .eq("user_id", resolveActiveBrowserUserId(user.id))
          .maybeSingle();
        if (error) return;

        const rawDbLanguage = String(data?.app_language || "").trim();
        if (!rawDbLanguage) return;

        const dbLanguage = normalizeAppLanguage(rawDbLanguage);
        writeLocalLanguage(dbLanguage);
        if (mountedRef.current) setLanguageState(dbLanguage);
      } catch {
        // Fallback local/français : aucun blocage si Supabase est indisponible.
      }
    };

    void loadDbLanguage();

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== APP_LANGUAGE_STORAGE_KEY) return;
      setLanguageState(normalizeAppLanguage(event.newValue));
    };

    const handleAppLanguage = (event: Event) => {
      const nextLanguage = resolveEventLanguage((event as CustomEvent).detail);
      if (!nextLanguage) return;
      writeLocalLanguage(nextLanguage);
      setLanguageState(nextLanguage);
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(APP_LANGUAGE_EVENT, handleAppLanguage);

    return () => {
      mountedRef.current = false;
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(APP_LANGUAGE_EVENT, handleAppLanguage);
    };
  }, []);

  const setLanguage = useCallback(async (nextLanguageValue: AppLanguageCode | string) => {
    const nextLanguage = normalizeAppLanguage(nextLanguageValue);
    setLanguageState(nextLanguage);
    writeLocalLanguage(nextLanguage);
    broadcastLanguage(nextLanguage);

    try {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) return;

      const { error } = await supabase.from("business_profiles").upsert(
        {
          user_id: resolveActiveBrowserUserId(user.id),
          app_language: nextLanguage,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) throw error;
      await invalidateBoosterGenerationContextClient("professional");
    } catch {
      // Le choix reste actif localement même si la sauvegarde distante échoue.
    }
  }, []);

  return { language, setLanguage };
}

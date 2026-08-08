"use client";

import {
  getActiveBrowserUserId,
  resolveActiveBrowserUserId,
} from "@/lib/browserAccountCache";
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

const DB_LANGUAGE_CACHE_TTL_MS = 5 * 60_000;
const dbLanguageCache = new Map<
  string,
  { language: AppLanguageCode | null; expiresAt: number }
>();
const dbLanguageRequests = new Map<
  string,
  Promise<AppLanguageCode | null>
>();
let fallbackAuthUserId: string | null = null;
let authUserIdRequest: Promise<string | null> | null = null;

async function resolveDashboardAccountId(): Promise<string | null> {
  const activeAccountId = getActiveBrowserUserId();
  if (activeAccountId) return activeAccountId;
  if (fallbackAuthUserId) return fallbackAuthUserId;
  if (authUserIdRequest) return authUserIdRequest;

  authUserIdRequest = (async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    const authUserId = String(data?.user?.id || "").trim();
    fallbackAuthUserId = authUserId || null;
    return fallbackAuthUserId;
  })().finally(() => {
    authUserIdRequest = null;
  });
  return authUserIdRequest;
}

async function loadSharedDbLanguage(): Promise<AppLanguageCode | null> {
  const accountId = await resolveDashboardAccountId();
  if (!accountId) return null;

  const cached = dbLanguageCache.get(accountId);
  if (cached && cached.expiresAt > Date.now()) return cached.language;

  const activeRequest = dbLanguageRequests.get(accountId);
  if (activeRequest) return activeRequest;

  const request = (async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("business_profiles")
      .select("app_language")
      .eq("user_id", accountId)
      .maybeSingle();
    if (error) return null;

    const rawDbLanguage = String(data?.app_language || "").trim();
    const dbLanguage = rawDbLanguage
      ? normalizeAppLanguage(rawDbLanguage)
      : null;
    dbLanguageCache.set(accountId, {
      language: dbLanguage,
      expiresAt: Date.now() + DB_LANGUAGE_CACHE_TTL_MS,
    });
    return dbLanguage;
  })().finally(() => {
    dbLanguageRequests.delete(accountId);
  });

  dbLanguageRequests.set(accountId, request);
  return request;
}

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
        const dbLanguage = await loadSharedDbLanguage();
        if (!dbLanguage) return;
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

      const accountId = resolveActiveBrowserUserId(user.id);

      const { error } = await supabase.from("business_profiles").upsert(
        {
          user_id: accountId,
          app_language: nextLanguage,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) throw error;
      dbLanguageCache.set(accountId, {
        language: nextLanguage,
        expiresAt: Date.now() + DB_LANGUAGE_CACHE_TTL_MS,
      });
      await invalidateBoosterGenerationContextClient("professional");
    } catch {
      // Le choix reste actif localement même si la sauvegarde distante échoue.
    }
  }, []);

  return { language, setLanguage };
}

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { resolveActiveBrowserUserId } from "@/lib/browserAccountCache";
import {
  DEFAULT_AI_PREFERRED_ENGINE,
  getAiPreferredEngineFromBusiness,
  type AiPreferredEngine,
} from "@/lib/aiEnginePreference";

export function useTemplateAiEngine() {
  const [defaultEngine, setDefaultEngine] = useState<AiPreferredEngine>(DEFAULT_AI_PREFERRED_ENGINE);
  const [engine, setEngine] = useState<AiPreferredEngine>(DEFAULT_AI_PREFERRED_ENGINE);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data: authData } = await supabase.auth.getUser();
        const user = authData?.user;
        if (!user) return;
        const activeUserId = resolveActiveBrowserUserId(user.id);
        const [{ data: profile }, { data: business }] = await Promise.all([
          supabase.from("profiles").select("*").eq("user_id", activeUserId).maybeSingle(),
          supabase.from("business_profiles").select("*").eq("user_id", activeUserId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        ]);
        if (cancelled) return;
        const resolved = getAiPreferredEngineFromBusiness({ ...(profile || {}), ...(business || {}) });
        setDefaultEngine(resolved);
        setEngine(resolved);
      } catch {
        // Le moteur OpenAI reste le repli sûr si le profil n'est pas lisible.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { engine, setEngine, defaultEngine };
}

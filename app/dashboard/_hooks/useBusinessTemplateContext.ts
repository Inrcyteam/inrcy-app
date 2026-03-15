"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { decodeBusinessSector, type ActivitySectorCategory } from "@/lib/activitySectors";

export function useBusinessTemplateContext() {
  const [sectorCategory, setSectorCategory] = useState<ActivitySectorCategory | null>(null);
  const [profession, setProfession] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const supabase = createClient();
        const { data: authData } = await supabase.auth.getUser();
        const user = authData?.user;
        if (!user) return;

        const { data } = await supabase
          .from("business_profiles")
          .select("sector")
          .eq("user_id", user.id)
          .maybeSingle();

        if (cancelled) return;
        const rawSector = String((data as any)?.sector ?? "").trim();
        if (!rawSector) {
          setSectorCategory(null);
          setProfession("");
          return;
        }

        const decoded = decodeBusinessSector(rawSector);
        setSectorCategory(decoded.sectorCategory);
        setProfession(decoded.profession);
      } catch {
        if (cancelled) return;
        setSectorCategory(null);
        setProfession("");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { sectorCategory, profession };
}

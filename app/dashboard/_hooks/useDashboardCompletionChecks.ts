"use client";

import { resolveActiveBrowserUserId } from "@/lib/browserAccountCache";

import { useCallback, useEffect, useState } from "react";
import { decodeBusinessSector } from "@/lib/activitySectors";
import { createClient } from "@/lib/supabaseClient";
import { combineOpeningSchedule } from "@/lib/openingSchedule";

const REQUIRED_PROFILE_FIELDS = [
  "first_name",
  "last_name",
  "phone",
  "contact_email",
  "company_legal_name",
  "hq_address",
  "hq_zip",
  "hq_city",
  "hq_country",
  "siren",
  "rcs_city",
] as const;

const REQUIRED_ACTIVITY_FIELDS = [
  "services",
  "intervention_zones",
  "strengths",
  "customer_typologies",
] as const;

type CompletionSnapshot = {
  profile: Record<string, unknown> | null;
  business: Record<string, unknown> | null;
};

// DashboardClient et ResponsiveBottomNav utilisent tous deux ce hook. Une
// seule lecture groupée évite de lancer deux fois le même appel Supabase au
// démarrage et supprime le warning N+1 observé dans Sentry.
let inFlightCompletionCheck: Promise<CompletionSnapshot> | null = null;

async function loadCompletionSnapshot(): Promise<CompletionSnapshot> {
  if (inFlightCompletionCheck) return inFlightCompletionCheck;

  const request = (async () => {
    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user) return { profile: null, business: null };

    const activeUserId = resolveActiveBrowserUserId(user.id);
    const [profileRes, businessRes] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "first_name,last_name,phone,contact_email,company_legal_name,hq_address,hq_zip,hq_city,hq_country,siren,rcs_city",
        )
        .eq("user_id", activeUserId)
        .maybeSingle(),
      supabase
        .from("business_profiles")
        .select("sector,opening_days,opening_hours,services,intervention_zones,strengths,customer_typologies")
        .eq("user_id", activeUserId)
        .maybeSingle(),
    ]);

    return {
      profile: (profileRes.data as Record<string, unknown> | null) ?? null,
      business: (businessRes.data as Record<string, unknown> | null) ?? null,
    };
  })();

  inFlightCompletionCheck = request;
  try {
    return await request;
  } finally {
    if (inFlightCompletionCheck === request) inFlightCompletionCheck = null;
  }
}

export function useDashboardCompletionChecks() {
  const [profileIncomplete, setProfileIncomplete] = useState(false);
  const [activityIncomplete, setActivityIncomplete] = useState(false);
  const [profileCheckReady, setProfileCheckReady] = useState(false);
  const [activityCheckReady, setActivityCheckReady] = useState(false);

  const checkProfile = useCallback(async () => {
    const { profile } = await loadCompletionSnapshot();
    if (!profile) {
      setProfileIncomplete(true);
      setProfileCheckReady(true);
      return;
    }

    const incomplete = REQUIRED_PROFILE_FIELDS.some((field) => {
      const value = profile[field];
      return !value || String(value).trim() === "";
    });

    setProfileIncomplete(incomplete);
    setProfileCheckReady(true);
  }, []);

  const checkActivity = useCallback(async () => {
    const { business } = await loadCompletionSnapshot();
    if (!business) {
      setActivityIncomplete(true);
      setActivityCheckReady(true);
      return;
    }

    const businessRecord = business;
    const decodedSector = decodeBusinessSector(
      String(businessRecord.sector ?? ""),
    );
    const hasSectorCategory = !!decodedSector.sectorCategory;
    const hasProfession = decodedSector.profession.trim().length > 0;

    const hasOpeningSchedule =
      combineOpeningSchedule(
        businessRecord.opening_days,
        businessRecord.opening_hours,
      ).length > 0;

    const incomplete =
      !hasSectorCategory ||
      !hasProfession ||
      !hasOpeningSchedule ||
      REQUIRED_ACTIVITY_FIELDS.some((field) => {
        const value = businessRecord[field];
        if (Array.isArray(value)) return value.filter(Boolean).length === 0;
        return !value || String(value).trim() === "";
      });

    setActivityIncomplete(incomplete);
    setActivityCheckReady(true);
  }, []);

  useEffect(() => {
    void checkProfile().catch(() => {
      setProfileIncomplete(true);
      setProfileCheckReady(true);
    });
    void checkActivity().catch(() => {
      setActivityIncomplete(true);
      setActivityCheckReady(true);
    });
  }, [checkProfile, checkActivity]);

  return {
    profileIncomplete,
    activityIncomplete,
    profileCheckReady,
    activityCheckReady,
    checkProfile,
    checkActivity,
  };
}

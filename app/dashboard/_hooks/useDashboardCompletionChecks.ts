"use client";

import { useCallback, useEffect, useState } from "react";
import { decodeBusinessSector } from "@/lib/activitySectors";
import { createClient } from "@/lib/supabaseClient";

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
  "opening_days",
  "opening_hours",
  "strengths",
  "customer_typologies",
] as const;

export function useDashboardCompletionChecks() {
  const [profileIncomplete, setProfileIncomplete] = useState(false);
  const [activityIncomplete, setActivityIncomplete] = useState(false);
  const [profileCheckReady, setProfileCheckReady] = useState(false);
  const [activityCheckReady, setActivityCheckReady] = useState(false);

  const checkProfile = useCallback(async () => {
    const supabase = createClient();

    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user) {
      setProfileIncomplete(true);
      setProfileCheckReady(true);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "first_name,last_name,phone,contact_email,company_legal_name,hq_address,hq_zip,hq_city,hq_country,siren,rcs_city",
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) {
      setProfileIncomplete(true);
      setProfileCheckReady(true);
      return;
    }

    const incomplete = REQUIRED_PROFILE_FIELDS.some((field) => {
      const value = (profile as Record<string, unknown>)[field];
      return !value || String(value).trim() === "";
    });

    setProfileIncomplete(incomplete);
    setProfileCheckReady(true);
  }, []);

  const checkActivity = useCallback(async () => {
    const supabase = createClient();

    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user) {
      setActivityIncomplete(true);
      setActivityCheckReady(true);
      return;
    }

    const { data: business } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!business) {
      setActivityIncomplete(true);
      setActivityCheckReady(true);
      return;
    }

    const businessRecord = business as Record<string, unknown>;
    const decodedSector = decodeBusinessSector(
      String(businessRecord.sector ?? ""),
    );
    const hasSectorCategory = !!decodedSector.sectorCategory;
    const hasProfession = decodedSector.profession.trim().length > 0;

    const incomplete =
      !hasSectorCategory ||
      !hasProfession ||
      REQUIRED_ACTIVITY_FIELDS.some((field) => {
        const value = businessRecord[field];
        if (Array.isArray(value)) return value.filter(Boolean).length === 0;
        return !value || String(value).trim() === "";
      });

    setActivityIncomplete(incomplete);
    setActivityCheckReady(true);
  }, []);

  useEffect(() => {
    void checkProfile();
    void checkActivity();
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

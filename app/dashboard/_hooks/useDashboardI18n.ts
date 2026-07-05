"use client";

import { useMemo } from "react";

import { getDashboardTranslations } from "@/lib/dashboardI18n";
import { useDashboardLanguage } from "./useDashboardLanguage";

export function useDashboardI18n() {
  const { language } = useDashboardLanguage();
  return useMemo(() => getDashboardTranslations(language), [language]);
}

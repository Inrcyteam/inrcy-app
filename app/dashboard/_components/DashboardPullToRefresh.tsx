"use client";

import { useCallback } from "react";
import PullToRefresh from "@/app/_components/PullToRefresh";
import { useDashboardUnsavedNavigation } from "./DashboardUnsavedNavigationProvider";

export default function DashboardPullToRefresh() {
  const { requestNavigation } = useDashboardUnsavedNavigation();

  const confirmRefresh = useCallback(
    () => requestNavigation(() => undefined),
    [requestNavigation],
  );

  return <PullToRefresh beforeRefresh={confirmRefresh} />;
}

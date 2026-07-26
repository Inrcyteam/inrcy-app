"use client";

import { createContext, useContext, type ReactNode } from "react";

const DashboardRequiredSetupBypassContext = createContext<boolean>(false);

export function DashboardRequiredSetupBypassProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  return (
    <DashboardRequiredSetupBypassContext.Provider value={enabled}>
      {children}
    </DashboardRequiredSetupBypassContext.Provider>
  );
}

export function useDashboardRequiredSetupBypass() {
  return useContext(DashboardRequiredSetupBypassContext);
}

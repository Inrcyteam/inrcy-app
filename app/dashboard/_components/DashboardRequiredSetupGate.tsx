"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { isDashboardRequiredSetupProtectedLocation } from "@/lib/dashboardRequiredSetupAccess";
import { useDashboardCompletionChecks } from "../_hooks/useDashboardCompletionChecks";
import { StableBootScreen } from "./ClientHydrationGate";

export default function DashboardRequiredSetupGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { completionCheckReady, requiredSetupCompleted } = useDashboardCompletionChecks();

  const protectedDestination = useMemo(
    () => isDashboardRequiredSetupProtectedLocation(pathname, searchParams),
    [pathname, searchParams],
  );

  useEffect(() => {
    if (!protectedDestination || !completionCheckReady || requiredSetupCompleted) return;
    router.replace("/dashboard");
  }, [completionCheckReady, protectedDestination, requiredSetupCompleted, router]);

  if (protectedDestination && (!completionCheckReady || !requiredSetupCompleted)) {
    return <StableBootScreen label="Vérification de votre configuration..." />;
  }

  return <>{children}</>;
}

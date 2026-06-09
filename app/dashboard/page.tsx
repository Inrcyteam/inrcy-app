import { Suspense } from "react";
import DashboardClient from "./DashboardClient";
import ClientHydrationGate from "./_components/ClientHydrationGate";
import { getMyRole } from "@/lib/roles";

export default async function Page() {
  const { isAdmin } = await getMyRole();

  return (
    <Suspense fallback={null}>
      <ClientHydrationGate label="Chargement de votre tableau de bord...">
        <DashboardClient isAdmin={isAdmin} />
      </ClientHydrationGate>
    </Suspense>
  );
}

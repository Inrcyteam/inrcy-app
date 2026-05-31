import { Suspense } from "react";
import DashboardClient from "./DashboardClient";
import ClientHydrationGate from "./_components/ClientHydrationGate";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ClientHydrationGate label="Chargement de votre tableau de bord...">
        <DashboardClient />
      </ClientHydrationGate>
    </Suspense>
  );
}

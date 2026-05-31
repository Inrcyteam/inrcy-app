import StatsClient from "./StatsClient";
import ClientHydrationGate from "../_components/ClientHydrationGate";

export default function Page() {
  return (
    <ClientHydrationGate label="Chargement de vos statistiques...">
      <StatsClient />
    </ClientHydrationGate>
  );
}

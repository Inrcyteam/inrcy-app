import { requireDashboardRequiredSetupCompleted } from "@/lib/dashboardRequiredSetupServer";

export default async function EReputationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireDashboardRequiredSetupCompleted();
  return children;
}

import { redirect } from "next/navigation";

// Alias route : on conserve /dashboard/agenda pour compat,
// mais on expose /dashboard/interventions pour la logique métier.
export default function InterventionsPage() {
  redirect("/dashboard/agenda");
}

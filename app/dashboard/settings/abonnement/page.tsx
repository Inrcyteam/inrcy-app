import { redirect } from "next/navigation";

export default function AbonnementPage() {
  redirect("/dashboard?panel=abonnement&panelSource=settings");
}

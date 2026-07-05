import { redirect } from "next/navigation";

export default function IaSettingsPage() {
  redirect("/dashboard?panel=ia&panelSource=settings");
}

import { redirect } from "next/navigation";

export default function PreferencesSettingsPage() {
  redirect("/dashboard?panel=preferences&panelSource=settings");
}

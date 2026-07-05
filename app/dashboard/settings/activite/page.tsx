import { redirect } from "next/navigation";

export default function ActivitePage() {
  redirect("/dashboard?panel=activite&panelSource=settings");
}

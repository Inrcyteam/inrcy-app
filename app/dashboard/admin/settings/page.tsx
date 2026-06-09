import { redirect } from "next/navigation";
import { getMyRole } from "@/lib/roles";
import AdminSettingsClient from "./AdminSettingsClient";

export default async function AdminSettingsPage() {
  const { isAdmin } = await getMyRole();
  if (!isAdmin) redirect("/dashboard");

  return <AdminSettingsClient />;
}

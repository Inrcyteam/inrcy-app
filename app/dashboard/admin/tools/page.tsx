import { redirect } from "next/navigation";
import { getMyRole } from "@/lib/roles";
import AdminToolsClient from "./AdminToolsClient";

export default async function AdminToolsPage() {
  const { isAdmin } = await getMyRole();
  if (!isAdmin) redirect("/dashboard");

  return <AdminToolsClient />;
}

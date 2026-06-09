import { redirect } from "next/navigation";
import { getMyRole } from "@/lib/roles";
import AdminDiagnosticsClient from "./AdminDiagnosticsClient";

export default async function AdminDiagnosticsPage() {
  const { isAdmin } = await getMyRole();
  if (!isAdmin) redirect("/dashboard");

  return <AdminDiagnosticsClient />;
}

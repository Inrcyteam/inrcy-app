import { redirect } from "next/navigation";
import { getMyRole } from "@/lib/roles";
import AdminUsersClient from "./AdminUsersClient";

export default async function AdminUsersPage() {
  const { isAdmin } = await getMyRole();
  if (!isAdmin) redirect("/dashboard");

  return <AdminUsersClient />;
}

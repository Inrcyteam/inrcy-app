import { redirect } from "next/navigation";
import AdminOrdersClient from "./AdminOrdersClient";
import { getMyRole } from "@/lib/roles";

export default async function AdminOrdersPage() {
  const { isAdmin } = await getMyRole();

  if (!isAdmin) {
    redirect("/dashboard");
  }

  return <AdminOrdersClient />;
}

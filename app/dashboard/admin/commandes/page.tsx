import { redirect } from "next/navigation";
import AdminOrdersClient from "./AdminOrdersClient";
import { getMyRole } from "@/lib/roles";

export default async function AdminOrdersPage() {
  const { isStaff } = await getMyRole();

  if (!isStaff) {
    redirect("/dashboard");
  }

  return <AdminOrdersClient />;
}

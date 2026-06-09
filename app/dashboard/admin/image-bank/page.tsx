import { redirect } from "next/navigation";
import { getMyRole } from "@/lib/roles";
import ImageBankAdminClient from "./ImageBankAdminClient";

export default async function ImageBankAdminPage() {
  const { isAdmin } = await getMyRole();

  if (!isAdmin) {
    redirect("/dashboard");
  }

  return <ImageBankAdminClient />;
}

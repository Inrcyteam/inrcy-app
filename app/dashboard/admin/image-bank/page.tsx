import { redirect } from "next/navigation";
import { getMyRole } from "@/lib/roles";
import ImageBankAdminClient from "./ImageBankAdminClient";

export default async function ImageBankAdminPage() {
  const { isStaff } = await getMyRole();

  if (!isStaff) {
    redirect("/dashboard");
  }

  return <ImageBankAdminClient />;
}

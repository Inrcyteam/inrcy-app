import { redirect } from "next/navigation";

export default function ContactPage() {
  redirect("/dashboard?panel=contact&panelSource=settings");
}

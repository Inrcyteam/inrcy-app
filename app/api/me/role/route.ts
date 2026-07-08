import { NextResponse } from "next/server";
import { getMyRole } from "@/lib/roles";

export async function GET() {
  const role = await getMyRole();
  return NextResponse.json(role, {
    headers: { "Cache-Control": "no-store" },
  });
}

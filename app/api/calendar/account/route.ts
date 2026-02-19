import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
export async function GET() {
  // Agenda iNrCy natif : plus de compte Google Calendar.
  const { errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;
  return NextResponse.json({ account: null });
}

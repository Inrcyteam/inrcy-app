import { NextResponse } from "next/server";

/**
 * Google Calendar integration has been removed from iNrCy.
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: "google_calendar_integration_removed",
      message: "Google Agenda has been removed from iNrCy. Please use the iNrCy agenda.",
    },
    { status: 410 }
  );
}

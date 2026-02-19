import { NextResponse } from "next/server";

/**
 * Google Calendar integration has been removed from iNrCy.
 * This route is kept as a harmless stub to avoid build-time typed-route references
 * and to provide a clear HTTP response if an old OAuth callback URL is hit.
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

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
      message: "L'ancienne connexion Google Agenda n'est plus disponible. Merci d'utiliser l'agenda iNrCy.",
    },
    { status: 410 }
  );
}

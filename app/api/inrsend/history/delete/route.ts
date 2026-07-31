import { NextResponse } from "next/server";

const MANUAL_HISTORY_DELETION_MESSAGE =
  "Aucune suppression manuelle n’est disponible dans iNr’Send. Pour toute demande exceptionnelle, contactez contact@inrcy.com.";

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      code: "inrsend_history_manual_deletion_disabled",
      error: MANUAL_HISTORY_DELETION_MESSAGE,
      contact: "contact@inrcy.com",
    },
    { status: 403 },
  );
}

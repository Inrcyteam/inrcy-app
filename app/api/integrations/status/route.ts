import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { asRecord } from "@/lib/tsSafe";

import { getConnectionDisplayStatus, mailConnectionKind, readConnectionVersion } from "@/lib/connectionVersions";
export async function GET() {
  const supabase = await createSupabaseServer();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return jsonUserFacingError("Non authentifié.", { status: 401 });
  }

  const userId = userData.user.id;

  const { data: rows, error: mailError } = await supabase
    .from("integrations")
    .select("id, provider, account_email, settings, status, created_at")
    .eq("user_id", userId)
    .eq("category", "mail")
    .order("created_at", { ascending: true });

  const mailAccounts =
    (rows ?? []).map((r: Record<string, unknown>) => {
      const rr = asRecord(r);
      const settings = asRecord(rr["settings"]);
      const kind = mailConnectionKind(rr["provider"]);
      const isConnected = String(rr["status"] || "").toLowerCase() === "connected";
      const connectionStatus = kind
        ? getConnectionDisplayStatus(isConnected, kind, settings)
        : isConnected
          ? "connected"
          : "disconnected";
      return {
        id: rr["id"],
        provider: rr["provider"],
        email_address: rr["account_email"],
        display_name: settings["display_name"] ?? null,
        status: rr["status"],
        connection_status: connectionStatus,
        requires_update: connectionStatus === "needs_update",
        connection_version: readConnectionVersion(settings),
        created_at: rr["created_at"],
      };
    }) ?? [];


  if (mailError) {
    return jsonUserFacingError(mailError, { status: 500, fallback: "Impossible de charger vos comptes de messagerie pour le moment." });
  }

  return NextResponse.json({
    mailAccounts: mailAccounts,
    limits: { maxMailAccounts: 4 },
  });
}

import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getGmbToken, gmbListAccounts, gmbListLocationsWithFallback } from "@/lib/googleBusiness";
import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";

export async function GET(req: Request) {
  try {
    const supabase = await createSupabaseServer();
    const { data: auth, error } = await supabase.auth.getUser();
    if (error || !auth?.user) return NextResponse.json({ error: "Accès non autorisé." }, { status: 401 });

    const tok = await getGmbToken();
    if (!tok?.accessToken) return NextResponse.json({ error: "Compte Google Business non connecté." }, { status: 400 });

    const accounts = await gmbListAccounts(tok.accessToken);

    const url = new URL(req.url);
    const accountName = url.searchParams.get("account") || accounts?.[0]?.name || null;

    let locations: unknown[] = [];
    let locationsError: string | null = null;

    if (accountName) {
      try {
        locations = await gmbListLocationsWithFallback(tok.accessToken, accountName);
      } catch (e: unknown) {
        locationsError = getSimpleFrenchErrorMessage(e, "Impossible de charger les établissements pour ce compte.");
        locations = [];
      }
    }

    return NextResponse.json({ accounts, accountName, locations, locationsError });
  } catch (e: unknown) {
    return jsonUserFacingError(e, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getGmbToken, gmbListAccounts, gmbListLocationsWithFallback } from "@/lib/googleBusiness";

export async function GET(req: Request) {
  try {
    const supabase = await createSupabaseServer();
    const { data: auth, error } = await supabase.auth.getUser();
    if (error || !auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tok = await getGmbToken();
    if (!tok?.accessToken) return NextResponse.json({ error: "Google Business non connecté" }, { status: 400 });

    const accounts = await gmbListAccounts(tok.accessToken);

    const url = new URL(req.url);
    const accountName = url.searchParams.get("account") || accounts?.[0]?.name || null;

    let locations: unknown[] = [];
    let locationsError: string | null = null;

    if (accountName) {
      try {
        locations = await gmbListLocationsWithFallback(tok.accessToken, accountName);
      } catch (e: Record<string, unknown>) {
        locationsError = e?.message || String(e);
        locations = [];
      }
    }

    return NextResponse.json({ accounts, accountName, locations, locationsError });
  } catch (e: Record<string, unknown>) {
    return NextResponse.json({ error: e?.message || "Erreur" }, { status: 500 });
  }
}

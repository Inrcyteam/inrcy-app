import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { resolveActiveInrcyAccountId } from "@/lib/multicompte/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildBubbleAccessMap,
  createDefaultBubbleAccessRows,
  type AppBubbleAccessRow,
} from "@/lib/bubbleAccess";

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData?.user;

  if (authError || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const activeUserId = await resolveActiveInrcyAccountId(supabase, user.id);

  const { data: existingRows, error: readError } = await supabaseAdmin
    .from("app_bubble_access")
    .select("bubble_key,enabled")
    .eq("user_id", activeUserId);

  if (readError) {
    console.warn("[bubble-access] read failed", readError);
    return NextResponse.json({ error: "Lecture des accès bulles impossible" }, { status: 500 });
  }

  const existingBubbleKeys = new Set(
    ((existingRows as AppBubbleAccessRow[] | null) ?? [])
      .map((row) => row.bubble_key)
      .filter((key): key is string => typeof key === "string"),
  );

  const missingRows = createDefaultBubbleAccessRows(activeUserId)
    .filter((row) => !existingBubbleKeys.has(row.bubble_key));

  let rows = existingRows as AppBubbleAccessRow[] | null;

  if (missingRows.length > 0) {
    const { error: upsertError } = await supabaseAdmin
      .from("app_bubble_access")
      .upsert(missingRows, { onConflict: "user_id,bubble_key", ignoreDuplicates: true });

    if (upsertError) {
      console.warn("[bubble-access] upsert failed", upsertError);
      return NextResponse.json({ error: "Création des accès bulles impossible" }, { status: 500 });
    }

    const { data: refreshedRows, error: refreshError } = await supabaseAdmin
      .from("app_bubble_access")
      .select("bubble_key,enabled")
      .eq("user_id", activeUserId);

    if (refreshError) {
      console.warn("[bubble-access] refresh failed", refreshError);
      return NextResponse.json({ error: "Relecture des accès bulles impossible" }, { status: 500 });
    }

    rows = refreshedRows as AppBubbleAccessRow[] | null;
  }

  return NextResponse.json({
    bubbleAccessMap: buildBubbleAccessMap(rows),
    rowsCreated: missingRows.length,
  });
}

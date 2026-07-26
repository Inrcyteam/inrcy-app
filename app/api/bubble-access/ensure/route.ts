import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { resolveActiveInrcyAccountId } from "@/lib/multicompte/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  APP_BUBBLE_ALWAYS_ENABLED_KEYS,
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
  const rowsToForceEnabled = APP_BUBBLE_ALWAYS_ENABLED_KEYS
    .filter((bubbleKey) =>
      ((existingRows as AppBubbleAccessRow[] | null) ?? [])
        .some((row) => row.bubble_key === bubbleKey && row.enabled !== true),
    )
    .map((bubbleKey) => ({
      user_id: activeUserId,
      bubble_key: bubbleKey,
      enabled: true,
    }));

  const missingRows = createDefaultBubbleAccessRows(activeUserId)
    .filter((row) => !existingBubbleKeys.has(row.bubble_key));

  let rows = existingRows as AppBubbleAccessRow[] | null;

  if (missingRows.length > 0 || rowsToForceEnabled.length > 0) {
    const forcedKeySet = new Set(rowsToForceEnabled.map((row) => row.bubble_key));
    const rowsToUpsert = [
      ...missingRows.filter((row) => !forcedKeySet.has(row.bubble_key)),
      ...rowsToForceEnabled,
    ];

    const { error: upsertError } = await supabaseAdmin
      .from("app_bubble_access")
      .upsert(rowsToUpsert, { onConflict: "user_id,bubble_key" });

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
    inrAgentEnabled: true,
    tiktokEnabled: true,
  });
}

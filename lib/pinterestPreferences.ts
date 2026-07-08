import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { asRecord, asString } from "@/lib/tsSafe";

function normalizeSettingsRoot(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function getPinterestDefaultBoardId(userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("pro_tools_configs")
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;

  const root = normalizeSettingsRoot(asRecord(data).settings);
  const pinterest = normalizeSettingsRoot(root.pinterest);
  return asString(pinterest.defaultBoardId) || "";
}

export async function setPinterestDefaultBoardId(userId: string, boardId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("pro_tools_configs")
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;

  const root = normalizeSettingsRoot(asRecord(data).settings);
  const pinterest = { ...normalizeSettingsRoot(root.pinterest) };
  const cleanBoardId = String(boardId || "").trim();

  if (cleanBoardId) pinterest.defaultBoardId = cleanBoardId;
  else delete pinterest.defaultBoardId;
  // Le nom du tableau reste toujours lu en direct depuis Pinterest.
  delete pinterest.defaultBoardName;

  const { error: writeError } = await supabaseAdmin
    .from("pro_tools_configs")
    .upsert(
      { user_id: userId, settings: { ...root, pinterest } },
      { onConflict: "user_id" },
    );
  if (writeError) throw writeError;
}

export async function ensurePinterestDefaultBoardId(
  userId: string,
  boards: Array<{ id: string }>,
): Promise<string> {
  const current = await getPinterestDefaultBoardId(userId).catch(() => "");
  const valid = boards.some((board) => String(board.id || "") === current);
  if (valid) return current;

  const fallback = String(boards[0]?.id || "").trim();
  if (fallback !== current) await setPinterestDefaultBoardId(userId, fallback);
  return fallback;
}

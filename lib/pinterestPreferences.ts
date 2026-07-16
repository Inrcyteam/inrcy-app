import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { asRecord, asString } from "@/lib/tsSafe";

function normalizeSettingsRoot(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizePinterestPublicProfileUrl(value: unknown): { ok: true; url: string } | { ok: false; error: string } {
  const raw = String(value || "").trim();
  if (!raw) return { ok: true, url: "" };

  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!/(^|\.)pinterest\.[a-z.]{2,}$/i.test(hostname)) {
      return { ok: false, error: "Le lien doit pointer vers un profil Pinterest." };
    }
    const pathname = url.pathname.replace(/\/{2,}/g, "/");
    if (!pathname || pathname === "/") {
      return { ok: false, error: "Renseigne le lien complet de ton profil Pinterest." };
    }
    url.protocol = "https:";
    url.hash = "";
    url.search = "";
    url.pathname = pathname.endsWith("/") ? pathname : `${pathname}/`;
    return { ok: true, url: url.toString() };
  } catch {
    return { ok: false, error: "Lien Pinterest invalide." };
  }
}

export async function getPinterestPublicProfileUrl(userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("pro_tools_configs")
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;

  const root = normalizeSettingsRoot(asRecord(data).settings);
  const pinterest = normalizeSettingsRoot(root.pinterest);
  return asString(pinterest.publicProfileUrl) || "";
}

export async function setPinterestPublicProfileUrl(userId: string, value: unknown): Promise<string> {
  const normalized = normalizePinterestPublicProfileUrl(value);
  if (!normalized.ok) throw new Error(normalized.error);

  const { data, error } = await supabaseAdmin
    .from("pro_tools_configs")
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;

  const root = normalizeSettingsRoot(asRecord(data).settings);
  const pinterest = { ...normalizeSettingsRoot(root.pinterest) };
  if (normalized.url) pinterest.publicProfileUrl = normalized.url;
  else delete pinterest.publicProfileUrl;

  const { error: writeError } = await supabaseAdmin
    .from("pro_tools_configs")
    .upsert(
      { user_id: userId, settings: { ...root, pinterest } },
      { onConflict: "user_id" },
    );
  if (writeError) throw writeError;
  return normalized.url;
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

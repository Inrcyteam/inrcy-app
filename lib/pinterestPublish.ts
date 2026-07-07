import { asRecord, asString } from "@/lib/tsSafe";

export type PinterestCreateImagePinArgs = {
  accessToken: string;
  boardId: string;
  title: string;
  description?: string;
  imageUrl: string;
  link?: string | null;
};

export type PinterestCreatePinResult = {
  ok: boolean;
  id: string | null;
  url: string | null;
  board_id: string | null;
  raw: unknown;
};

function cleanSingleLineText(value: unknown, maxLength: number) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .trim();
}

function cleanMultilineText(value: unknown, maxLength: number) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, maxLength)
    .trim();
}

function normalizePublicUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!/^https?:\/\//i.test(raw)) return "";
  return raw;
}

function buildPinterestPinUrl(pinId: string | null) {
  return pinId ? `https://www.pinterest.com/pin/${encodeURIComponent(pinId)}/` : null;
}

async function pinterestApiPost<T = unknown>(
  path: string,
  accessToken: string,
  body: unknown,
): Promise<T> {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const res = await fetch(`https://api.pinterest.com/v5${cleanPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const rec = asRecord(json);
    throw new Error(
      asString(rec.message) ||
        asString(rec.error_description) ||
        asString(rec.error) ||
        `Pinterest a refusé la publication (${res.status}).`,
    );
  }
  return json as T;
}

export async function createPinterestImagePin({
  accessToken,
  boardId,
  title,
  description,
  imageUrl,
  link,
}: PinterestCreateImagePinArgs): Promise<PinterestCreatePinResult> {
  const token = String(accessToken || "").trim();
  const cleanBoardId = String(boardId || "").trim();
  const cleanImageUrl = normalizePublicUrl(imageUrl);

  if (!token) throw new Error("Pinterest à connecter. Rendez-vous dans Canaux.");
  if (!cleanBoardId) throw new Error("Sélectionnez un tableau Pinterest dans la configuration.");
  if (!cleanImageUrl) throw new Error("Pinterest nécessite une image publique valide.");

  const payload: Record<string, unknown> = {
    board_id: cleanBoardId,
    title: cleanSingleLineText(title || "Publication iNrCy", 100),
    description: cleanMultilineText(description || "", 500),
    media_source: {
      source_type: "image_url",
      url: cleanImageUrl,
      is_standard: true,
    },
  };

  const cleanLink = normalizePublicUrl(link);
  if (cleanLink) payload.link = cleanLink;

  const json = asRecord(await pinterestApiPost("/pins", token, payload));
  const id = asString(json.id) || asString(json.pin_id) || null;

  return {
    ok: true,
    id,
    url: asString(json.url) || asString(json.link) || buildPinterestPinUrl(id),
    board_id: asString(json.board_id) || cleanBoardId,
    raw: json,
  };
}

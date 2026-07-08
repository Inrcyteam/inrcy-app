import { getPinterestApiBaseUrl } from "@/lib/pinterestOAuth";
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
  return pinId
    ? `https://www.pinterest.com/pin/${encodeURIComponent(pinId)}/`
    : null;
}

type PinterestApiMethod = "POST" | "PATCH" | "DELETE";

async function pinterestApiRequest<T = unknown>(
  path: string,
  accessToken: string,
  options: { method: PinterestApiMethod; body?: unknown },
): Promise<T> {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const hasBody = options.body !== undefined && options.method !== "DELETE";
  const res = await fetch(`${getPinterestApiBaseUrl()}/v5${cleanPath}`, {
    method: options.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      Accept: "application/json",
    },
    body: hasBody ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  const raw = await res.text().catch(() => "");
  let json: unknown = {};
  if (raw) {
    try {
      json = JSON.parse(raw);
    } catch {
      json = { message: raw };
    }
  }

  if (!res.ok) {
    const rec = asRecord(json);
    const message =
      asString(rec.message) ||
      asString(rec.error_description) ||
      asString(rec.error) ||
      `Pinterest a refusé l'action (${res.status}).`;
    const error = new Error(message) as Error & { status?: number };
    error.status = res.status;
    throw error;
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

  if (!token)
    throw new Error("Pinterest à connecter. Rendez-vous dans Canaux.");
  if (!cleanBoardId)
    throw new Error("Choisissez un tableau Pinterest avant de publier.");
  if (!cleanImageUrl)
    throw new Error("Pinterest nécessite une image publique valide.");

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

  const json = asRecord(
    await pinterestApiRequest("/pins", token, {
      method: "POST",
      body: payload,
    }),
  );
  const id = asString(json.id) || asString(json.pin_id) || null;

  return {
    ok: true,
    id,
    url: asString(json.url) || asString(json.link) || buildPinterestPinUrl(id),
    board_id: asString(json.board_id) || cleanBoardId,
  };
}

export type PinterestUpdatePinArgs = {
  accessToken: string;
  pinId: string;
  title: string;
  description?: string;
  link?: string | null;
  boardId?: string | null;
};

export async function updatePinterestPin({
  accessToken,
  pinId,
  title,
  description,
  link,
  boardId,
}: PinterestUpdatePinArgs): Promise<PinterestCreatePinResult> {
  const token = String(accessToken || "").trim();
  const cleanPinId = String(pinId || "").trim();
  if (!token)
    throw new Error("Pinterest à connecter. Rendez-vous dans Canaux.");
  if (!cleanPinId) throw new Error("Épingle Pinterest introuvable.");

  const payload: Record<string, unknown> = {
    title: cleanSingleLineText(title || "Publication iNrCy", 100),
    description: cleanMultilineText(description || "", 500),
  };

  const cleanBoardId = String(boardId || "").trim();
  if (cleanBoardId) payload.board_id = cleanBoardId;

  const cleanLink = normalizePublicUrl(link);
  payload.link = cleanLink || null;

  const json = asRecord(
    await pinterestApiRequest(
      `/pins/${encodeURIComponent(cleanPinId)}`,
      token,
      {
        method: "PATCH",
        body: payload,
      },
    ),
  );
  const id = asString(json.id) || asString(json.pin_id) || cleanPinId;

  return {
    ok: true,
    id,
    url: asString(json.url) || buildPinterestPinUrl(id),
    board_id: asString(json.board_id) || cleanBoardId || null,
  };
}

export async function deletePinterestPin(
  accessToken: string,
  pinId: string,
): Promise<void> {
  const token = String(accessToken || "").trim();
  const cleanPinId = String(pinId || "").trim();
  if (!token)
    throw new Error("Pinterest à connecter. Rendez-vous dans Canaux.");
  if (!cleanPinId) throw new Error("Épingle Pinterest introuvable.");

  try {
    await pinterestApiRequest(
      `/pins/${encodeURIComponent(cleanPinId)}`,
      token,
      { method: "DELETE" },
    );
  } catch (error) {
    const status = Number((error as Error & { status?: number })?.status || 0);
    if (status === 404) return;
    throw error;
  }
}

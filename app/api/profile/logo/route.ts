import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { resolveActiveInrcyAccountId } from "@/lib/multicompte/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  createSignedLogoUrl,
  getProfileLogoExtension,
  getProfileLogoMimeType,
  LOGO_BUCKET,
  PROFILE_LOGO_MIME_TYPES,
  validateProfileLogoFile,
} from "@/lib/profileLogo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOGO_EXTENSIONS = ["png", "jpg", "webp", "svg"] as const;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function getAuthenticatedAccount() {
  const supabase = await createSupabaseServer();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user?.id) return null;

  const accountId = await resolveActiveInrcyAccountId(supabase, authData.user.id);
  return { accountId };
}

function isOwnedLogoPath(path: string, accountId: string) {
  const prefix = `${accountId}/logo.`;
  return path.startsWith(prefix) && LOGO_EXTENSIONS.includes(path.slice(prefix.length) as (typeof LOGO_EXTENSIONS)[number]);
}

async function completeLogoUpload(accountId: string, path: string) {
  const signedUrl = await createSignedLogoUrl(supabaseAdmin, path);
  const stalePaths = LOGO_EXTENSIONS
    .map((extension) => `${accountId}/logo.${extension}`)
    .filter((candidate) => candidate !== path);

  if (stalePaths.length) {
    await supabaseAdmin.storage.from(LOGO_BUCKET).remove(stalePaths).catch(() => undefined);
  }

  return signedUrl;
}

// Prepare a short-lived signed upload URL. The image bytes go directly from
// the browser to Storage, so 20 Mo logos are not limited by serverless body caps.
export async function POST(request: Request) {
  try {
    const authenticated = await getAuthenticatedAccount();
    if (!authenticated) return errorResponse("Session absente. Merci de vous reconnecter.", 401);

    const body = await request.json().catch(() => null) as {
      fileName?: unknown;
      fileType?: unknown;
      fileSize?: unknown;
    } | null;

    const file = {
      name: typeof body?.fileName === "string" ? body.fileName : "",
      type: typeof body?.fileType === "string" ? body.fileType : "",
      size: Number(body?.fileSize || 0),
    };

    const validationError = validateProfileLogoFile(file);
    if (validationError) return errorResponse(validationError, 400);

    const mimeType = getProfileLogoMimeType(file);
    if (!mimeType || !(PROFILE_LOGO_MIME_TYPES as readonly string[]).includes(mimeType)) {
      return errorResponse("Format accepté : PNG, JPG/JPEG, WebP ou SVG.", 400);
    }

    const path = `${authenticated.accountId}/logo.${getProfileLogoExtension(file)}`;
    const { data, error } = await supabaseAdmin.storage
      .from(LOGO_BUCKET)
      .createSignedUploadUrl(path, { upsert: true });

    if (error || !data?.token) {
      console.error("[profile/logo] signed upload preparation failed", error);
      return errorResponse("Le stockage du logo n’est pas disponible pour le moment.", 502);
    }

    return NextResponse.json({ ok: true, path, token: data.token, mimeType });
  } catch (error) {
    console.error("[profile/logo] preparation failed", error);
    return errorResponse("Le logo n’a pas pu être préparé pour le moment.", 500);
  }
}

// Return a fresh display URL after the direct upload has completed.
export async function GET(request: Request) {
  try {
    const authenticated = await getAuthenticatedAccount();
    if (!authenticated) return errorResponse("Session absente. Merci de vous reconnecter.", 401);

    const path = new URL(request.url).searchParams.get("path")?.trim() || "";
    if (!isOwnedLogoPath(path, authenticated.accountId)) {
      return errorResponse("Logo non autorisé.", 403);
    }

    const signedUrl = await completeLogoUpload(authenticated.accountId, path);
    return NextResponse.json({ ok: true, path, signedUrl });
  } catch (error) {
    console.error("[profile/logo] completion failed", error);
    return errorResponse("Le logo a été envoyé, mais son aperçu n’a pas pu être préparé.", 502);
  }
}

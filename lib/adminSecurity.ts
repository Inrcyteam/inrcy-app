import { NextResponse } from "next/server";
import { getMyRole } from "@/lib/roles";

export async function requireAdminApi() {
  const { isAdmin } = await getMyRole();

  if (!isAdmin) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Accès admin requis." }, { status: 403 }),
    };
  }

  return { ok: true as const };
}

export function requireSecretHeader(request: Request, headerName: string, expectedSecret: string | undefined) {
  const receivedSecret = request.headers.get(headerName);

  if (!expectedSecret || receivedSecret !== expectedSecret) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: "Accès non autorisé." }, { status: 401 }),
    };
  }

  return { ok: true as const };
}

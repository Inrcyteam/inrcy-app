import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { ACTIVE_INRCY_ACCOUNT_COOKIE } from "@/lib/multicompte/constants";
import { isUuidLike } from "@/lib/multicompte/normalize";
import { listAccessibleInrcyAccounts } from "@/lib/multicompte/server";

export const dynamic = "force-dynamic";

type Body = {
  accountId?: unknown;
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    return NextResponse.json({ ok: false, error: "Session expirée." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as Body;
  const accountId = typeof body.accountId === "string" ? body.accountId : "";

  if (!isUuidLike(accountId)) {
    return NextResponse.json({ ok: false, error: "Établissement invalide." }, { status: 400 });
  }

  let accounts: Awaited<ReturnType<typeof listAccessibleInrcyAccounts>>;
  try {
    accounts = await listAccessibleInrcyAccounts(supabase, data.user.id);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Impossible de vérifier l’accès à cet établissement." },
      { status: 503 },
    );
  }
  const allowed = accounts.some((account) => account.id === accountId);

  if (!allowed) {
    return NextResponse.json({ ok: false, error: "Accès refusé à cet établissement." }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true, activeUserId: accountId });
  response.cookies.set(ACTIVE_INRCY_ACCOUNT_COOKIE, accountId, {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}

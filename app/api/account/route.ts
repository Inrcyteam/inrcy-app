import { NextResponse } from "next/server";
import { withApi } from "@/lib/observability/withApi";
import { requireUser } from "@/lib/requireUser";
import { deleteUserAccountEverywhere } from "@/lib/deleteUserAccount";

export const DELETE = withApi(async () => {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const deletion = await deleteUserAccountEverywhere(user.id);

  // Sign out local session cookies (best-effort), even if the admin-side
  // deletion was only partial. This keeps the browser state coherent.
  try {
    await supabase.auth.signOut();
  } catch {
    // no-op
  }

  if (!deletion.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "Suppression partielle. Certaines données n'ont pas pu être supprimées automatiquement.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}, { route: "/api/account" });

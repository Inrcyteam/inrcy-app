import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { safeInternalPath } from "@/lib/security";
import { ensureNotificationPreferences } from "@/lib/notifications";
import { ensureProfileRow } from "@/lib/ensureProfileRow";

export async function GET(req: Request) {
  const supabase = await createSupabaseServer();
  const { searchParams } = new URL(req.url);

  // Supabase can return errors
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Only allow internal redirects
  const nextParam = safeInternalPath(searchParams.get("next") || "/dashboard", "/dashboard");

  if (error) {
    const url = new URL("/login", new URL(req.url).origin);
    url.searchParams.set("error", error);
    if (errorDescription) url.searchParams.set("error_description", errorDescription);
    return NextResponse.redirect(url);
  }

  // Exchanges the auth code for a session.
  const code = searchParams.get("code");
  if (code) {
    const { data } = await supabase.auth.exchangeCodeForSession(code);
    const authUser = data?.user;
    const userId = authUser?.id;
    if (authUser) {
      await ensureProfileRow(authUser).catch(() => null);
    }
    if (userId) {
      await ensureNotificationPreferences(userId).catch(() => null);
    }
  }

  return NextResponse.redirect(new URL(nextParam, new URL(req.url).origin));
}

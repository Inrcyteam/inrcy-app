import { NextResponse } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { safeInternalPath } from "@/lib/security";
import { ensureNotificationPreferences } from "@/lib/notifications";
import { ensureProfileRow } from "@/lib/ensureProfileRow";

function getFallbackPath(type?: string | null) {
  if (type === "recovery") return "/set-password?mode=reset";
  if (type === "invite") return "/set-password?mode=invite";
  return "/login";
}

function redirectWithError(req: Request, fallbackPath: string, code?: string | null, description?: string | null) {
  const url = new URL(fallbackPath, new URL(req.url).origin);
  if (code) url.searchParams.set("error_code", code);
  if (description) url.searchParams.set("error_description", description);
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  const supabase = await createSupabaseServer();
  const url = new URL(req.url);
  const { searchParams } = url;

  const nextParam = safeInternalPath(searchParams.get("next") || "/dashboard", "/dashboard");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  if (error) {
    return redirectWithError(req, getFallbackPath(type), error, errorDescription);
  }

  if (tokenHash && type) {
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (verifyError) {
      return redirectWithError(req, getFallbackPath(type), verifyError.code, verifyError.message);
    }

    const authUser = data.user;
    const userId = authUser?.id;

    if (authUser) {
      await ensureProfileRow(authUser).catch(() => null);
    }
    if (userId) {
      await ensureNotificationPreferences(userId).catch(() => null);
    }

    return NextResponse.redirect(new URL(nextParam, url.origin));
  }

  if (code) {
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      return redirectWithError(req, "/login", exchangeError.code, exchangeError.message);
    }

    const authUser = data?.user;
    const userId = authUser?.id;

    if (authUser) {
      await ensureProfileRow(authUser).catch(() => null);
    }
    if (userId) {
      await ensureNotificationPreferences(userId).catch(() => null);
    }

    return NextResponse.redirect(new URL(nextParam, url.origin));
  }

  return NextResponse.redirect(new URL("/login", url.origin));
}

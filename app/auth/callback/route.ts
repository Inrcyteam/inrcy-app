import { NextResponse } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { safeInternalPath } from "@/lib/security";
import { ensureNotificationPreferences } from "@/lib/notifications";
import { ensureProfileRow } from "@/lib/ensureProfileRow";
import { ACTIVE_USER_COOKIE } from "@/lib/browserAccountCache";

function getFallbackPath(type?: string | null) {
  if (type === "recovery") return "/set-password?mode=reset";
  if (type === "invite") return "/set-password?mode=invite";
  return "/login";
}

function normalizeEmail(input: string | null | undefined) {
  const value = String(input || "").trim().toLowerCase();
  return value || null;
}

function buildTargetUrl(origin: string, nextPath: string, expectedEmail?: string | null) {
  const target = new URL(nextPath, origin);
  if (expectedEmail && target.pathname === "/set-password" && !target.searchParams.get("email")) {
    target.searchParams.set("email", expectedEmail);
  }
  return target;
}

function redirectWithError(
  req: Request,
  fallbackPath: string,
  code?: string | null,
  description?: string | null,
  expectedEmail?: string | null,
) {
  const url = buildTargetUrl(new URL(req.url).origin, fallbackPath, expectedEmail);
  if (code) url.searchParams.set("error_code", code);
  if (description) url.searchParams.set("error_description", description);
  return NextResponse.redirect(url);
}

function withActiveUserCookie(response: NextResponse, userId?: string | null, reqUrl?: URL) {
  if (!userId) return response;
  response.cookies.set(ACTIVE_USER_COOKIE, userId, {
    path: "/",
    sameSite: "lax",
    secure: (reqUrl?.protocol || "").toLowerCase() === "https:",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

function buildSwitchAccountUrl(url: URL, currentEmail: string, expectedEmail: string) {
  const switchUrl = new URL("/auth/switch-account", url.origin);
  switchUrl.searchParams.set("current_email", currentEmail);
  switchUrl.searchParams.set("expected_email", expectedEmail);
  switchUrl.searchParams.set("continue", `${url.pathname}${url.search}`);
  return switchUrl;
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
  const expectedEmail = normalizeEmail(searchParams.get("email"));

  if (error) {
    return redirectWithError(req, getFallbackPath(type), error, errorDescription, expectedEmail);
  }

  if (tokenHash && type) {
    if (expectedEmail) {
      const { data: currentUserData } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
      const currentEmail = normalizeEmail(currentUserData?.user?.email);
      if (currentEmail && currentEmail !== expectedEmail) {
        return NextResponse.redirect(buildSwitchAccountUrl(url, currentEmail, expectedEmail));
      }
    }

    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (verifyError) {
      return redirectWithError(req, getFallbackPath(type), verifyError.code, verifyError.message, expectedEmail);
    }

    const authUser = data.user;
    const userId = authUser?.id;
    const verifiedEmail = normalizeEmail(authUser?.email);

    if (expectedEmail && verifiedEmail && verifiedEmail !== expectedEmail) {
      return redirectWithError(
        req,
        getFallbackPath(type),
        "email_mismatch",
        "Ce lien ne correspond pas au compte attendu.",
        expectedEmail,
      );
    }

    if (authUser) {
      await ensureProfileRow(authUser).catch(() => null);
    }
    if (userId) {
      await ensureNotificationPreferences(userId).catch(() => null);
    }

    const response = NextResponse.redirect(buildTargetUrl(url.origin, nextParam, expectedEmail || verifiedEmail));
    return withActiveUserCookie(response, userId, url);
  }

  if (code) {
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      return redirectWithError(req, "/login", exchangeError.code, exchangeError.message, expectedEmail);
    }

    const authUser = data?.user;
    const userId = authUser?.id;

    if (authUser) {
      await ensureProfileRow(authUser).catch(() => null);
    }
    if (userId) {
      await ensureNotificationPreferences(userId).catch(() => null);
    }

    const response = NextResponse.redirect(buildTargetUrl(url.origin, nextParam, normalizeEmail(authUser?.email)));
    return withActiveUserCookie(response, userId, url);
  }

  return NextResponse.redirect(new URL("/login", url.origin));
}

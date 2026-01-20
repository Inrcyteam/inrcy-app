import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const url = new URL(req.url);

  // Certains cas Supabase renvoient directement une erreur (redirect non autorisé, lien expiré, etc.)
  const err = url.searchParams.get("error") || url.searchParams.get("error_code");
  const errDesc = url.searchParams.get("error_description");
  if (err) {
    const q = new URLSearchParams();
    q.set("error", String(err));
    if (errDesc) q.set("error_description", errDesc);
    return NextResponse.redirect(new URL(`/login?${q.toString()}`, url.origin));
  }

  // PKCE flow
  const code = url.searchParams.get("code");

  // OTP flow (invite/recovery/magiclink...) : selon les cas c'est token_hash OU token
  const token_hash = url.searchParams.get("token_hash") ?? url.searchParams.get("token");
  const type = url.searchParams.get("type") as
    | "invite"
    | "recovery"
    | "magiclink"
    | "signup"
    | "email_change"
    | null;

  // Si Supabase ne fournit pas next, on le déduit du type (ça suffit pour Send invitation)
  const inferredNext =
    type === "invite"
      ? "/set-password?mode=invite"
      : type === "recovery"
        ? "/set-password?mode=reset"
        : "/dashboard";

  // Si tu passes parfois next=..., on le respecte
  const next = url.searchParams.get("next") ?? inferredNext;

  const supabase = await createSupabaseServer();

  // 1) PKCE
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL("/login?error=auth", url.origin));
    return NextResponse.redirect(new URL(next, url.origin));
  }

  // 2) OTP (invite/recovery/etc.)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (error) return NextResponse.redirect(new URL("/login?error=otp", url.origin));
    return NextResponse.redirect(new URL(next, url.origin));
  }

  return NextResponse.redirect(new URL("/login", url.origin));
}

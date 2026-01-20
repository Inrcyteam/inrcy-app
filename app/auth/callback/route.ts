import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const url = new URL(req.url);

  // PKCE flow
  const code = url.searchParams.get("code");

  // OTP flow (très fréquent pour Invite user)
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as
    | "invite"
    | "recovery"
    | "magiclink"
    | "signup"
    | "email_change"
    | null;

  // Si Supabase ne fournit pas "next", on le déduit du type
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
    if (error) return NextResponse.redirect(new URL("/login", url.origin));
    return NextResponse.redirect(new URL(next, url.origin));
  }

  // 2) OTP (invite/recovery/etc.)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (error) return NextResponse.redirect(new URL("/login", url.origin));
    return NextResponse.redirect(new URL(next, url.origin));
  }

  // Rien de valide
  return NextResponse.redirect(new URL("/login", url.origin));
}

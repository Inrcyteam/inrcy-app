import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const url = new URL(req.url);

  const code = url.searchParams.get("code");
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as
    | "signup"
    | "invite"
    | "magiclink"
    | "recovery"
    | "email_change"
    | null;

  const next = url.searchParams.get("next") ?? "/dashboard";

  const supabase = await createSupabaseServer();

  // 1) Flow PKCE (code)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL("/login?error=auth", url.origin));
    return NextResponse.redirect(new URL(next, url.origin));
  }

  // 2) Flow OTP (token_hash + type)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (error) return NextResponse.redirect(new URL("/login?error=otp", url.origin));
    return NextResponse.redirect(new URL(next, url.origin));
  }

  // Rien à échanger → retour login
  return NextResponse.redirect(new URL("/login", url.origin));
}




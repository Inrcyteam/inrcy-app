import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { encryptSecret } from "@/lib/imapCrypto";

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const login = String(body.login || "").trim();
    const password = String(body.password || "");

    const imap_host = String(body.imap_host || "").trim();
    const imap_port = Number(body.imap_port || 993);
    const imap_secure = !!body.imap_secure;
    const smtp_host = String(body.smtp_host || "").trim();
    const smtp_port = Number(body.smtp_port || 587);
    const smtp_secure = !!body.smtp_secure;
    const smtp_starttls = !!body.smtp_starttls;

    if (!login || !password) {
      return NextResponse.json({ error: "Identifiant et mot de passe requis" }, { status: 400 });
    }
    if (!imap_host || !smtp_host) {
      return NextResponse.json({ error: "IMAP/SMTP host requis" }, { status: 400 });
    }

    const userId = userData.user.id;

    // Only 1 IMAP account per user (slot 4)
    await supabase.from("mail_accounts").delete().eq("user_id", userId).eq("provider", "imap");

    const password_enc = encryptSecret(password);

    const { data, error } = await supabase
      .from("mail_accounts")
      .insert({
        user_id: userId,
        provider: "imap",
        email_address: login,
        display_name: "IMAP",
        status: "connected",
        scopes: null,
        provider_account_id: null,
        access_token_enc: null,
        refresh_token_enc: null,
        expires_at: null,
        imap_host,
        imap_port,
        imap_secure,
        smtp_host,
        smtp_port,
        smtp_secure,
        smtp_starttls,
        password_enc,
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data?.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Connexion impossible" }, { status: 400 });
  }
}

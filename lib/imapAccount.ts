import { createSupabaseServer } from "@/lib/supabaseServer";
import { decryptSecret } from "@/lib/imapCrypto";

export async function loadImapAccount(accountId: string) {
  const supabase = await createSupabaseServer();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return { error: "Unauthorized" as const, status: 401 };
  }

  const { data, error } = await supabase
    .from("mail_accounts")
    .select(
      "id, user_id, provider, email_address, password_enc, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, smtp_starttls"
    )
    .eq("id", accountId)
    .eq("user_id", userData.user.id)
    .eq("provider", "imap")
    .single();

  if (error || !data) {
    return { error: "Compte IMAP introuvable" as const, status: 404 };
  }

  const password = decryptSecret(String(data.password_enc || ""));
  const login = String(data.email_address || "");

  return {
    ok: true as const,
    userId: userData.user.id,
    imap: {
      user: login,
      password,
      host: String(data.imap_host),
      port: Number(data.imap_port),
      secure: !!data.imap_secure,
    },
    smtp: {
      user: login,
      password,
      host: String(data.smtp_host),
      port: Number(data.smtp_port),
      secure: !!data.smtp_secure,
      starttls: !!data.smtp_starttls,
    },
  };
}

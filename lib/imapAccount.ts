import { createSupabaseServer } from "@/lib/supabaseServer";
import { decryptSecret } from "@/lib/imapCrypto";

export async function loadImapAccount(accountId: string) {
  const supabase = await createSupabaseServer();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return { error: "Unauthorized" as const, status: 401 };
  }

  const { data, error } = await supabase
    .from("integrations")
    .select("id, user_id, provider, account_email, settings")
    .eq("id", accountId)
    .eq("user_id", userData.user.id)
    .eq("provider", "imap")
    .eq("category", "mail")
    .single();

  if (error || !data) {
    return { error: "Compte IMAP introuvable" as const, status: 404 };
  }

  const settings: any = (data as any).settings ?? {};
  const passwordEnc = String(settings.password_enc || "");
  const password = decryptSecret(passwordEnc);
  const login = String((data as any).account_email || "");

  const imap = settings.imap || {};
  const smtp = settings.smtp || {};

  return {
    ok: true as const,
    userId: userData.user.id,
    imap: {
      user: login,
      password,
      host: String(imap.host || ""),
      port: Number(imap.port || 993),
      secure: !!imap.secure,
    },
    smtp: {
      user: login,
      password,
      host: String(smtp.host || ""),
      port: Number(smtp.port || 587),
      secure: !!smtp.secure,
      starttls: !!smtp.starttls,
    },
  };
}

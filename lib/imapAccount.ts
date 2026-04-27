import { createSupabaseServer } from "@/lib/supabaseServer";
import { decryptSecret } from "@/lib/imapCrypto";
import { getConnectionDisplayStatus } from "@/lib/connectionVersions";

export async function loadImapAccount(accountId: string) {
  const supabase = await createSupabaseServer();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return { error: "Votre session a expiré. Merci de vous reconnecter." as const, status: 401 };
  }

  const { data, error } = await supabase
    .from("integrations")
    .select("id, user_id, provider, account_email, settings, refresh_token_enc, status")
    .eq("id", accountId)
    .eq("user_id", userData.user.id)
    .eq("provider", "imap")
    .eq("category", "mail")
    .single();

  if (error || !data) {
    return { error: "Ce compte mail est introuvable." as const, status: 404 };
  }

  const settings: any = (data as any).settings ?? {};
  if (String((data as any).status || "") !== "connected") {
    return { error: "Cette boîte IMAP n’est pas connectée.", status: 400 as const };
  }
  if (getConnectionDisplayStatus(true, "mail:imap", settings) === "needs_update") {
    return { error: "Cette boîte IMAP doit être actualisée avant de pouvoir envoyer.", status: 400 as const };
  }
  const passwordEnc = String((data as any).refresh_token_enc || "");
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

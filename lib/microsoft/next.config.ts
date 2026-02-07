import { createSupabaseServer } from "@/lib/supabaseServer";

function isExpired(expiresAt?: string | null, skewSeconds = 60) {
  if (!expiresAt) return true; // si pas de date => on considère expiré
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return true;
  return t <= Date.now() + skewSeconds * 1000;
}

export async function refreshMicrosoftTokenIfNeeded(account: any) {
  // Si pas expiré => on renvoie le token tel quel
  if (!isExpired(account.expires_at)) {
    return { accessToken: String(account.access_token_enc || "") };
  }

  const refreshToken = String(account.refresh_token_enc || "");
  if (!refreshToken) {
    throw new Error("Missing Microsoft refresh token");
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET");
  }

  // Scope : on prend ceux stockés si dispo, sinon fallback safe
  const scope =
    (account.scopes && String(account.scopes)) ||
    "openid profile email offline_access Mail.Read Mail.ReadWrite Mail.Send";

  const res = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope,
      }),
    }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.access_token) {
    throw new Error(
      `Microsoft token refresh failed: ${JSON.stringify(data)}`
    );
  }

  const supabase = await createSupabaseServer();

  // Microsoft peut renvoyer un nouveau refresh_token : on le stocke si présent
  const update: any = {
    access_token_enc: String(data.access_token),
    expires_at: data.expires_in
      ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString()
      : null,
  };
  if (data.refresh_token) update.refresh_token_enc = String(data.refresh_token);

  await supabase.from("mail_accounts").update(update).eq("id", account.id);

  return { accessToken: String(data.access_token) };
}

import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

function isExpired(expires_at?: string | null, skewSeconds = 60) {
  if (!expires_at) return false;
  const t = Date.parse(expires_at);
  if (Number.isNaN(t)) return false;
  return t <= Date.now() + skewSeconds * 1000;
}

async function refreshAccessToken(refreshToken: string) {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { ok: false, status: 500, data: { error: "Missing MICROSOFT_* env" } };
  }

  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: [
        "openid",
        "profile",
        "email",
        "offline_access",
        "Mail.Read",
        "Mail.ReadWrite",
        "Mail.Send",
      ].join(" "),
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function graphGetMessage(token: string, id: string) {
  const url = new URL(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(id)}`);
  url.searchParams.set(
    "$select",
    [
      "id",
      "subject",
      "from",
      "sender",
      "receivedDateTime",
      "sentDateTime",
      "bodyPreview",
      "body",
      "isRead",
      "flag",
    ].join(",")
  );

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

export async function GET(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const accountId = searchParams.get("accountId");

  if (!id || !accountId) {
    return NextResponse.json({ error: "Missing id or accountId" }, { status: 400 });
  }

  const { data: account, error: accErr } = await supabase
    .from("mail_accounts")
    .select("id,email_address,access_token_enc,refresh_token_enc,expires_at,status")
    .eq("user_id", auth.user.id)
    .eq("provider", "microsoft")
    .eq("id", accountId)
    .maybeSingle();

  if (accErr) return NextResponse.json({ error: accErr.message }, { status: 500 });
  if (!account) return NextResponse.json({ error: "Microsoft account not found" }, { status: 404 });

  let accessToken: string | null = account.access_token_enc ?? null;
  const refreshToken: string | null = account.refresh_token_enc ?? null;

  if (!accessToken) return NextResponse.json({ error: "Missing access token" }, { status: 400 });

  if (refreshToken && isExpired(account.expires_at)) {
    const r = await refreshAccessToken(refreshToken);
    if (r.ok && r.data?.access_token) {
      accessToken = String(r.data.access_token);
      const expiresAt = r.data?.expires_in ? new Date(Date.now() + Number(r.data.expires_in) * 1000).toISOString() : null;
      await supabase.from("mail_accounts").update({ access_token_enc: accessToken, expires_at: expiresAt, status: "connected" }).eq("id", account.id);
    }
  }

  let { res: msgRes, data: msg } = await graphGetMessage(String(accessToken), id);

  if ((msgRes.status === 401 || msgRes.status === 403) && refreshToken) {
    const r = await refreshAccessToken(refreshToken);
    if (r.ok && r.data?.access_token) {
      accessToken = String(r.data.access_token);
      const expiresAt = r.data?.expires_in ? new Date(Date.now() + Number(r.data.expires_in) * 1000).toISOString() : null;
      await supabase.from("mail_accounts").update({ access_token_enc: accessToken, expires_at: expiresAt, status: "connected" }).eq("id", account.id);
      const retry = await graphGetMessage(String(accessToken), id);
      msgRes = retry.res;
      msg = retry.data;
    }
  }

  if (!msgRes.ok) {
    if (msgRes.status === 401 || msgRes.status === 403) {
      await supabase.from("mail_accounts").update({ status: "expired" }).eq("id", account.id);
    }
    return NextResponse.json({ error: "Graph message fetch failed", graphStatus: msgRes.status, graphError: msg }, { status: 500 });
  }

  const html = msg?.body?.contentType === "html" ? msg?.body?.content : null;
  const text = msg?.body?.contentType === "text" ? msg?.body?.content : null;

  return NextResponse.json({
    ok: true,
    id: msg?.id,
    subject: msg?.subject || "(Sans objet)",
    html,
    text,
    bodyPreview: msg?.bodyPreview || "",
    isRead: !!msg?.isRead,
    flagged: msg?.flag?.flagStatus === "flagged",
    receivedDateTime: msg?.receivedDateTime || msg?.sentDateTime || null,
  });
}

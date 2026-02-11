import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

function isExpired(expires_at?: string | null, skewSeconds = 60) {
  if (!expires_at) return false;
  const t = Date.parse(expires_at);
  if (Number.isNaN(t)) return false;
  return t <= Date.now() + skewSeconds * 1000;
}

async function refreshAccessToken(refreshToken: string, scope?: string | null) {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { ok: false, status: 500, data: { error: "Missing MICROSOFT_* env" } };
  }

  const fallbackScope = [
    "openid",
    "profile",
    "email",
    "offline_access",
    "Mail.Read",
    "Mail.ReadWrite",
    "Mail.Send",
  ].join(" ");

  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: scope || fallbackScope,
    }),
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function textToHtml(text: string) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");
  return `<div style="font-family:system-ui,Segoe UI,Arial">${escaped}</div>`;
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const accountId = String(formData.get("accountId") || "");
    const sendItemId = String(formData.get("sendItemId") || "").trim();
    const sendType = String(formData.get("type") || "mail").trim() || "mail";
    const to = String(formData.get("to") || "").trim();
    const subject = String(formData.get("subject") || "(sans objet)");
    const text = String(formData.get("text") || "");

    if (!accountId || !to) {
      return NextResponse.json({ error: "Missing accountId or to" }, { status: 400 });
    }

    const { data: account, error: accErr } = await supabase
      .from("mail_accounts")
      .select("id,user_id,provider,email_address,access_token_enc,refresh_token_enc,expires_at,status,scopes")
      .eq("id", accountId)
      .eq("user_id", auth.user.id)
      .eq("provider", "microsoft")
      .eq("status", "connected")
      .single();

    if (accErr || !account) {
      return NextResponse.json({ error: "Microsoft mail account not found" }, { status: 404 });
    }

    let accessToken: string | null = account.access_token_enc ?? null;
    const refreshToken: string | null = account.refresh_token_enc ?? null;

    if (!accessToken) {
      return NextResponse.json({ error: "Missing access token" }, { status: 500 });
    }

    // refresh si expiré
    if (refreshToken && isExpired(account.expires_at)) {
      const r = await refreshAccessToken(refreshToken, account.scopes);
      if (r.ok && r.data?.access_token) {
        accessToken = String(r.data.access_token);
        const expiresAt = r.data?.expires_in
          ? new Date(Date.now() + Number(r.data.expires_in) * 1000).toISOString()
          : null;

        await supabase
          .from("mail_accounts")
          .update({ access_token_enc: accessToken, expires_at: expiresAt, status: "connected" })
          .eq("id", account.id);
      }
    }

    const graphRes = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: {
            contentType: "HTML",
            content: textToHtml(text),
          },
          toRecipients: [{ emailAddress: { address: to } }],
        },
        saveToSentItems: true,
      }),
    });

    if (!graphRes.ok) {
      const details = await graphRes.text().catch(() => "");
      return NextResponse.json({ error: "Microsoft send failed", details }, { status: 500 });
    }

    // --- iNr'Send history (Supabase) ---
    const historyPayload = {
      user_id: auth.user.id,
      mail_account_id: accountId || null,
      type: (sendType as any) || "mail",
      status: "sent",
      to_emails: to,
      subject: subject || null,
      body_text: text || null,
      body_html: null,
      provider: "microsoft",
      provider_message_id: null,
      provider_thread_id: null,
      sent_at: new Date().toISOString(),
      error: null,
    };

    if (sendItemId) {
      await supabase.from("send_items").update(historyPayload).eq("id", sendItemId);
    } else {
      await supabase.from("send_items").insert(historyPayload);
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: "Internal server error", message: e?.message }, { status: 500 });
  }
}


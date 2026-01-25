import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

function decodeBase64UrlToBuffer(input: string) {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, "base64");
}

function isExpired(expires_at?: string | null, skewSeconds = 60) {
  if (!expires_at) return false;
  const t = Date.parse(expires_at);
  if (Number.isNaN(t)) return false;
  return t <= Date.now() + skewSeconds * 1000;
}

async function refreshAccessToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";

  if (!clientId || !clientSecret) {
    return { ok: false, status: 500, data: { error: "Missing GOOGLE_* env" } };
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function gmailGetAttachment(token: string, messageId: string, attachmentId: string) {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

/**
 * GET /api/inbox/gmail/attachment?messageId=...&attachmentId=...&mime=...&filename=...
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const messageId = searchParams.get("messageId");
  const attachmentId = searchParams.get("attachmentId");
  const mime = searchParams.get("mime") || "application/octet-stream";
  const filename = searchParams.get("filename") || "attachment";

  // ✅ FIX: string | null -> string (narrowing)
  if (!messageId || !attachmentId) {
    return NextResponse.json({ error: "Missing messageId or attachmentId" }, { status: 400 });
  }

  const supabase = await createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: accounts, error: accErr } = await supabase
    .from("mail_accounts")
    .select("id,email_address,access_token_enc,refresh_token_enc,expires_at,status")
    .eq("user_id", auth.user.id)
    .eq("provider", "gmail")
    .order("created_at", { ascending: true })
    .limit(1);

  if (accErr) return NextResponse.json({ error: accErr.message }, { status: 500 });

  const account = accounts?.[0];
  if (!account) return NextResponse.json({ error: "No Gmail connected" }, { status: 400 });

  // accessToken peut être null en base => on valide puis on bascule sur token (string)
  const accessToken: string | null = account.access_token_enc ?? null;
  const refreshToken: string | null = account.refresh_token_enc ?? null;

  if (!accessToken) {
    return NextResponse.json({ error: "Missing access token. Reconnect Gmail." }, { status: 400 });
  }

  // ✅ IMPORTANT : token est NON-nullable et c’est celui qu’on utilisera partout
  let token: string = accessToken;

  // refresh proactif si expiré
  if (refreshToken && isExpired(account.expires_at)) {
    const r = await refreshAccessToken(refreshToken);
    if (r.ok && r.data?.access_token) {
      token = r.data.access_token;

      const expiresAt =
        r.data.expires_in != null
          ? new Date(Date.now() + Number(r.data.expires_in) * 1000).toISOString()
          : null;

      await supabase
        .from("mail_accounts")
        .update({ access_token_enc: token, expires_at: expiresAt, status: "connected" })
        .eq("id", account.id);
    }
  }

  // 1er call (token est garanti string ici)
  let { res: attRes, data: attData } = await gmailGetAttachment(token, messageId, attachmentId);

  // retry si 401/403
  if ((attRes.status === 401 || attRes.status === 403) && refreshToken) {
    const r = await refreshAccessToken(refreshToken);
    if (r.ok && r.data?.access_token) {
      token = r.data.access_token;

      const expiresAt =
        r.data.expires_in != null
          ? new Date(Date.now() + Number(r.data.expires_in) * 1000).toISOString()
          : null;

      await supabase
        .from("mail_accounts")
        .update({ access_token_enc: token, expires_at: expiresAt, status: "connected" })
        .eq("id", account.id);

      const retry = await gmailGetAttachment(token, messageId, attachmentId);
      attRes = retry.res;
      attData = retry.data;
    }
  }

  if (!attRes.ok) {
    if (attRes.status === 401 || attRes.status === 403) {
      await supabase.from("mail_accounts").update({ status: "expired" }).eq("id", account.id);
    }
    return NextResponse.json(
      {
        error: "Gmail attachment fetch failed",
        gmailStatus: attRes.status,
        gmailError: attData,
      },
      { status: 502 }
    );
  }

  const data = attData?.data;
  if (!data) return NextResponse.json({ error: "No data in attachment response" }, { status: 500 });

  const buf = decodeBase64UrlToBuffer(data);

  return new NextResponse(buf, {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

function decodeBase64UrlToBuffer(input: string) {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, "base64");
}
function decodeBase64Url(input: string) {
  return decodeBase64UrlToBuffer(input).toString("utf8");
}

function findHtmlPart(payload: any): string {
  if (!payload) return "";

  if (payload?.mimeType === "text/html" && payload?.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  const parts = payload?.parts || [];
  for (const p of parts) {
    if (p?.mimeType === "text/html" && p?.body?.data) {
      return decodeBase64Url(p.body.data);
    }
  }

  for (const p of parts) {
    const html = findHtmlPart(p);
    if (html) return html;
  }

  return "";
}

type InlineAsset =
  | { kind: "attachment"; attachmentId: string; mimeType: string; filename?: string }
  | { kind: "datauri"; dataUri: string };

function collectCidMap(payload: any, out: Record<string, InlineAsset> = {}) {
  if (!payload) return out;

  const headers: Array<{ name: string; value: string }> = payload?.headers || [];
  const cidHeader = headers.find((h) => h.name?.toLowerCase() === "content-id")?.value;

  const mimeType: string | undefined = payload?.mimeType;
  const attachmentId: string | undefined = payload?.body?.attachmentId;
  const bodyData: string | undefined = payload?.body?.data;
  const filename: string | undefined = payload?.filename;

  if (cidHeader) {
    const normalized = cidHeader.trim().replace(/^<|>$/g, "");
    if (attachmentId && mimeType) {
      out[normalized] = {
        kind: "attachment",
        attachmentId,
        mimeType,
        filename: filename || undefined,
      };
    } else if (bodyData && mimeType) {
      const buf = decodeBase64UrlToBuffer(bodyData);
      const dataUri = `data:${mimeType};base64,${buf.toString("base64")}`;
      out[normalized] = { kind: "datauri", dataUri };
    }
  }

  const parts = payload?.parts || [];
  for (const p of parts) collectCidMap(p, out);

  return out;
}

function rewriteCidUrls(html: string, messageId: string, cidMap: Record<string, InlineAsset>) {
  if (!html) return html;

  const makeUrl = (asset: InlineAsset) => {
    if (asset.kind === "datauri") return asset.dataUri;

    const params = new URLSearchParams();
    params.set("messageId", messageId);
    params.set("attachmentId", asset.attachmentId);
    params.set("mime", asset.mimeType);
    if (asset.filename) params.set("filename", asset.filename);
    return `/api/inbox/gmail/attachment?${params.toString()}`;
  };

  const resolveCid = (cidRaw: string) => {
    const cid = cidRaw.trim().replace(/^<|>$/g, "");
    if (cidMap[cid]) return makeUrl(cidMap[cid]);
    const key = Object.keys(cidMap).find((k) => cid === k || cid.startsWith(k) || k.startsWith(cid));
    return key ? makeUrl(cidMap[key]) : null;
  };

  html = html.replace(/src=(["'])cid:([^"']+)\1/gi, (m, q, cid) => {
    const url = resolveCid(cid);
    return url ? `src=${q}${url}${q}` : m;
  });

  html = html.replace(/background=(["'])cid:([^"']+)\1/gi, (m, q, cid) => {
    const url = resolveCid(cid);
    return url ? `background=${q}${url}${q}` : m;
  });

  html = html.replace(/url\(\s*(["']?)cid:([^)"'\s]+)\1\s*\)/gi, (m, q, cid) => {
    const url = resolveCid(cid);
    return url ? `url(${q}${url}${q})` : m;
  });

  return html;
}

function isExpired(expires_at?: string | null, skewSeconds = 60) {
  if (!expires_at) return false;
  const t = Date.parse(expires_at);
  if (Number.isNaN(t)) return false;
  return t <= Date.now() + skewSeconds * 1000;
}

async function refreshAccessToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
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

async function gmailGetMessage(token: string, id: string) {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

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

  // ✅ tokens bruts
  const accessTokenEnc: string | null = account.access_token_enc ?? null;
  const refreshToken: string | null = account.refresh_token_enc ?? null;

  // ✅ on garantit un string pour TS
  if (!accessTokenEnc) {
    return NextResponse.json(
      { error: "Missing access token. Reconnect Gmail." },
      { status: 400 }
    );
  }
  let accessToken: string = accessTokenEnc;

  // refresh proactif
  if (refreshToken && isExpired(account.expires_at)) {
    const r = await refreshAccessToken(refreshToken);
    if (r.ok && r.data?.access_token) {
      accessToken = String(r.data.access_token);

      const expiresAt =
        r.data.expires_in != null
          ? new Date(Date.now() + Number(r.data.expires_in) * 1000).toISOString()
          : null;

      await supabase
        .from("mail_accounts")
        .update({ access_token_enc: accessToken, expires_at: expiresAt, status: "connected" })
        .eq("id", account.id);
    }
  }

  // 1er call
  let { res: msgRes, data: msgData } = await gmailGetMessage(accessToken, id);

  // retry si 401/403
  if ((msgRes.status === 401 || msgRes.status === 403) && refreshToken) {
    const r = await refreshAccessToken(refreshToken);
    if (r.ok && r.data?.access_token) {
      accessToken = String(r.data.access_token);

      const expiresAt =
        r.data.expires_in != null
          ? new Date(Date.now() + Number(r.data.expires_in) * 1000).toISOString()
          : null;

      await supabase
        .from("mail_accounts")
        .update({ access_token_enc: accessToken, expires_at: expiresAt, status: "connected" })
        .eq("id", account.id);

      const retry = await gmailGetMessage(accessToken, id);
      msgRes = retry.res;
      msgData = retry.data;
    }
  }

  if (!msgRes.ok) {
    if (msgRes.status === 401 || msgRes.status === 403) {
      await supabase.from("mail_accounts").update({ status: "expired" }).eq("id", account.id);
    }
    return NextResponse.json(
      {
        error: "Gmail fetch failed",
        gmailStatus: msgRes.status,
        gmailError: msgData,
      },
      { status: 502 }
    );
  }

  const rawHtml = findHtmlPart(msgData?.payload);
  const cidMap = collectCidMap(msgData?.payload);
  const html = rewriteCidUrls(rawHtml, id, cidMap);

  const wrapperStyles = `
<style>
  .inr-email-root { margin: 0; padding: 0; background: transparent; }
  .inr-email-center { width: 100%; display: flex; justify-content: center; }
  .inr-email-content { width: 100%; max-width: 760px; }

  .inr-email-content img,
  .inr-email-content video,
  .inr-email-content svg { max-width: 100% !important; height: auto !important; }

  .inr-email-content table { max-width: 100% !important; }

  .inr-email-content { overflow-wrap: anywhere; word-break: break-word; }

  .inr-email-content img[src^="cid:"],
  .inr-email-content img[src^="CID:"] {
    display: none !important;
    height: 0 !important;
    max-height: 0 !important;
  }
</style>`.trim();

  const wrapped = `
<base target="_blank" />
${wrapperStyles}
<div class="inr-email-root">
  <div class="inr-email-center">
    <div class="inr-email-content">
      ${html || "<div style='padding:12px'>Aucun contenu HTML trouvé pour ce message.</div>"}
    </div>
  </div>
</div>`.trim();

  return NextResponse.json({ html: wrapped });
}

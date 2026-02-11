import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

function toBase64Url(str: string) {
  return Buffer.from(str, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function wrap76(b64: string) {
  return b64.replace(/(.{76})/g, "$1\r\n");
}

type Attachment = { filename: string; mimeType: string; contentBase64: string };

function buildMimeMessage(opts: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: Attachment[];
}) {
  const text = opts.text ?? "";
  const html = opts.html ?? "";
  const atts = opts.attachments ?? [];

  const headers: string[] = [`To: ${opts.to}`, `Subject: ${opts.subject}`, "MIME-Version: 1.0"];

  if (opts.inReplyTo) headers.push(`In-Reply-To: ${opts.inReplyTo}`);
  if (opts.references) headers.push(`References: ${opts.references}`);

  // 1) Simple text only
  if (!html && atts.length === 0) {
    headers.push('Content-Type: text/plain; charset="UTF-8"');
    headers.push("Content-Transfer-Encoding: 7bit");
    const raw = headers.join("\r\n") + "\r\n\r\n" + text;
    return toBase64Url(raw);
  }

  // 2) No attachment -> multipart/alternative (text + html)
  if (atts.length === 0) {
    const altBoundary = `inr_alt_${Date.now()}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);

    const parts = [
      `--${altBoundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 7bit",
      "",
      text || "",
      "",
      `--${altBoundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: 7bit",
      "",
      html || (text ? `<pre>${text}</pre>` : ""),
      "",
      `--${altBoundary}--`,
      "",
    ].join("\r\n");

    const raw = headers.join("\r\n") + "\r\n\r\n" + parts;
    return toBase64Url(raw);
  }

  // 3) Attachments -> multipart/mixed + (alternative inside)
  const mixedBoundary = `inr_mixed_${Date.now()}`;
  const altBoundary = `inr_alt_${Date.now()}`;

  headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);

  const firstPart = [
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    "",
    `--${altBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    text || "",
    "",
    `--${altBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    html || (text ? `<pre>${text}</pre>` : ""),
    "",
    `--${altBoundary}--`,
    "",
  ].join("\r\n");

  const attachmentParts = atts
    .map((a) =>
      [
        `--${mixedBoundary}`,
        `Content-Type: ${a.mimeType}; name="${a.filename}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${a.filename}"`,
        "",
        wrap76(a.contentBase64),
        "",
      ].join("\r\n")
    )
    .join("\r\n");

  const ending = `--${mixedBoundary}--\r\n`;

  const raw = headers.join("\r\n") + "\r\n\r\n" + firstPart + attachmentParts + ending;
  return toBase64Url(raw);
}

// ---- refresh helpers (identique à ce que tu as sur /list) ----
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

async function gmailSend(token: string, raw: string, threadId?: string) {
  const body: any = { raw };
  if (threadId) body.threadId = threadId;

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  return { res, data };
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Support JSON ou multipart/form-data
  let to = "";
  let subject = "(sans objet)";
  let text = "";
  let html = "";
  let threadId = "";
  let accountId = "";
  let sendItemId = "";
  let sendType = "mail";
  let inReplyTo = "";
  let references = "";
  const attachments: Attachment[] = [];

  const ct = req.headers.get("content-type") || "";
  if (ct.includes("multipart/form-data")) {
    const fd = await req.formData();
    accountId = String(fd.get("accountId") || "").trim();
    sendItemId = String(fd.get("sendItemId") || "").trim();
    sendType = String(fd.get("type") || "mail").trim() || "mail";
    to = String(fd.get("to") || "").trim();
    subject = String(fd.get("subject") || "").trim() || "(sans objet)";
    text = String(fd.get("text") || "");
    html = String(fd.get("html") || "");
    threadId = String(fd.get("threadId") || "");
    inReplyTo = String(fd.get("inReplyTo") || "");
    references = String(fd.get("references") || "");

    const files = fd.getAll("files") as File[];
    for (const f of files) {
      const buf = Buffer.from(await f.arrayBuffer());
      attachments.push({
        filename: f.name,
        mimeType: f.type || "application/octet-stream",
        contentBase64: buf.toString("base64"),
      });
    }
  } else {
    const body = await req.json().catch(() => ({}));
    sendItemId = String(body.sendItemId || "").trim();
    sendType = String(body.type || "mail").trim() || "mail";
    to = String(body.to || "").trim();
    subject = String(body.subject || "").trim() || "(sans objet)";
    text = String(body.text || "");
    html = String(body.html || "");
    threadId = String(body.threadId || "");
    inReplyTo = String(body.inReplyTo || "");
    references = String(body.references || "");
  }

  if (!to) return NextResponse.json({ error: "Missing 'to'" }, { status: 400 });

  let q = supabase
    .from("mail_accounts")
    .select("id,access_token_enc,refresh_token_enc,expires_at,status,created_at")
    .eq("user_id", auth.user.id)
    .eq("provider", "gmail");

  if (typeof accountId === "string" && accountId.trim()) {
    q = q.eq("id", accountId.trim());
  }

  const { data: accounts, error: accErr } = await q.order("created_at", { ascending: true }).limit(1);

  if (accErr) return NextResponse.json({ error: accErr.message }, { status: 500 });

  const account = accounts?.[0];
  if (!account) return NextResponse.json({ error: "No Gmail connected" }, { status: 400 });

  // ✅ tokens bruts
  const accessTokenEnc: string | null = account.access_token_enc ?? null;
  const refreshToken: string | null = account.refresh_token_enc ?? null;

  // ✅ on garantit un string
  if (!accessTokenEnc) {
    return NextResponse.json({ error: "Missing access token" }, { status: 400 });
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

  const raw = buildMimeMessage({
    to,
    subject,
    text,
    html,
    inReplyTo: inReplyTo || undefined,
    references: references || undefined,
    attachments,
  });

  // ✅ accessToken est string ici
  let { res: sendRes, data: sendData } = await gmailSend(accessToken, raw, threadId || undefined);

  if ((sendRes.status === 401 || sendRes.status === 403) && refreshToken) {
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

      const retry = await gmailSend(accessToken, raw, threadId || undefined);
      sendRes = retry.res;
      sendData = retry.data;
    }
  }

  if (!sendRes.ok) {
    if (sendRes.status === 401 || sendRes.status === 403) {
      await supabase.from("mail_accounts").update({ status: "expired" }).eq("id", account.id);
    }
    return NextResponse.json(
      { error: "Gmail send failed", gmailStatus: sendRes.status, gmailError: sendData },
      { status: 502 }
    );
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
    body_html: html || null,
    provider: "gmail",
    provider_message_id: sendData?.id || null,
    provider_thread_id: sendData?.threadId || null,
    sent_at: new Date().toISOString(),
    error: null,
  };

  if (sendItemId) {
    await supabase.from("send_items").update(historyPayload).eq("id", sendItemId);
  } else {
    await supabase.from("send_items").insert(historyPayload);
  }


  return NextResponse.json({
    ok: true,
    id: sendData?.id || null,
    threadId: sendData?.threadId || null,
  });
}

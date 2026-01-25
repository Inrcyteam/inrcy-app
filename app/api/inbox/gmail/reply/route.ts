import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

function pickHeader(headers: any[], name: string) {
  return headers.find((h: any) => (h.name || "").toLowerCase() === name.toLowerCase())?.value || "";
}

function extractEmailLike(s: string) {
  // garde "Name <email>" si présent, sinon le mail seul, sinon brut
  const m = s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (!m) return s.trim();
  const hasAngle = s.includes("<") && s.includes(">");
  return hasAngle ? s.trim() : m;
}

function normalizeRe(subject: string) {
  const s = (subject || "").trim();
  if (!s) return "Re: (sans objet)";
  if (/^re:\s*/i.test(s)) return s;
  return `Re: ${s}`;
}

// refresh helpers (copié identique)
function isExpired(expires_at?: string | null, skewSeconds = 60) {
  if (!expires_at) return false;
  const t = Date.parse(expires_at);
  if (Number.isNaN(t)) return false;
  return t <= Date.now() + skewSeconds * 1000;
}
async function refreshAccessToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
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

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const messageId = searchParams.get("id");
  if (!messageId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = await createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ct = req.headers.get("content-type") || "";
  const fd = ct.includes("multipart/form-data") ? await req.formData() : null;

  const text = fd ? String(fd.get("text") || "") : String((await req.json().catch(() => ({}))).text || "");
  const html = fd ? String(fd.get("html") || "") : "";
  const files = fd ? (fd.getAll("files") as File[]) : [];

  const { data: accounts, error: accErr } = await supabase
    .from("mail_accounts")
    .select("id,access_token_enc,refresh_token_enc,expires_at,status,created_at")
    .eq("user_id", auth.user.id)
    .eq("provider", "gmail")
    .order("created_at", { ascending: true })
    .limit(1);

  if (accErr) return NextResponse.json({ error: accErr.message }, { status: 500 });
  const account = accounts?.[0];
  if (!account) return NextResponse.json({ error: "No Gmail connected" }, { status: 400 });

  let accessToken: string = account.access_token_enc;
  const refreshToken: string | null = account.refresh_token_enc ?? null;

  if (refreshToken && isExpired(account.expires_at)) {
    const r = await refreshAccessToken(refreshToken);
    if (r.ok && r.data?.access_token) {
      accessToken = r.data.access_token;
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

  // 1) Get metadata of original message
  const metaRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=Reply-To&metadataHeaders=Subject&metadataHeaders=Message-ID&metadataHeaders=References`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const meta = await metaRes.json().catch(() => ({}));
  if (!metaRes.ok) return NextResponse.json({ error: "Gmail meta failed", details: meta }, { status: 502 });

  const headers = meta?.payload?.headers || [];
  const from = pickHeader(headers, "Reply-To") || pickHeader(headers, "From");
  const to = extractEmailLike(from);
  const subject = normalizeRe(pickHeader(headers, "Subject"));
  const msgId = pickHeader(headers, "Message-ID");
  const refs = pickHeader(headers, "References");

  const references = [refs, msgId].filter(Boolean).join(" ").trim();

  // 2) Build FormData for /send (same MIME builder + PJ)
  const sendFd = new FormData();
  sendFd.append("to", to);
  sendFd.append("subject", subject);
  sendFd.append("text", text || "");
  if (html) sendFd.append("html", html);
  sendFd.append("threadId", String(meta.threadId || ""));
  if (msgId) sendFd.append("inReplyTo", msgId);
  if (references) sendFd.append("references", references);

  for (const f of files) sendFd.append("files", f);

  const sendRes = await fetch(new URL("/api/inbox/gmail/send", req.url), {
    method: "POST",
    body: sendFd,
    headers: { cookie: req.headers.get("cookie") || "" } as any,
  });

  const sendJson = await sendRes.json().catch(() => ({}));
  if (!sendRes.ok) return NextResponse.json(sendJson, { status: sendRes.status });

  return NextResponse.json({ ok: true, ...sendJson });
}

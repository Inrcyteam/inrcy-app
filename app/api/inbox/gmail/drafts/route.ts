import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

function toBase64Url(str: string) {
  return Buffer.from(str, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildPlain(to: string, subject: string, text: string) {
  const raw =
    `To: ${to}\r\n` +
    `Subject: ${subject}\r\n` +
    `MIME-Version: 1.0\r\n` +
    `Content-Type: text/plain; charset="UTF-8"\r\n` +
    `Content-Transfer-Encoding: 7bit\r\n\r\n` +
    `${text || ""}`;
  return toBase64Url(raw);
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

async function getToken(supabase: any, userId: string) {
  const { data: accounts } = await supabase
    .from("mail_accounts")
    .select("id,access_token_enc,refresh_token_enc,expires_at,status,created_at")
    .eq("user_id", userId)
    .eq("provider", "gmail")
    .order("created_at", { ascending: true })
    .limit(1);

  const account = accounts?.[0];
  if (!account) throw new Error("No Gmail connected");

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

  return { accessToken };
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const to = String(body.to || "").trim();
  const subject = String(body.subject || "").trim() || "(sans objet)";
  const text = String(body.text || "");

  if (!to) return NextResponse.json({ error: "Missing 'to'" }, { status: 400 });

  const { accessToken } = await getToken(supabase, auth.user.id);
  const raw = buildPlain(to, subject, text);

  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { raw } }),
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok) return NextResponse.json({ error: "Draft create failed", details: j }, { status: 502 });

  return NextResponse.json({ ok: true, draftId: j.id, messageId: j.message?.id });
}

export async function PUT(req: Request) {
  const { searchParams } = new URL(req.url);
  const draftId = searchParams.get("draftId");
  if (!draftId) return NextResponse.json({ error: "Missing draftId" }, { status: 400 });

  const supabase = await createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const to = String(body.to || "").trim();
  const subject = String(body.subject || "").trim() || "(sans objet)";
  const text = String(body.text || "");

  const { accessToken } = await getToken(supabase, auth.user.id);
  const raw = buildPlain(to, subject, text);

  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/drafts/${draftId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id: draftId, message: { raw } }),
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok) return NextResponse.json({ error: "Draft update failed", details: j }, { status: 502 });

  return NextResponse.json({ ok: true, draftId: j.id, messageId: j.message?.id });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const draftId = searchParams.get("draftId");
  if (!draftId) return NextResponse.json({ error: "Missing draftId" }, { status: 400 });

  const supabase = await createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { accessToken } = await getToken(supabase, auth.user.id);

  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/drafts/${draftId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    return NextResponse.json({ error: "Draft delete failed", details: j }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

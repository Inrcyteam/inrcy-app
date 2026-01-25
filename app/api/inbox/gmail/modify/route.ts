import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

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
  const supabase = await createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : [];
  const action: string = String(body.action || "");

  if (!ids.length) return NextResponse.json({ error: "Missing ids" }, { status: 400 });
  if (!action) return NextResponse.json({ error: "Missing action" }, { status: 400 });

  const { data: accounts } = await supabase
    .from("mail_accounts")
    .select("id,access_token_enc,refresh_token_enc,expires_at,status,created_at")
    .eq("user_id", auth.user.id)
    .eq("provider", "gmail")
    .order("created_at", { ascending: true })
    .limit(1);

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

  const headers = (token: string) => ({ Authorization: `Bearer ${token}` });

  const doOne = async (id: string) => {
    const base = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`;

    if (action === "trash") {
      return fetch(`${base}/trash`, { method: "POST", headers: headers(accessToken) });
    }
    if (action === "untrash") {
      return fetch(`${base}/untrash`, { method: "POST", headers: headers(accessToken) });
    }
    if (action === "delete") {
      return fetch(base, { method: "DELETE", headers: headers(accessToken) });
    }

    const addLabelIds: string[] = [];
    const removeLabelIds: string[] = [];

    if (action === "archive") removeLabelIds.push("INBOX");
    if (action === "spam") addLabelIds.push("SPAM"), removeLabelIds.push("INBOX");
    if (action === "unspam") removeLabelIds.push("SPAM"), addLabelIds.push("INBOX");
    if (action === "read") removeLabelIds.push("UNREAD");
    if (action === "unread") addLabelIds.push("UNREAD");
    if (action === "star") addLabelIds.push("STARRED");
    if (action === "unstar") removeLabelIds.push("STARRED");
    if (action === "important") addLabelIds.push("IMPORTANT");
    if (action === "unimportant") removeLabelIds.push("IMPORTANT");

    return fetch(`${base}/modify`, {
      method: "POST",
      headers: { ...headers(accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({ addLabelIds, removeLabelIds }),
    });
  };

  const results = await Promise.all(
    ids.map(async (id) => {
      const r = await doOne(id);
      const j = await r.json().catch(() => ({}));
      return { id, ok: r.ok, status: r.status, data: j };
    })
  );

  const anyFail = results.find((x) => !x.ok);
  if (anyFail) return NextResponse.json({ ok: false, results }, { status: 502 });

  return NextResponse.json({ ok: true, results });
}

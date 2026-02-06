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
  const action: string = String(body.action || "");

  // ✅ Multi-accounts: expected { action, batches: [{ accountId, ids: [...] }] }
  // Backward compat: { action, ids: [...] }
  const batchesIn: Array<{ accountId?: string; ids: string[] }> = Array.isArray(body.batches)
    ? body.batches
    : [{ accountId: body.accountId, ids: Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : [] }];

  const batches = batchesIn
    .map((b) => ({ accountId: String(b.accountId || "").trim(), ids: Array.isArray(b.ids) ? b.ids.filter(Boolean) : [] }))
    .filter((b) => b.ids.length > 0);

  if (!batches.length) return NextResponse.json({ error: "Missing ids" }, { status: 400 });
  if (!action) return NextResponse.json({ error: "Missing action" }, { status: 400 });

  const headers = (token: string) => ({ Authorization: `Bearer ${token}` });

  const doOne = async (token: string, id: string) => {
    const base = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`;

    if (action === "trash") {
      return fetch(`${base}/trash`, { method: "POST", headers: headers(token) });
    }
    if (action === "untrash") {
      return fetch(`${base}/untrash`, { method: "POST", headers: headers(token) });
    }
    if (action === "delete") {
      return fetch(base, { method: "DELETE", headers: headers(token) });
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
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify({ addLabelIds, removeLabelIds }),
    });
  };

  const results: any[] = [];

  for (const batch of batches) {
    // account lookup (explicit id, else fallback first)
    let q = supabase
      .from("mail_accounts")
      .select("id,email_address,access_token_enc,refresh_token_enc,expires_at,status,created_at")
      .eq("user_id", auth.user.id)
      .eq("provider", "gmail");
    if (batch.accountId) q = q.eq("id", batch.accountId);

    const { data: accRows, error: accErr } = await q.order("created_at", { ascending: true }).limit(1);
    if (accErr || !accRows?.[0]) {
      results.push({ accountId: batch.accountId, ok: false, status: 400, data: { error: accErr?.message || "No Gmail connected" } });
      continue;
    }

    const account = accRows[0];
    let accessToken: string | null = account.access_token_enc ?? null;
    const refreshToken: string | null = account.refresh_token_enc ?? null;
    if (!accessToken) {
      results.push({ accountId: account.id, ok: false, status: 400, data: { error: "Missing access token" } });
      continue;
    }

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

    const token = String(accessToken);

    const perIds = await Promise.all(
      batch.ids.map(async (id) => {
        const r = await doOne(token, id);
        const j = await r.json().catch(() => ({}));
        return { accountId: account.id, id, ok: r.ok, status: r.status, data: j };
      })
    );
    results.push(...perIds);
  }

  const anyFail = results.find((x) => !x.ok);
  if (anyFail) return NextResponse.json({ ok: false, results }, { status: 502 });

  return NextResponse.json({ ok: true, results });
}

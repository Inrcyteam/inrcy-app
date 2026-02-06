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

async function gmailListTrashIds(token: string, pageToken?: string) {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("labelIds", "TRASH");
  url.searchParams.set("maxResults", "500");
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function gmailBatchDelete(token: string, ids: string[]) {
  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/batchDelete",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids }),
    }
  );

  // batchDelete renvoie souvent vide si ok
  const text = await res.text().catch(() => "");
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  return { res, data };
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Optional: restrict to some accounts
  const body = await req.json().catch(() => ({}));
  const accountIds: string[] = Array.isArray(body.accountIds) ? body.accountIds.filter(Boolean) : [];

  let q = supabase
    .from("mail_accounts")
    .select("id,email_address,access_token_enc,refresh_token_enc,expires_at,status")
    .eq("user_id", auth.user.id)
    .eq("provider", "gmail")
    .order("created_at", { ascending: true })
    .limit(3);

  if (accountIds.length) q = q.in("id", accountIds);

  const { data: accounts, error: accErr } = await q;

  if (accErr) return NextResponse.json({ error: accErr.message }, { status: 500 });

  if (!accounts?.length) return NextResponse.json({ error: "No Gmail account connected" }, { status: 400 });

  const results: any[] = [];

  for (const account of accounts) {
    const accessTokenEnc: string | null = account.access_token_enc ?? null;
    if (!accessTokenEnc) {
      results.push({ accountId: account.id, email: account.email_address, ok: false, error: "Missing access token" });
      continue;
    }

    let accessToken: string = String(accessTokenEnc);
    const refreshToken: string | null = account.refresh_token_enc ?? null;

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

    // 1) récupérer tous les ids en TRASH (paginé)
    let allIds: string[] = [];
    let pageToken: string | undefined;

    for (let safety = 0; safety < 50; safety++) {
      const { res, data } = await gmailListTrashIds(accessToken, pageToken);
      if (!res.ok) {
        // retry après refresh si 401/403
        if ((res.status === 401 || res.status === 403) && refreshToken) {
          const r = await refreshAccessToken(refreshToken);
          if (r.ok && r.data?.access_token) {
            accessToken = String(r.data.access_token);
            const retry = await gmailListTrashIds(accessToken, pageToken);
            if (!retry.res.ok) {
              results.push({ accountId: account.id, email: account.email_address, ok: false, gmailStatus: retry.res.status, gmailError: retry.data });
              break;
            }
            const ids = (retry.data?.messages || []).map((m: any) => m.id).filter(Boolean);
            allIds.push(...ids);
            pageToken = retry.data?.nextPageToken;
            if (!pageToken) break;
            continue;
          }
        }
        results.push({ accountId: account.id, email: account.email_address, ok: false, gmailStatus: res.status, gmailError: data });
        break;
      }

      const ids = (data?.messages || []).map((m: any) => m.id).filter(Boolean);
      allIds.push(...ids);
      pageToken = data?.nextPageToken;
      if (!pageToken) break;
    }

    if (allIds.length === 0) {
      results.push({ accountId: account.id, email: account.email_address, ok: true, deleted: 0 });
      continue;
    }

    // 2) batchDelete par paquets (max 1000, mais 500 safe)
    const batches = chunk(allIds, 500);
    let deleted = 0;
    let failed = false;
    for (const ids of batches) {
      const { res, data } = await gmailBatchDelete(accessToken, ids);
      if (!res.ok) {
        results.push({ accountId: account.id, email: account.email_address, ok: false, gmailStatus: res.status, gmailError: data });
        failed = true;
        break;
      }
      deleted += ids.length;
    }
    if (!failed) results.push({ accountId: account.id, email: account.email_address, ok: true, deleted });
  }

  const anyFail = results.some((r) => !r.ok);
  return NextResponse.json({ ok: !anyFail, results }, { status: anyFail ? 502 : 200 });
}

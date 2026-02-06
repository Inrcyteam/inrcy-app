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

async function graphListTrashIds(token: string) {
  const url = new URL("https://graph.microsoft.com/v1.0/me/mailFolders/deleteditems/messages");
  url.searchParams.set("$select", "id");
  url.searchParams.set("$top", "50");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  const ids: string[] = Array.isArray(data?.value) ? data.value.map((x: any) => x?.id).filter(Boolean) : [];
  return { res, data, ids };
}

async function graphDeleteMessage(token: string, id: string) {
  return fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const accountIds: string[] = Array.isArray(body?.accountIds) ? body.accountIds : [];

  const { data: accounts, error: accErr } = await supabase
    .from("mail_accounts")
    .select("id,email_address,access_token_enc,refresh_token_enc,expires_at,status")
    .eq("user_id", auth.user.id)
    .eq("provider", "microsoft")
    .order("created_at", { ascending: true })
    .limit(3);

  if (accErr) return NextResponse.json({ error: accErr.message }, { status: 500 });
  if (!accounts?.length) return NextResponse.json({ error: "No Microsoft account connected" }, { status: 400 });

  const targets = accountIds.length ? accounts.filter((a) => accountIds.includes(a.id)) : accounts;

  const perAccount: any[] = [];
  for (const acc of targets) {
    let token: string | null = acc.access_token_enc ?? null;
    const refreshToken: string | null = acc.refresh_token_enc ?? null;
    if (!token) {
      perAccount.push({ accountId: acc.id, email: acc.email_address, error: "missing_access_token" });
      continue;
    }

    if (refreshToken && isExpired(acc.expires_at)) {
      const r = await refreshAccessToken(refreshToken);
      if (r.ok && r.data?.access_token) {
        token = String(r.data.access_token);
        const expiresAt = r.data?.expires_in ? new Date(Date.now() + Number(r.data.expires_in) * 1000).toISOString() : null;
        await supabase.from("mail_accounts").update({ access_token_enc: token, expires_at: expiresAt, status: "connected" }).eq("id", acc.id);
      }
    }

    let deleted = 0;
    let loops = 0;
    while (loops < 10) {
      loops += 1;
      let { res, data, ids } = await graphListTrashIds(String(token));

      if (!res.ok && (res.status === 401 || res.status === 403) && refreshToken) {
        const r = await refreshAccessToken(refreshToken);
        if (r.ok && r.data?.access_token) {
          token = String(r.data.access_token);
          const expiresAt = r.data?.expires_in ? new Date(Date.now() + Number(r.data.expires_in) * 1000).toISOString() : null;
          await supabase.from("mail_accounts").update({ access_token_enc: token, expires_at: expiresAt, status: "connected" }).eq("id", acc.id);
          const retry = await graphListTrashIds(String(token));
          res = retry.res;
          data = retry.data;
          ids = retry.ids;
        }
      }

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          await supabase.from("mail_accounts").update({ status: "expired" }).eq("id", acc.id);
        }
        perAccount.push({ accountId: acc.id, email: acc.email_address, error: "list_failed", graphStatus: res.status, graphError: data });
        break;
      }

      if (!ids.length) break;

      // delete en parallèle (50 max)
      const delRes = await Promise.all(ids.map((id) => graphDeleteMessage(String(token), id)));
      deleted += delRes.filter((r) => r.ok).length;

      // si beaucoup d'erreurs 401/403, on stop
      const hasAuthErr = delRes.some((r) => r.status === 401 || r.status === 403);
      if (hasAuthErr) {
        await supabase.from("mail_accounts").update({ status: "expired" }).eq("id", acc.id);
        break;
      }
    }

    perAccount.push({ accountId: acc.id, email: acc.email_address, deleted });
  }

  return NextResponse.json({ ok: true, results: perAccount });
}

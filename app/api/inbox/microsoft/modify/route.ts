import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

type Action =
  | "read"
  | "unread"
  | "important"
  | "unimportant"
  | "spam"
  | "unspam"
  | "trash"
  | "untrash"
  | "move";

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

function destFolderForAction(action: Action, moveTo?: string | null) {
  if (action === "spam") return "junkemail";
  if (action === "unspam") return "inbox";
  if (action === "trash") return "deleteditems";
  if (action === "untrash") return "inbox";
  if (action === "move") return (moveTo || "inbox").toLowerCase();
  return null;
}

async function graphPatchMessage(token: string, id: string, body: any) {
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function graphMoveMessage(token: string, id: string, destinationId: string) {
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(id)}/move`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ destinationId }),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const batches: Array<{ accountId: string; ids: string[]; action: Action; moveTo?: string }> =
    Array.isArray(body?.batches)
      ? body.batches
      : body?.accountId && Array.isArray(body?.ids)
      ? [{ accountId: body.accountId, ids: body.ids, action: body.action, moveTo: body.moveTo }]
      : [];

  if (!batches.length) {
    return NextResponse.json({ error: "Missing batches" }, { status: 400 });
  }

  const results: any[] = [];
  for (const b of batches) {
    const { accountId, ids, action, moveTo } = b;
    if (!accountId || !ids?.length || !action) continue;

    const { data: account, error: accErr } = await supabase
      .from("mail_accounts")
      .select("id,access_token_enc,refresh_token_enc,expires_at")
      .eq("user_id", auth.user.id)
      .eq("provider", "microsoft")
      .eq("id", accountId)
      .maybeSingle();

    if (accErr || !account) {
      results.push({ accountId, error: accErr?.message || "account_not_found" });
      continue;
    }

    let token: string | null = account.access_token_enc ?? null;
    const refreshToken: string | null = account.refresh_token_enc ?? null;
    if (!token) {
      results.push({ accountId, error: "missing_access_token" });
      continue;
    }

    if (refreshToken && isExpired(account.expires_at)) {
      const r = await refreshAccessToken(refreshToken);
      if (r.ok && r.data?.access_token) {
        token = String(r.data.access_token);
        const expiresAt = r.data?.expires_in
          ? new Date(Date.now() + Number(r.data.expires_in) * 1000).toISOString()
          : null;
        await supabase
          .from("mail_accounts")
          .update({ access_token_enc: token, expires_at: expiresAt, status: "connected" })
          .eq("id", accountId);
      }
    }

    const doForOne = async (messageId: string) => {
      let res: Response;
      let data: any;
      try {
        if (action === "read" || action === "unread") {
          ({ res, data } = await graphPatchMessage(String(token), messageId, { isRead: action === "read" }));
        } else if (action === "important" || action === "unimportant") {
          ({ res, data } = await graphPatchMessage(String(token), messageId, {
            flag: { flagStatus: action === "important" ? "flagged" : "notFlagged" },
          }));
        } else {
          const dest = destFolderForAction(action, moveTo ?? null);
          if (!dest) return { ok: false, id: messageId, error: "unsupported_action" };
          ({ res, data } = await graphMoveMessage(String(token), messageId, dest));
        }

        if (!res.ok && (res.status === 401 || res.status === 403) && refreshToken) {
          const r = await refreshAccessToken(refreshToken);
          if (r.ok && r.data?.access_token) {
            token = String(r.data.access_token);
            const expiresAt = r.data?.expires_in
              ? new Date(Date.now() + Number(r.data.expires_in) * 1000).toISOString()
              : null;
            await supabase
              .from("mail_accounts")
              .update({ access_token_enc: token, expires_at: expiresAt, status: "connected" })
              .eq("id", accountId);

            // retry once
            if (action === "read" || action === "unread") {
              ({ res, data } = await graphPatchMessage(String(token), messageId, { isRead: action === "read" }));
            } else if (action === "important" || action === "unimportant") {
              ({ res, data } = await graphPatchMessage(String(token), messageId, {
                flag: { flagStatus: action === "important" ? "flagged" : "notFlagged" },
              }));
            } else {
              const dest = destFolderForAction(action, moveTo ?? null);
              ({ res, data } = await graphMoveMessage(String(token), messageId, String(dest)));
            }
          }
        }

        if (!res.ok && (res.status === 401 || res.status === 403)) {
          await supabase.from("mail_accounts").update({ status: "expired" }).eq("id", accountId);
        }

        return { ok: res.ok, id: messageId, status: res.status, data };
      } catch (e: any) {
        return { ok: false, id: messageId, error: e?.message || "error" };
      }
    };

    const perId = await Promise.all((ids || []).map(doForOne));
    results.push({ accountId, action, results: perId });
  }

  return NextResponse.json({ ok: true, batches: results });
}

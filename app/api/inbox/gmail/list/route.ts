import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

/** Folder -> Gmail labelIds */
function folderToLabelIds(folder: string): string[] {
  switch ((folder || "").toLowerCase()) {
    case "inbox":
      return ["INBOX"];
    case "important":
      // "Importants" = étoilés (plus prévisible que le label IMPORTANT de Gmail)
      return ["STARRED"];
    case "trash":
      return ["TRASH"];
    case "spam":
      return ["SPAM"];
    case "sent":
      return ["SENT"];
    case "drafts":
      return ["DRAFT"];
    default:
      return ["INBOX"];
  }
}

function decodeBase64Url(input: string) {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, "base64").toString("utf8");
}

function extractPlainText(payload: any): string {
  if (!payload) return "";

  const data = payload?.body?.data;
  if (data) return decodeBase64Url(data);

  const parts = payload?.parts || [];
  for (const p of parts) {
    if (p?.mimeType === "text/plain" && p?.body?.data) {
      return decodeBase64Url(p.body.data);
    }
  }
  for (const p of parts) {
    const t = extractPlainText(p);
    if (t) return t;
  }
  return "";
}

function truncate(text: string, max = 1200) {
  const cleaned = (text || "").replace(/\s+/g, " ").trim();
  return cleaned.length > max ? cleaned.slice(0, max) + "…" : cleaned;
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

async function gmailList(token: string, folder: string) {
  const labelIds = folderToLabelIds(folder);
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("maxResults", "25");
  for (const l of labelIds) url.searchParams.append("labelIds", l);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json().catch(() => ({}));
  return { res, data };
}

export async function GET(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // folder depuis querystring (ex: ?folder=inbox)
  const { searchParams } = new URL(req.url);
  const folder = searchParams.get("folder") || "inbox";

  // ✅ Multi-boîtes Gmail : on liste toutes les boîtes connectées (max 3) et on agrège les messages.
  const { data: accounts, error: accErr } = await supabase
    .from("mail_accounts")
    .select("id,email_address,access_token_enc,refresh_token_enc,expires_at,status")
    .eq("user_id", auth.user.id)
    .eq("provider", "gmail")
    .order("created_at", { ascending: true })
    .limit(3);

  if (accErr) return NextResponse.json({ error: accErr.message }, { status: 500 });

  if (!accounts?.length) {
    return NextResponse.json({ error: "No Gmail account connected" }, { status: 400 });
  }

  const aggregated: any[] = [];
  const perAccountErrors: any[] = [];

  for (const account of accounts) {
    const accessTokenEnc: string | null = account.access_token_enc ?? null;
    const refreshToken: string | null = account.refresh_token_enc ?? null;

    if (!accessTokenEnc) {
      perAccountErrors.push({ accountId: account.id, email: account.email_address, error: "missing_access_token" });
      continue;
    }

    let accessToken: string = String(accessTokenEnc);

    // 1) refresh proactif si expires_at dépassé
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

    // 2) list
    let { res: listRes, data: listData } = await gmailList(accessToken, folder);

    // 3) si 401/403 -> refresh + retry une fois
    if ((listRes.status === 401 || listRes.status === 403) && refreshToken) {
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
        const retry = await gmailList(accessToken, folder);
        listRes = retry.res;
        listData = retry.data;
      }
    }

    if (!listRes.ok) {
      if (listRes.status === 401 || listRes.status === 403) {
        await supabase.from("mail_accounts").update({ status: "expired" }).eq("id", account.id);
      }
      perAccountErrors.push({
        accountId: account.id,
        email: account.email_address,
        gmailStatus: listRes.status,
        gmailError: listData,
      });
      continue;
    }

    const ids: string[] = (listData.messages || []).map((m: any) => m.id).filter(Boolean);

    const details = await Promise.all(
      ids.map(async (id) => {
        const r = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const j = await r.json().catch(() => ({}));
        return { ok: r.ok, id, data: j };
      })
    );

    const items = details
      .filter((d) => d.ok)
      .map((d) => {
        const headers = d.data?.payload?.headers || [];
        const getH = (name: string) =>
          headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";

        const body = truncate(extractPlainText(d.data?.payload), 1500);

        return {
          accountId: account.id,
          accountEmail: account.email_address,
          id: d.id,
          threadId: d.data?.threadId || null,
          labelIds: Array.isArray(d.data?.labelIds) ? d.data.labelIds : [],
          internalDate: d.data?.internalDate || null,
          from: getH("From"),
          subject: getH("Subject"),
          date: getH("Date"),
          snippet: d.data?.snippet || "",
          bodyPreview: body,
        };
      });

    aggregated.push(...items);
  }

  // tri : plus récent d'abord (fallback si internalDate manquant)
  aggregated.sort((a, b) => {
    const da = a.internalDate ? Number(a.internalDate) : 0;
    const db = b.internalDate ? Number(b.internalDate) : 0;
    return db - da;
  });

  return NextResponse.json({
    folder,
    items: aggregated,
    accounts: accounts.map((a) => ({ id: a.id, email: a.email_address })),
    errors: perAccountErrors,
  });
}

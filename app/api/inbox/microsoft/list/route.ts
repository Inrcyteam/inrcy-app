import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

type Folder = "inbox" | "important" | "sent" | "drafts" | "spam" | "trash";

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
      // scope est recommandé pour v2
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

function folderToGraphMailFolder(folder: Folder): string {
  switch ((folder || "inbox").toLowerCase()) {
    case "inbox":
    case "important":
      return "inbox";
    case "sent":
      return "sentitems";
    case "drafts":
      return "drafts";
    case "spam":
      return "junkemail";
    case "trash":
      return "deleteditems";
    default:
      return "inbox";
  }
}

async function graphListMessages(token: string, folder: Folder) {
  const mailFolder = folderToGraphMailFolder(folder);
  const url = new URL(`https://graph.microsoft.com/v1.0/me/mailFolders/${mailFolder}/messages`);
  // champs utiles pour iNrBox
  url.searchParams.set(
    "$select",
    [
      "id",
      "subject",
      "from",
      "sender",
      "receivedDateTime",
      "sentDateTime",
      "bodyPreview",
      "isRead",
      "flag",
    ].join(",")
  );
  url.searchParams.set("$top", "25");
  url.searchParams.set("$orderby", "receivedDateTime DESC");

  // important: on filtre sur les messages flaggés (plus stable que "importance")
  if (folder === "important") {
    url.searchParams.set("$filter", "flag/flagStatus eq 'flagged'");
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

export async function GET(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const folder = (searchParams.get("folder") || "inbox") as Folder;

  const { data: accounts, error: accErr } = await supabase
    .from("mail_accounts")
    .select("id,email_address,access_token_enc,refresh_token_enc,expires_at,status")
    .eq("user_id", auth.user.id)
    .eq("provider", "microsoft")
    .order("created_at", { ascending: true })
    .limit(3);

  if (accErr) return NextResponse.json({ error: accErr.message }, { status: 500 });
  if (!accounts?.length) return NextResponse.json({ error: "No Microsoft account connected" }, { status: 400 });

  const aggregated: any[] = [];
  const perAccountErrors: any[] = [];

  for (const account of accounts) {
    const refreshToken: string | null = account.refresh_token_enc ?? null;
    let accessToken: string | null = account.access_token_enc ?? null;

    if (!accessToken) {
      perAccountErrors.push({ accountId: account.id, email: account.email_address, error: "missing_access_token" });
      continue;
    }

    // proactive refresh
    if (refreshToken && isExpired(account.expires_at)) {
      const r = await refreshAccessToken(refreshToken);
      if (r.ok && r.data?.access_token) {
        accessToken = String(r.data.access_token);
        const expiresAt = r.data?.expires_in ? new Date(Date.now() + Number(r.data.expires_in) * 1000).toISOString() : null;
        await supabase
          .from("mail_accounts")
          .update({ access_token_enc: accessToken, expires_at: expiresAt, status: "connected" })
          .eq("id", account.id);
      }
    }

    let { res: listRes, data: listData } = await graphListMessages(String(accessToken), folder);

    if ((listRes.status === 401 || listRes.status === 403) && refreshToken) {
      const r = await refreshAccessToken(refreshToken);
      if (r.ok && r.data?.access_token) {
        accessToken = String(r.data.access_token);
        const expiresAt = r.data?.expires_in ? new Date(Date.now() + Number(r.data.expires_in) * 1000).toISOString() : null;
        await supabase
          .from("mail_accounts")
          .update({ access_token_enc: accessToken, expires_at: expiresAt, status: "connected" })
          .eq("id", account.id);
        const retry = await graphListMessages(String(accessToken), folder);
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
        graphStatus: listRes.status,
        graphError: listData,
      });
      continue;
    }

    const items = Array.isArray(listData?.value) ? listData.value : [];
    aggregated.push(
      ...items.map((m: any) => {
        const fromEmail = m?.from?.emailAddress?.address || m?.sender?.emailAddress?.address || "";
        const fromName = m?.from?.emailAddress?.name || m?.sender?.emailAddress?.name || "";
        const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
        const flagged = m?.flag?.flagStatus === "flagged";
        const receivedDateTime = m?.receivedDateTime || m?.sentDateTime || null;

        return {
          accountId: account.id,
          accountEmail: account.email_address,
          id: m?.id,
          subject: m?.subject || "(Sans objet)",
          from,
          receivedDateTime,
          bodyPreview: m?.bodyPreview || "",
          isRead: !!m?.isRead,
          flagged,
        };
      })
    );
  }

  aggregated.sort((a, b) => {
    const da = a.receivedDateTime ? Date.parse(a.receivedDateTime) : 0;
    const db = b.receivedDateTime ? Date.parse(b.receivedDateTime) : 0;
    return db - da;
  });

  return NextResponse.json({
    folder,
    items: aggregated,
    accounts: accounts.map((a) => ({ id: a.id, email: a.email_address })),
    errors: perAccountErrors,
  });
}

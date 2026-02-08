import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withImap } from "@/lib/imapClient";
import { decryptSecret } from "@/lib/imapCrypto";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  // Prefer server-only env var if present, otherwise fall back to NEXT_PUBLIC_* (common in this repo)
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const accountId = String(body?.accountId || "");

    if (!accountId) {
      return NextResponse.json({ error: "Missing accountId" }, { status: 400 });
    }

    // 1) Load the IMAP account row (service role, no user cookies needed)
    const { data: account, error } = await supabaseAdmin
      .from("mail_accounts")
      .select("id, user_id, provider, email_address, password_enc, imap_host, imap_port, imap_secure, last_uid")
      .eq("id", accountId)
      .eq("provider", "imap")
      .single();

    if (error || !account) {
      return NextResponse.json(
        { error: "Mail account not found" },
        { status: 404 }
      );
    }

    const password = decryptSecret(String(account.password_enc || ""));
    const imapCfg = {
      user: String(account.email_address || ""),
      password,
      host: String(account.imap_host || ""),
      port: Number(account.imap_port || 993),
      secure: !!account.imap_secure,
    };

    const lastUid = Number(account.last_uid || 0);
    let maxUid = lastUid;
    let fetched = 0;

    // 2) Fetch only new messages (UID > last_uid)
    await withImap(imapCfg, async (client) => {
      const lock = await client.getMailboxLock("INBOX");
      try {
        // Ensure mailbox state is available on all servers
        await client.mailboxOpen("INBOX");

        for await (const msg of client.fetch(
          { uid: `${lastUid + 1}:*` },
          { uid: true, envelope: true, flags: true, internalDate: true }
        )) {
          fetched++;
          if (typeof msg?.uid === "number") {
            maxUid = Math.max(maxUid, msg.uid);
          }
        }
      } finally {
        lock.release();
      }
    });

    // 3) Persist the cursor (last_uid). (You can insert emails here if you store them in DB)
    if (maxUid > lastUid) {
      await supabaseAdmin
        .from("mail_accounts")
        .update({ last_uid: maxUid })
        .eq("id", account.id);
    }

    return NextResponse.json({
      success: true,
      fetched,
      lastUid,
      newLastUid: maxUid,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "IMAP sync failed" },
      { status: 500 }
    );
  }
}

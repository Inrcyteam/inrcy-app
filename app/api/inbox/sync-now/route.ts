import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { withImap } from "@/lib/imapClient";
import { decryptSecret } from "@/lib/imapCrypto";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST() {
  try {
    // Auth user (cookie-based)
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Load the ONLY IMAP account
    const { data: account, error: e1 } = await supabaseAdmin
      .from("mail_accounts")
      .select("id, email_address, password_enc, imap_host, imap_port, imap_secure, last_uid, syncing_until")
      .eq("user_id", data.user.id)
      .eq("provider", "imap")
      .single();

    if (e1 || !account) {
      return NextResponse.json({ ok: true, message: "No IMAP account" });
    }

    // ---- Optional: anti double-sync lock (recommended) ----
    const now = Date.now();
    const syncingUntil = account.syncing_until ? new Date(account.syncing_until).getTime() : 0;

    if (syncingUntil > now) {
      return NextResponse.json({ ok: true, skipped: true, reason: "sync_in_progress" });
    }

    // lock for 55s
    await supabaseAdmin
      .from("mail_accounts")
      .update({ syncing_until: new Date(now + 55_000).toISOString() })
      .eq("id", account.id);

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

    await withImap(imapCfg, async (client) => {
      const lock = await client.getMailboxLock("INBOX");
      try {
        await client.mailboxOpen("INBOX");

        for await (const msg of client.fetch(
          { uid: `${lastUid + 1}:*` },
          { uid: true, envelope: true, flags: true, internalDate: true }
        )) {
          fetched++;
          const uid = (msg as any)?.uid;
          if (typeof uid === "number") maxUid = Math.max(maxUid, uid);
        }
      } finally {
        lock.release();
      }
    });

    if (maxUid > lastUid) {
      await supabaseAdmin.from("mail_accounts").update({ last_uid: maxUid }).eq("id", account.id);
    }

    // unlock
    await supabaseAdmin.from("mail_accounts").update({ syncing_until: null }).eq("id", account.id);

    return NextResponse.json({
      ok: true,
      fetched,
      lastUid,
      newLastUid: maxUid,
    });
  } catch (e: any) {
    // best effort unlock not possible without account id here
    return NextResponse.json({ error: e?.message || "sync-now failed" }, { status: 500 });
  }
}

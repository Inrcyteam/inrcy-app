import { NextResponse } from "next/server";
import { loadImapAccount } from "@/lib/imapAccount";
import { getMessageHtml } from "@/lib/imapClient";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = String(searchParams.get("accountId") || "");
    const folder = String(searchParams.get("folder") || "inbox");
    const uidRaw = searchParams.get("uid");

    const uid = uidRaw ? Number(uidRaw) : NaN;

    if (!accountId || !Number.isFinite(uid)) {
      return NextResponse.json(
        { error: "Missing accountId or uid" },
        { status: 400 }
      );
    }

    const acc: any = await loadImapAccount(accountId);
    if (!acc?.ok) {
      return NextResponse.json(
        { error: acc?.error || "Unauthorized" },
        { status: acc?.status || 401 }
      );
    }

    const { html, text } = await getMessageHtml(acc.imap, folder, uid);
    return NextResponse.json({ html, text });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "IMAP message failed" },
      { status: 500 }
    );
  }
}

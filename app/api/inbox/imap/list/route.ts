import { NextResponse } from "next/server";
import { loadImapAccount } from "@/lib/imapAccount";
import { listMessages } from "@/lib/imapClient";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = String(searchParams.get("accountId") || "");
    const folder = String(searchParams.get("folder") || "inbox");
    const limitParam = searchParams.get("limit");
    const limit = Math.min(200, Math.max(1, Number(limitParam || 40)));

    if (!accountId) {
      return NextResponse.json({ error: "Missing accountId" }, { status: 400 });
    }

    const acc: any = await loadImapAccount(accountId);
    if (!acc?.ok) {
      return NextResponse.json(
        { error: acc?.error || "Unauthorized" },
        { status: acc?.status || 401 }
      );
    }

    const items = await listMessages(acc.imap, folder, limit);
    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "IMAP list failed" },
      { status: 500 }
    );
  }
}

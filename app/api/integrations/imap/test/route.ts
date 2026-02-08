import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { withImap } from "@/lib/imapClient";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const login = String(body.login || "").trim();
    const password = String(body.password || "");
    const imap_host = String(body.imap_host || "").trim();
    const imap_port = Number(body.imap_port || 993);
    const imap_secure = !!body.imap_secure;
    const smtp_host = String(body.smtp_host || "").trim();
    const smtp_port = Number(body.smtp_port || 587);
    const smtp_secure = !!body.smtp_secure;
    const smtp_starttls = !!body.smtp_starttls;

    if (!login || !password) {
      return NextResponse.json({ error: "Identifiant et mot de passe requis" }, { status: 400 });
    }
    if (!imap_host || !smtp_host) {
      return NextResponse.json({ error: "IMAP/SMTP host requis" }, { status: 400 });
    }

    // IMAP connect
    await withImap(
      { user: login, password, host: imap_host, port: imap_port, secure: imap_secure },
      async (client) => {
        await client.mailboxOpen("INBOX");
        return true;
      }
    );

    // SMTP verify
    const transport = nodemailer.createTransport({
      host: smtp_host,
      port: smtp_port,
      secure: smtp_secure,
      auth: { user: login, pass: password },
      requireTLS: smtp_starttls,
    });
    await transport.verify();

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message || "Test IMAP impossible";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

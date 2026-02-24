import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { withImap } from "@/lib/imapClient";
import { requireUser } from "@/lib/requireUser";
import { withApi } from "@/lib/observability/withApi";

export const POST = withApi(async (req: Request) => {
  // This endpoint is intentionally protected: it accepts email credentials for connectivity checks.
  // Never allow it to be called anonymously.
  const { errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

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

    // Basic input validation (avoid abuse and weird payloads)
    if (login.length > 320 || password.length > 2048) {
      return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
    }
    if (imap_host.length > 255 || smtp_host.length > 255) {
      return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
    }

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

tls: process.env.NODE_ENV === "development"
  ? { rejectUnauthorized: false }
  : undefined,

    });
    await transport.verify();

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    // Don't leak provider/internal error details in production.
    const generic = "Test IMAP/SMTP impossible";
    const detail = process.env.NODE_ENV === "development" ? (e?.message || generic) : undefined;
    return NextResponse.json({ error: generic, detail }, { status: 400 });
  }
}, { route: "/api/integrations/imap/test" });

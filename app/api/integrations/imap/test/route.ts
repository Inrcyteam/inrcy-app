import { NextResponse } from "next/server";
import { buildUserFacingErrorBody, jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import nodemailer from "nodemailer";
import { withImap } from "@/lib/imapClient";
import { requireUser } from "@/lib/requireUser";
import { withApi } from "@/lib/observability/withApi";

function isCertificateError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /self-signed certificate|certificate chain|unable to verify the first certificate|unable to get local issuer certificate|certificate has expired|certificate not yet valid/i.test(message);
}

function translateMailConnectionError(error: unknown, fallback = "Test IMAP/SMTP impossible") {
  const message = error instanceof Error ? error.message : String(error || "");
  const lower = message.toLowerCase();
  if (isCertificateError(error)) return "Le serveur mail présente un certificat SSL non reconnu. La connexion sécurisée IMAP a été refusée.";
  if (/authentication failed|invalid login|535 5\.7\.1|username and password not accepted|login failed/i.test(lower)) return "Identifiant ou mot de passe incorrect pour ce serveur mail.";
  if (/econnrefused|enotfound|getaddrinfo|server is unreachable|connection timeout|timed out/i.test(lower)) return "Impossible de joindre le serveur mail. Vérifiez l'adresse du serveur et le port.";
  return fallback;
}

export const POST = withApi(async (req: Request) => {
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

    if (login.length > 320 || password.length > 2048) {
      return jsonUserFacingError("Paramètres invalides", { status: 400, code: "invalid_input" });
    }
    if (imap_host.length > 255 || smtp_host.length > 255) {
      return jsonUserFacingError("Paramètres invalides", { status: 400, code: "invalid_input" });
    }

    if (!login || !password) {
      return jsonUserFacingError("Identifiant et mot de passe requis", { status: 400, code: "invalid_input" });
    }
    if (!imap_host || !smtp_host) {
      return jsonUserFacingError("Merci de renseigner l’adresse du serveur de messagerie entrant et sortant.", { status: 400, code: "invalid_input" });
    }

    try {
      await withImap(
        { user: login, password, host: imap_host, port: imap_port, secure: imap_secure },
        async (client) => {
          await client.mailboxOpen("INBOX");
          return true;
        }
      );
    } catch (imapError) {
      if (isCertificateError(imapError)) {
        await withImap(
          { user: login, password, host: imap_host, port: imap_port, secure: imap_secure, tls: { rejectUnauthorized: false } },
          async (client) => {
            await client.mailboxOpen("INBOX");
            return true;
          }
        );
      } else {
        throw imapError;
      }
    }

    const transport = nodemailer.createTransport({
      host: smtp_host,
      port: smtp_port,
      secure: smtp_secure,
      auth: { user: login, pass: password },
      requireTLS: smtp_starttls,
      tls: process.env.NODE_ENV === "development" ? { rejectUnauthorized: false } : undefined,
    });
    await transport.verify();

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const friendly = translateMailConnectionError(e, "Test IMAP/SMTP impossible");
    const detail = process.env.NODE_ENV === "development" ? ((e instanceof Error ? e.message : String(e)) || friendly) : undefined;
    return NextResponse.json({ ...buildUserFacingErrorBody(friendly, { status: 400, code: "imap_test_failed" }), detail }, { status: 400 });
  }
}, { route: "/api/integrations/imap/test" });

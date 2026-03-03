import "server-only";

import nodemailer from "nodemailer";
import { optionalEnv, requireEnv } from "@/lib/env";

export type TxMail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export async function sendTxMail(mail: TxMail) {
  // Transactional SMTP (uses your existing SMTP settings, e.g. the same as Supabase Auth SMTP)
  const host = requireEnv("TX_SMTP_HOST");
  const port = Number(requireEnv("TX_SMTP_PORT"));
  const user = requireEnv("TX_SMTP_USER");
  const pass = requireEnv("TX_SMTP_PASS");

  const secureEnv = optionalEnv("TX_SMTP_SECURE", ""); // expects "true" or "false" if set
  const from = optionalEnv("TX_MAIL_FROM", user);

  // ✅ Local/dev often breaks on OVH chain because of TLS interception (AV/proxy) or cert chain quirks.
  // - In production: default strict (true)
  // - In dev/local: default relaxed (false)
  const isProd = process.env.NODE_ENV === "production";
  const tlsRejectUnauthorized =
    optionalEnv("TX_SMTP_TLS_REJECT_UNAUTHORIZED", isProd ? "true" : "false") !== "false";

  // If secure is explicitly set, honor it. Otherwise, default to port-based behavior (465 => true, else false).
  const secure =
    secureEnv === "true" ? true : secureEnv === "false" ? false : port === 465;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    // Timeouts help surface network issues quickly instead of hanging.
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
    tls: {
      rejectUnauthorized: tlsRejectUnauthorized,
    },
  });

  await transporter.sendMail({
    from,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
}
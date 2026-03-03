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

  const secure = optionalEnv("TX_SMTP_SECURE", "");
  const from = optionalEnv("TX_MAIL_FROM", user);

  // Some SMTP providers may require tweaking TLS verification depending on their cert chain.
  // Default is the safe behavior (verification ON).
  const tlsRejectUnauthorized = optionalEnv("TX_SMTP_TLS_REJECT_UNAUTHORIZED", "true") !== "false";

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: secure === "true" ? true : port === 465,
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

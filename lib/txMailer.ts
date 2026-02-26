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
  // Transactional SMTP (recommended: a dedicated SMTP provider)
  const host = requireEnv("TX_SMTP_HOST");
  const port = Number(requireEnv("TX_SMTP_PORT"));
  const user = requireEnv("TX_SMTP_USER");
  const pass = requireEnv("TX_SMTP_PASS");

  const secure = optionalEnv("TX_SMTP_SECURE", "");
  const from = optionalEnv("TX_MAIL_FROM", user);

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: secure === "true" ? true : port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
}

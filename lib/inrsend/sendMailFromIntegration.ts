import nodemailer from "nodemailer";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import MailComposer from "nodemailer/lib/mail-composer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { encryptToken, tryDecryptToken } from "@/lib/oauthCrypto";
import { appendRawMessage, type ImapConfig } from "@/lib/imapClient";
import { decryptSecret } from "@/lib/imapCrypto";
import { applyAutoSignatureToHtml, applyAutoSignatureToText, buildInrSendSignature, textToSimpleHtml } from "@/lib/inrsendSignature";

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return null;
}

function isExpired(expiresAt?: string | null, skewSeconds = 60) {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return false;
  return t <= Date.now() + skewSeconds * 1000;
}

function toBase64Url(str: string) {
  return Buffer.from(str, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function refreshGoogleAccessToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  if (!clientId || !clientSecret) {
    return { ok: false, status: 500, data: { error: "Configuration Gmail incomplète côté serveur." } };
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function refreshMicrosoftAccessToken(refreshToken: string, scope?: string | null) {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { ok: false, status: 500, data: { error: "Configuration Outlook incomplète côté serveur." } };
  }

  const fallbackScope = [
    "openid",
    "profile",
    "email",
    "offline_access",
    "Mail.Read",
    "Mail.ReadWrite",
    "Mail.Send",
  ].join(" ");

  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: scope || fallbackScope,
    }),
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function buildSimpleGmailRaw(from: string, to: string, subject: string, text: string, html: string) {
  const altBoundary = `inr_alt_${Date.now()}`;
  const headers = [
    from ? `From: ${from}` : "",
    `To: ${to}`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary=\"${altBoundary}\"`,
  ];

  const parts = [
    `--${altBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    text || "",
    "",
    `--${altBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    html || (text ? `<pre>${text}</pre>` : ""),
    "",
    `--${altBoundary}--`,
    "",
  ].join("\r\n");

  return toBase64Url(headers.filter(Boolean).join("\r\n") + "\r\n\r\n" + parts);
}

async function sendViaGmail(account: Record<string, unknown>, to: string, subject: string, text: string, html: string) {
  const accountId = asString(account.id) || "";
  const accessTokenPlain = tryDecryptToken(asString(account.access_token_enc));
  const refreshTokenPlain = tryDecryptToken(asString(account.refresh_token_enc));
  if (!accessTokenPlain) throw new Error("Jeton Gmail manquant.");

  let accessToken = accessTokenPlain;
  if (refreshTokenPlain && isExpired(asString(account.expires_at))) {
    const r = await refreshGoogleAccessToken(refreshTokenPlain);
    if (r.ok && r.data?.access_token) {
      accessToken = String(r.data.access_token);
      const expiresAt = r.data.expires_in != null ? new Date(Date.now() + Number(r.data.expires_in) * 1000).toISOString() : null;
      await supabaseAdmin.from("integrations").update({ access_token_enc: encryptToken(accessToken), expires_at: expiresAt, status: "connected" }).eq("id", accountId);
    }
  }

  const from = asString(account.account_email) || "";
  const raw = buildSimpleGmailRaw(from, to, subject, text, html);
  let sendRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });

  if ((sendRes.status === 401 || sendRes.status === 403) && refreshTokenPlain) {
    const r = await refreshGoogleAccessToken(refreshTokenPlain);
    if (r.ok && r.data?.access_token) {
      accessToken = String(r.data.access_token);
      const expiresAt = r.data.expires_in != null ? new Date(Date.now() + Number(r.data.expires_in) * 1000).toISOString() : null;
      await supabaseAdmin.from("integrations").update({ access_token_enc: encryptToken(accessToken), expires_at: expiresAt, status: "connected" }).eq("id", accountId);
      sendRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      });
    }
  }

  if (!sendRes.ok) {
    if (sendRes.status === 401 || sendRes.status === 403) {
      await supabaseAdmin.from("integrations").update({ status: "expired" }).eq("id", accountId);
    }
    const data = await sendRes.text().catch(() => "");
    throw new Error(`Envoi Gmail impossible (${sendRes.status}) ${data}`.trim());
  }
}

async function sendViaMicrosoft(account: Record<string, unknown>, to: string, subject: string, html: string) {
  const accountId = asString(account.id) || "";
  const settings = asRecord(account.settings);
  const scopesRaw = asString(settings.scopes_raw);
  const refreshTokenPlain = tryDecryptToken(asString(account.refresh_token_enc));
  let accessToken = tryDecryptToken(asString(account.access_token_enc));
  if (!accessToken) throw new Error("Jeton Outlook manquant.");

  if (refreshTokenPlain && isExpired(asString(account.expires_at))) {
    const r = await refreshMicrosoftAccessToken(refreshTokenPlain, scopesRaw);
    if (r.ok && r.data?.access_token) {
      accessToken = String(r.data.access_token);
      const expiresAt = r.data.expires_in != null ? new Date(Date.now() + Number(r.data.expires_in) * 1000).toISOString() : null;
      await supabaseAdmin.from("integrations").update({ access_token_enc: encryptToken(accessToken), expires_at: expiresAt, status: "connected" }).eq("id", accountId);
    }
  }

  const graphRes = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems: true,
    }),
  });

  if (!graphRes.ok) {
    const details = await graphRes.text().catch(() => "");
    throw new Error(`Envoi Outlook impossible (${graphRes.status}) ${details}`.trim());
  }
}

async function sendViaImap(account: Record<string, unknown>, to: string, subject: string, text: string, html: string) {
  const settings = asRecord(account.settings);
  const imapSettings = asRecord(settings.imap);
  const smtp = asRecord(settings.smtp);
  const login = asString(account.account_email) || "";
  const passwordEnc = asString(account.refresh_token_enc) || "";
  const password = passwordEnc ? decryptSecret(passwordEnc) : "";
  const imap = {
    user: login,
    password,
    host: String(imapSettings.host || ""),
    port: Number(imapSettings.port || 993),
    secure: typeof imapSettings.secure === "boolean" ? Boolean(imapSettings.secure) : Number(imapSettings.port || 993) === 993,
  };
  if (!smtp.host || !smtp.port || !login || !password) {
    throw new Error("Configuration SMTP IMAP incomplète.");
  }

  const secure = typeof smtp.secure === "boolean" ? Boolean(smtp.secure) : Number(smtp.port) === 465;
  const transporter = nodemailer.createTransport({
    host: String(smtp.host),
    port: Number(smtp.port),
    secure,
    auth: { user: login, pass: password },
    requireTLS: !!smtp.starttls,
    tls: process.env.NODE_ENV === "development" ? { rejectUnauthorized: false } : undefined,
  });

  const fromName = String(imap.user || login);
  const from = `"${fromName}" <${login}>`;
  await transporter.sendMail({ from, to, subject, text, html });

  try {
    const raw = await new Promise<Buffer>((resolve, reject) => {
      const mc = new MailComposer({ from, to, subject, text, html, date: new Date() });
      mc.compile().build((err: unknown, message: Buffer) => {
        if (err) return reject(err);
        resolve(message);
      });
    });

    const imapCfg: ImapConfig = {
      user: String(imap.user || ""),
      password: String(imap.password || ""),
      host: String(imap.host || ""),
      port: Number(imap.port || 0),
      secure: typeof imap.secure === "boolean" ? Boolean(imap.secure) : Number(imap.port) === 993,
    };

    if (imapCfg.host && imapCfg.port && imapCfg.user && imapCfg.password) {
      await appendRawMessage(imapCfg, "sent", raw);
    }
  } catch {
    // best effort only
  }
}

export async function sendMailFromIntegration(params: {
  userId: string;
  accountId: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  includeAutoSignature?: boolean;
}) {
  const { userId, accountId, to, subject } = params;
  const accountQuery = await supabaseAdmin
    .from("integrations")
    .select("id,user_id,provider,category,status,account_email,access_token_enc,refresh_token_enc,expires_at,settings")
    .eq("id", accountId)
    .eq("user_id", userId)
    .eq("category", "mail")
    .maybeSingle();

  if (accountQuery.error) throw accountQuery.error;
  const account = asRecord(accountQuery.data);
  const provider = asString(account.provider);
  const status = asString(account.status) || "connected";
  if (!provider || !account.id) throw new Error("Boîte d’envoi introuvable.");
  if (status !== "connected") throw new Error("Boîte d’envoi non connectée.");

  const baseText = params.text || "";
  const baseHtml = params.html || textToSimpleHtml(baseText);
  const includeAutoSignature = params.includeAutoSignature !== false;

  let finalText = baseText;
  let finalHtml = baseHtml;

  if (includeAutoSignature) {
    const signature = await buildInrSendSignature({ supabase: supabaseAdmin as any, userId, account });
    finalText = applyAutoSignatureToText(baseText, signature.signatureText);
    finalHtml = applyAutoSignatureToHtml(baseHtml, signature.signatureText, signature.imageUrl, signature.imageWidth);
  }

  if (provider === "gmail") {
    await sendViaGmail(account, to, subject, finalText, finalHtml);
    return { provider };
  }
  if (provider === "microsoft") {
    await sendViaMicrosoft(account, to, subject, finalHtml);
    return { provider };
  }
  if (provider === "imap") {
    await sendViaImap(account, to, subject, finalText, finalHtml);
    return { provider };
  }

  throw new Error("Provider de messagerie non supporté.");
}

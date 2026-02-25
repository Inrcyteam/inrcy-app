import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import nodemailer from "nodemailer";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - nodemailer exposes this internal helper and it's stable in practice
import MailComposer from "nodemailer/lib/mail-composer";
import { loadImapAccount } from "@/lib/imapAccount";
import { appendRawMessage, type ImapConfig } from "@/lib/imapClient";
import { withApi } from "@/lib/observability/withApi";
import { asRecord, asString, asHttpStatus, safeErrorMessage } from "@/lib/tsSafe";


// IMAP + SMTP require Node.js runtime (Edge runtime can't open raw TCP sockets)
export const runtime = "nodejs";

const handler = async (req: Request) => {
  try {
    const { supabase, user, errorResponse } = await requireUser();
    if (errorResponse) return errorResponse;
    const userId = user.id;
    const formData = await req.formData();
    const accountId = String(formData.get("accountId") || "").trim();
    const sendItemId = String(formData.get("sendItemId") || "").trim();
    const sendType = String(formData.get("type") || "mail").trim() || "mail";
    const to = String(formData.get("to") || "").trim();
    const subject = String(formData.get("subject") || "(sans objet)");
    const text = String(formData.get("text") || "");
    const html = String(formData.get("html") || "").trim();

    if (!accountId) {
      return NextResponse.json({ error: "Missing 'accountId' (sending mailbox)" }, { status: 400 });
    }
    if (!to) {
      return NextResponse.json({ error: "Missing 'to'" }, { status: 400 });
    }

    const acc: unknown = await loadImapAccount(accountId);
    const accRec = asRecord(acc);
    if (!accRec["ok"]) {
      return NextResponse.json(
        { error: asString(accRec["error"]) || "Unauthorized" },
        { status: asHttpStatus(accRec["status"], 401) }
      );
    }

    const files = formData.getAll("files") as File[];
    const attachments = await Promise.all(
      (files || [])
        .filter((f) => f && typeof asRecord(f)["arrayBuffer"] === "function")
        .map(async (f) => {
          const ab = await f.arrayBuffer();
          return {
            filename: f.name || "piece-jointe",
            content: Buffer.from(ab),
            contentType: f.type || undefined,
          };
        })
    );

    // loadImapAccount() returns { smtp: { user, password, host, port, secure, starttls } }
    const smtp = asRecord(accRec["smtp"]);
    const imap = asRecord(accRec["imap"]);

    const imapCfg: ImapConfig = {
      user: String(imap.user || ""),
      password: String(imap.password || ""),
      host: String(imap.host || ""),
      port: Number(imap.port || 0),
      secure: typeof imap.secure === "boolean" ? imap.secure : Number(imap.port) === 993,
    };

    // Strict validation: IMAP alone is not enough, SMTP is required to send
    if (!smtp?.host || !smtp?.port || !smtp?.user || !smtp?.password) {
      return NextResponse.json(
        { error: "SMTP config missing (host/port/user/password)" },
        { status: 400 }
      );
    }

    const secure = typeof smtp.secure === "boolean" ? smtp.secure : Number(smtp.port) === 465;

    const transporter = nodemailer.createTransport({
      host: String(smtp.host),
      port: Number(smtp.port),
      secure,
      auth: { user: String(smtp.user), pass: String(smtp.password) },

      // STARTTLS (usually port 587)
      requireTLS: !!smtp.starttls,

      // DEV only: avoid self-signed certificate issues on some providers
      tls:
        process.env.NODE_ENV === "development"
          ? { rejectUnauthorized: false }
          : undefined,
    });

    const fromName = String(imapCfg.user || smtp.user);
    const from = `"${fromName}" <${String(smtp.user)}>`;

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      attachments,
    });

    // IMPORTANT: SMTP send does NOT automatically create a copy in IMAP "Sent" on many providers (OVH/SFR/...)
    // So we build a raw MIME and append it to the Sent mailbox through IMAP.
    try {
      const raw = await new Promise<Buffer>((resolve, reject) => {
        const mc = new MailComposer({
          from,
          to,
          subject,
          text,
          attachments,
          // Keep a simple, widely supported encoding
          date: new Date(),
        });
        mc.compile().build((err: unknown, message: Buffer) => {
          if (err) return reject(err);
          resolve(message);
        });
      });

      // Best-effort: do not fail the whole request if append fails
      // Only attempt IMAP append when the config looks valid
      if (imapCfg.host && imapCfg.port && imapCfg.user && imapCfg.password) {
        await appendRawMessage(imapCfg, "sent", raw);
      }
    } catch {
      // ignore
    }

    // --- iNr'Send history (Supabase) ---
    const historyPayload = {
      user_id: userId,
      integration_id: accountId,
      type: (sendType as unknown) || "mail",
      status: "sent",
      to_emails: to,
      subject: subject || null,
      body_text: text || null,
      body_html: html || null,
      provider: "imap",
      provider_message_id: info?.messageId || null,
      provider_thread_id: null,
      sent_at: new Date().toISOString(),
      error: null,
    };

    if (sendItemId) {
      await supabase.from("send_items").update(historyPayload).eq("id", sendItemId);
    } else {
      await supabase.from("send_items").insert(historyPayload);
    }

    // Keep only the latest 20 SENT items in history (trash removed).
    try {
      const { data: recent } = await supabase
        .from("send_items")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "sent")
        .order("created_at", { ascending: false })
        .limit(60);

      const ids = (recent || []).map((r: Record<string, unknown>) => r.id).filter(Boolean);
      if (ids.length > 20) {
        const toDelete = ids.slice(20);
        await supabase.from("send_items").delete().in("id", toDelete);
      }
    } catch {
      // Never block sending
    }

    return NextResponse.json({ success: true, id: info.messageId });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: safeErrorMessage(e) || "IMAP send failed" },
      { status: 500 }
    );
  }
};

export const POST = withApi(handler, { route: "/api/inbox/imap/send" });
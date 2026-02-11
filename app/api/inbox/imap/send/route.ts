import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import nodemailer from "nodemailer";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - nodemailer exposes this internal helper and it's stable in practice
import MailComposer from "nodemailer/lib/mail-composer";
import { loadImapAccount } from "@/lib/imapAccount";
import { appendRawMessage } from "@/lib/imapClient";

// IMAP + SMTP require Node.js runtime (Edge runtime can't open raw TCP sockets)
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const accountId = String(formData.get("accountId") || "");
    const sendItemId = String(formData.get("sendItemId") || "").trim();
    const sendType = String(formData.get("type") || "mail").trim() || "mail";
    const to = String(formData.get("to") || "").trim();
    const subject = String(formData.get("subject") || "(sans objet)");
    const text = String(formData.get("text") || "");
const html = String(formData.get("html") || "").trim();

    if (!accountId || !to) {
      return NextResponse.json({ error: "Missing accountId or to" }, { status: 400 });
    }

    const acc: any = await loadImapAccount(accountId);
    if (!acc?.ok) {
      return NextResponse.json(
        { error: acc?.error || "Unauthorized" },
        { status: acc?.status || 401 }
      );
    }

    const files = formData.getAll("files") as File[];
    const attachments = await Promise.all(
      (files || [])
        .filter((f) => f && typeof (f as any).arrayBuffer === "function")
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
    const smtp = acc.smtp;

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

    const info = await transporter.sendMail({
      from: `"${String(acc?.imap?.user || smtp.user)}" <${String(smtp.user)}>`,
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
          from: `"${String(acc?.imap?.user || smtp.user)}" <${String(smtp.user)}>` ,
          to,
          subject,
          text,
          attachments,
          // Keep a simple, widely supported encoding
          date: new Date(),
        });
        mc.compile().build((err: any, message: Buffer) => {
          if (err) return reject(err);
          resolve(message);
        });
      });

      // Best-effort: do not fail the whole request if append fails
      await appendRawMessage(acc.imap, "sent", raw);
    } catch {
      // ignore
    }

    // --- iNr'Send history (Supabase) ---
    const historyPayload = {
      user_id: auth.user.id,
      mail_account_id: accountId || null,
      type: (sendType as any) || "mail",
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

    return NextResponse.json({ success: true, id: info.messageId });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "IMAP send failed" },
      { status: 500 }
    );
  }
}
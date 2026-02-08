import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { loadImapAccount } from "@/lib/imapAccount";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const accountId = String(formData.get("accountId") || "");
    const to = String(formData.get("to") || "").trim();
    const subject = String(formData.get("subject") || "(sans objet)");
    const text = String(formData.get("text") || "");

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

    const smtp = acc.smtp;

    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.password },
      requireTLS: smtp.starttls,
    });

    const info = await transport.sendMail({
      from: smtp.user,
      to,
      subject,
      text,
      attachments,
    });

    return NextResponse.json({ success: true, id: info.messageId });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "IMAP send failed" },
      { status: 500 }
    );
  }
}
